/**
 * Production-ready Phone Verification Service
 * Handles phone number verification with SMS integration, rate limiting, and security
 */
const { setCache, getCache } = require('../utils/redis');
const phoneService = require('./phoneService');
const crypto = require('crypto');

class PhoneVerificationService {
  constructor() {
    // Configuration
    this.config = {
      codeLength: 6,
      codeExpiry: 10 * 60, // 10 minutes
      maxAttempts: 3,
      resendCooldown: 60, // 1 minute
      maxResends: 5,
      blockDuration: 24 * 60 * 60, // 24 hours
      // SMS Provider settings
      smsProvider: process.env.SMS_PROVIDER || 'mock', // 'twilio', 'aws_sns', 'termii', 'mock'
    };
  }

  /**
   * Generate a secure verification code
   * @returns {string} 6-digit verification code
   */
  generateVerificationCode() {
    // Use crypto for better randomness
    const randomBytes = crypto.randomBytes(3);
    const code = parseInt(randomBytes.toString('hex'), 16) % 1000000;
    return code.toString().padStart(6, '0');
  }

  /**
   * Get verification cache key
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} type - verification type ('register', 'login', 'password_reset')
   * @returns {string} cache key
   */
  getVerificationKey(phoneNumber, type = 'register') {
    return `phone_verify:${type}:${phoneNumber}`;
  }

  /**
   * Get rate limiting cache key
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} action - action type ('send', 'verify')
   * @returns {string} cache key
   */
  getRateLimitKey(phoneNumber, action) {
    return `phone_rate:${action}:${phoneNumber}`;
  }

  /**
   * Check if phone number is rate limited
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} action - action type ('send', 'verify')
   * @returns {Object} rate limit status
   */
  async checkRateLimit(phoneNumber, action) {
    const key = this.getRateLimitKey(phoneNumber, action);
    const attempts = await getCache(key) || 0;
    
    const limits = {
      send: { max: this.config.maxResends, window: 60 * 60 }, // 5 sends per hour
      verify: { max: this.config.maxAttempts, window: 60 * 60 } // 3 verifications per hour
    };
    
    const limit = limits[action];
    if (!limit) return { allowed: true };
    
    if (attempts >= limit.max) {
      const ttl = await this.getCacheTTL(key);
      return {
        allowed: false,
        resetIn: ttl,
        attemptsRemaining: 0
      };
    }
    
    return {
      allowed: true,
      attemptsRemaining: limit.max - attempts
    };
  }

  /**
   * Increment rate limit counter
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} action - action type
   */
  async incrementRateLimit(phoneNumber, action) {
    const key = this.getRateLimitKey(phoneNumber, action);
    const attempts = await getCache(key) || 0;
    const limits = {
      send: 60 * 60,
      verify: 60 * 60
    };
    await setCache(key, attempts + 1, limits[action]);
  }

  /**
   * Send verification code
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} type - verification type
   * @param {Object} options - additional options
   * @returns {Object} send result
   */
  async sendVerificationCode(phoneNumber, type = 'register', options = {}) {
    try {
      // Check rate limiting for sending
      const sendRateLimit = await this.checkRateLimit(phoneNumber, 'send');
      if (!sendRateLimit.allowed) {
        return {
          success: false,
          error: 'TOO_MANY_REQUESTS',
          message: `Too many SMS requests. Try again in ${Math.ceil(sendRateLimit.resetIn / 60)} minutes.`,
          resetIn: sendRateLimit.resetIn
        };
      }

      // Check if there's a recent code that hasn't expired
      const existingData = await this.getVerificationData(phoneNumber, type);
      if (existingData && existingData.resendCooldownUntil > Date.now()) {
        const cooldownSeconds = Math.ceil((existingData.resendCooldownUntil - Date.now()) / 1000);
        return {
          success: false,
          error: 'RESEND_COOLDOWN',
          message: `Please wait ${cooldownSeconds} seconds before requesting a new code.`,
          cooldownSeconds
        };
      }

      // Generate new verification code
      const code = this.generateVerificationCode();
      const expiresAt = Date.now() + (this.config.codeExpiry * 1000);
      const resendCooldownUntil = Date.now() + (this.config.resendCooldown * 1000);

      // Prepare verification data
      const verificationData = {
        code,
        type,
        expiresAt,
        resendCooldownUntil,
        attempts: 0,
        resendCount: (existingData?.resendCount || 0) + 1,
        createdAt: Date.now(),
        lastSentAt: Date.now(),
        ...(options.metadata && { metadata: options.metadata })
      };

      // Store verification data
      await this.setVerificationData(phoneNumber, type, verificationData);

      // Send SMS
      const smsResult = await this.sendSMS(phoneNumber, code, type, options);
      
      if (!smsResult.success) {
        return {
          success: false,
          error: 'SMS_SEND_FAILED',
          message: 'Failed to send verification code. Please try again.',
          details: smsResult.error
        };
      }

      // Increment rate limit
      await this.incrementRateLimit(phoneNumber, 'send');

      return {
        success: true,
        message: 'Verification code sent successfully.',
        expiresIn: this.config.codeExpiry,
        resendCooldown: this.config.resendCooldown,
        attemptsRemaining: sendRateLimit.attemptsRemaining - 1,
        resendCount: verificationData.resendCount
      };

    } catch (error) {
      console.error('Send verification code error:', error);
      return {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error. Please try again later.'
      };
    }
  }

  /**
   * Verify phone number with code
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} code - verification code
   * @param {string} type - verification type
   * @returns {Object} verification result
   */
  async verifyCode(phoneNumber, code, type = 'register') {
    try {
      // Check rate limiting for verification
      const verifyRateLimit = await this.checkRateLimit(phoneNumber, 'verify');
      if (!verifyRateLimit.allowed) {
        return {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: `Too many verification attempts. Try again in ${Math.ceil(verifyRateLimit.resetIn / 60)} minutes.`,
          resetIn: verifyRateLimit.resetIn
        };
      }

      // Get verification data
      const verificationData = await this.getVerificationData(phoneNumber, type);
      
      if (!verificationData) {
        return {
          success: false,
          error: 'NO_VERIFICATION_FOUND',
          message: 'No verification code found. Please request a new code.'
        };
      }

      // Check if code has expired
      if (Date.now() > verificationData.expiresAt) {
        await this.clearVerificationData(phoneNumber, type);
        return {
          success: false,
          error: 'CODE_EXPIRED',
          message: 'Verification code has expired. Please request a new code.'
        };
      }

      // Check attempts
      if (verificationData.attempts >= this.config.maxAttempts) {
        await this.clearVerificationData(phoneNumber, type);
        return {
          success: false,
          error: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum verification attempts exceeded. Please request a new code.'
        };
      }

      // Verify code
      if (verificationData.code !== code.toString()) {
        // Increment attempts
        verificationData.attempts += 1;
        await this.setVerificationData(phoneNumber, type, verificationData);
        await this.incrementRateLimit(phoneNumber, 'verify');

        const attemptsLeft = this.config.maxAttempts - verificationData.attempts;
        return {
          success: false,
          error: 'INVALID_CODE',
          message: `Invalid verification code. ${attemptsLeft} attempts remaining.`,
          attemptsRemaining: attemptsLeft
        };
      }

      // Success - clear verification data
      await this.clearVerificationData(phoneNumber, type);
      
      // Clear rate limits on successful verification
      await this.clearRateLimit(phoneNumber, 'send');
      await this.clearRateLimit(phoneNumber, 'verify');

      return {
        success: true,
        message: 'Phone number verified successfully.',
        verifiedAt: new Date().toISOString(),
        metadata: verificationData.metadata
      };

    } catch (error) {
      console.error('Verify code error:', error);
      return {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error. Please try again later.'
      };
    }
  }

  /**
   * Get verification data from cache
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} type - verification type
   * @returns {Object|null} verification data
   */
  async getVerificationData(phoneNumber, type) {
    const key = this.getVerificationKey(phoneNumber, type);
    const data = await getCache(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Set verification data in cache
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} type - verification type
   * @param {Object} data - verification data
   */
  async setVerificationData(phoneNumber, type, data) {
    const key = this.getVerificationKey(phoneNumber, type);
    await setCache(key, JSON.stringify(data), this.config.codeExpiry);
  }

  /**
   * Clear verification data
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} type - verification type
   */
  async clearVerificationData(phoneNumber, type) {
    const key = this.getVerificationKey(phoneNumber, type);
    await setCache(key, null, 0);
  }

  /**
   * Clear rate limit
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} action - action type
   */
  async clearRateLimit(phoneNumber, action) {
    const key = this.getRateLimitKey(phoneNumber, action);
    await setCache(key, null, 0);
  }

  /**
   * Get cache TTL (time to live)
   * @param {string} key - cache key
   * @returns {number} TTL in seconds
   */
  async getCacheTTL(key) {
    // This would need to be implemented based on your Redis client
    // For now, return default
    return 3600;
  }

  /**
   * Send SMS based on configured provider
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} code - verification code
   * @param {string} type - verification type
   * @param {Object} options - additional options
   * @returns {Object} SMS send result
   */
  async sendSMS(phoneNumber, code, type, options = {}) {
    const message = this.generateSMSMessage(code, type, options);
    
    switch (this.config.smsProvider) {
      case 'twilio':
        return await this.sendTwilioSMS(phoneNumber, message);
      case 'aws_sns':
        return await this.sendAWSSNS(phoneNumber, message);
      case 'termii':
        return await this.sendTermiiSMS(phoneNumber, message);
      case 'mock':
      default:
        return await this.sendMockSMS(phoneNumber, message, code);
    }
  }

  /**
   * Generate SMS message based on type
   * @param {string} code - verification code
   * @param {string} type - verification type
   * @param {Object} options - additional options
   * @returns {string} SMS message
   */
  generateSMSMessage(code, type, options = {}) {
    const messages = {
      register: `CrossBridge: Your verification code is ${code}. Valid for 10 minutes. Don't share this code.`,
      login: `CrossBridge: Your login code is ${code}. Valid for 10 minutes. Don't share this code.`,
      password_reset: `CrossBridge: Your password reset code is ${code}. Valid for 10 minutes. Don't share this code.`,
      transaction: `CrossBridge: Your transaction verification code is ${code}. Valid for 10 minutes.`
    };

    return messages[type] || `CrossBridge: Your verification code is ${code}. Valid for 10 minutes.`;
  }

  /**
   * Mock SMS implementation (for development/testing)
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} message - SMS message
   * @param {string} code - verification code (for easy testing)
   * @returns {Object} result
   */
  async sendMockSMS(phoneNumber, message, code) {
    console.log(`\n📱 [MOCK SMS TO ${phoneNumber}]`);
    console.log(`📝 Message: ${message}`);
    console.log(`🔑 Code: ${code}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      provider: 'mock'
    };
  }

  /**
   * Twilio SMS implementation
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} message - SMS message
   * @returns {Object} result
   */
  async sendTwilioSMS(phoneNumber, message) {
    try {
      // This would integrate with Twilio SDK
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio'
      };
    } catch (error) {
      console.error('Twilio SMS error:', error);
      return {
        success: false,
        error: error.message,
        provider: 'twilio'
      };
    }
  }

  /**
   * AWS SNS SMS implementation
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} message - SMS message
   * @returns {Object} result
   */
  async sendAWSSNS(phoneNumber, message) {
    try {
      // This would integrate with AWS SDK
      const AWS = require('aws-sdk');
      const sns = new AWS.SNS({
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      });

      const params = {
        Message: message,
        PhoneNumber: phoneNumber,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'CrossBridge'
          }
        }
      };

      const result = await sns.publish(params).promise();

      return {
        success: true,
        messageId: result.MessageId,
        provider: 'aws_sns'
      };
    } catch (error) {
      console.error('AWS SNS error:', error);
      return {
        success: false,
        error: error.message,
        provider: 'aws_sns'
      };
    }
  }

  /**
   * Termii SMS implementation (Popular in Nigeria)
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} message - SMS message
   * @returns {Object} result
   */
  async sendTermiiSMS(phoneNumber, message) {
    try {
      const axios = require('axios');
      
      const response = await axios.post('https://api.ng.termii.com/api/sms/send', {
        to: phoneNumber,
        from: process.env.TERMII_SENDER_ID || 'CrossBridge',
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: process.env.TERMII_API_KEY
      });

      return {
        success: response.data.message === 'Successfully Sent',
        messageId: response.data.message_id,
        provider: 'termii'
      };
    } catch (error) {
      console.error('Termii SMS error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        provider: 'termii'
      };
    }
  }

  /**
   * Get verification status
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} type - verification type
   * @returns {Object} status information
   */
  async getVerificationStatus(phoneNumber, type = 'register') {
    const verificationData = await this.getVerificationData(phoneNumber, type);
    
    if (!verificationData) {
      return {
        hasActiveVerification: false,
        message: 'No active verification found.'
      };
    }

    const now = Date.now();
    const expired = now > verificationData.expiresAt;
    const canResend = now > verificationData.resendCooldownUntil;

    return {
      hasActiveVerification: !expired,
      expired,
      canResend,
      expiresIn: Math.max(0, Math.ceil((verificationData.expiresAt - now) / 1000)),
      resendCooldown: Math.max(0, Math.ceil((verificationData.resendCooldownUntil - now) / 1000)),
      attempts: verificationData.attempts,
      maxAttempts: this.config.maxAttempts,
      resendCount: verificationData.resendCount,
      createdAt: new Date(verificationData.createdAt).toISOString()
    };
  }
}

// Create singleton instance
const phoneVerificationService = new PhoneVerificationService();

module.exports = phoneVerificationService;
