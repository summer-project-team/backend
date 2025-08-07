/**
 * Unified Phone Management Service
 * Consolidates phone validation, verification, and user lookup functionality
 * Replaces: phoneManagementService.js + phoneVerificationService.js
 */
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { db } = require('../utils/database');
const { setCache, getCache } = require('../utils/redis');

class PhoneManagementService {
  constructor() {
    // Cache settings
    this.verificationCacheDuration = 300; // 5 minutes
    this.verificationCodeLength = 6;
    this.maxVerificationAttempts = 3;
    this.verificationExpiry = 300; // 5 minutes in seconds
  }

  /**
   * Validate phone number format and country
   * @param {string} phoneNumber - Phone number to validate
   * @param {string} countryCode - Country code (optional)
   * @returns {Object} Validation result
   */
  validatePhoneNumber(phoneNumber, countryCode = null) {
    try {
      // Parse the phone number
      const parsed = parsePhoneNumberFromString(phoneNumber, countryCode);
      
      if (!parsed) {
        return {
          isValid: false,
          message: 'Invalid phone number format',
          originalNumber: phoneNumber
        };
      }
      
      if (!parsed.isValid()) {
        return {
          isValid: false,
          message: 'Phone number is not valid for the specified country',
          originalNumber: phoneNumber,
          countryCode: parsed.country
        };
      }
      
      return {
        isValid: true,
        e164Format: parsed.format('E.164'),
        nationalFormat: parsed.formatNational(),
        internationalFormat: parsed.formatInternational(),
        countryCode: parsed.country,
        originalNumber: phoneNumber,
        phoneType: parsed.getType(),
        isPossible: parsed.isPossible()
      };
    } catch (error) {
      console.error('Error validating phone number:', error);
      return {
        isValid: false,
        message: 'Error parsing phone number',
        error: error.message,
        originalNumber: phoneNumber
      };
    }
  }

  /**
   * Lookup user by phone number with multiple strategies
   * @param {string} phoneNumber - Phone number to lookup
   * @param {string} countryCode - Country code (optional)
   * @returns {Object|null} User object or null
   */
  async lookupUserByPhone(phoneNumber, countryCode = null) {
    try {
      // Strategy 1: Direct lookup with E.164 format
      const validation = this.validatePhoneNumber(phoneNumber, countryCode);
      
      if (validation.isValid) {
        // Try E.164 format first
        let user = await this.findUserByExactPhone(validation.e164Format);
        if (user) {
          await this.ensurePhoneMapping(user.id, validation.e164Format);
          return user;
        }
        
        // Try national format
        user = await this.findUserByExactPhone(validation.nationalFormat.replace(/\s/g, ''));
        if (user) {
          await this.ensurePhoneMapping(user.id, validation.e164Format);
          return user;
        }
      }
      
      // Strategy 2: Fuzzy lookup for various formats
      const possibleFormats = this.generatePhoneVariations(phoneNumber);
      
      for (const format of possibleFormats) {
        const user = await this.findUserByExactPhone(format);
        if (user) {
          // Create canonical mapping if needed
          if (validation.isValid) {
            await this.ensurePhoneMapping(user.id, validation.e164Format);
          }
          return user;
        }
      }
      
      // Strategy 3: Check phone_wallet_mapping table
      if (validation.isValid) {
        const mappedUser = await this.findUserByPhoneMapping(validation.e164Format);
        if (mappedUser) {
          return mappedUser;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error looking up user by phone:', error);
      return null;
    }
  }

  /**
   * Find user by exact phone match
   * @param {string} phoneNumber - Exact phone number
   * @returns {Object|null} User object or null
   */
  async findUserByExactPhone(phoneNumber) {
    try {
      return await db('users')
        .where('phone_number', phoneNumber)
        .first();
    } catch (error) {
      console.error('Error finding user by exact phone:', error);
      return null;
    }
  }

  /**
   * Find user through phone mapping table
   * @param {string} phoneNumber - Phone number
   * @returns {Object|null} User object or null
   */
  async findUserByPhoneMapping(phoneNumber) {
    try {
      const result = await db('users')
        .join('phone_wallet_mapping', 'users.id', 'phone_wallet_mapping.user_id')
        .where('phone_wallet_mapping.phone_number', phoneNumber)
        .select('users.*')
        .first();
      
      return result || null;
    } catch (error) {
      console.error('Error finding user by phone mapping:', error);
      return null;
    }
  }

  /**
   * Generate phone number variations for fuzzy matching
   * @param {string} phoneNumber - Original phone number
   * @returns {Array} Array of phone number variations
   */
  generatePhoneVariations(phoneNumber) {
    const variations = new Set();
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    variations.add(phoneNumber); // Original
    variations.add(cleanNumber); // Digits only
    
    // Add with country codes
    if (!cleanNumber.startsWith('234') && cleanNumber.length >= 10) {
      variations.add('234' + cleanNumber.substring(cleanNumber.length - 10)); // Nigeria
    }
    
    if (!cleanNumber.startsWith('44') && cleanNumber.length >= 10) {
      variations.add('44' + cleanNumber.substring(cleanNumber.length - 10)); // UK
    }
    
    if (!cleanNumber.startsWith('1') && cleanNumber.length >= 10) {
      variations.add('1' + cleanNumber.substring(cleanNumber.length - 10)); // US
    }
    
    // Add with + prefix
    variations.add('+' + cleanNumber);
    
    // Add without leading zeros
    if (cleanNumber.startsWith('0')) {
      variations.add(cleanNumber.substring(1));
    }
    
    return Array.from(variations);
  }

  /**
   * Ensure phone mapping exists for user
   * @param {string} userId - User ID
   * @param {string} phoneNumber - Phone number in E.164 format
   */
  async ensurePhoneMapping(userId, phoneNumber) {
    try {
      const existingMapping = await db('phone_wallet_mapping')
        .where({
          user_id: userId,
          phone_number: phoneNumber
        })
        .first();
      
      if (!existingMapping) {
        // Get user's wallet
        const wallet = await db('wallets')
          .where('user_id', userId)
          .first();
        
        if (wallet) {
          await db('phone_wallet_mapping').insert({
            user_id: userId,
            wallet_id: wallet.id,
            phone_number: phoneNumber,
            created_at: new Date(),
            updated_at: new Date()
          });
          
          console.log(`Created phone mapping: ${phoneNumber} -> ${userId}`);
        }
      }
    } catch (error) {
      console.error('Error ensuring phone mapping:', error);
    }
  }

  /**
   * Send verification code to phone number
   * @param {string} phoneNumber - Phone number to verify
   * @param {string} countryCode - Country code
   * @returns {Object} Verification result
   */
  async sendVerificationCode(phoneNumber, countryCode) {
    try {
      // Validate phone number
      const validation = this.validatePhoneNumber(phoneNumber, countryCode);
      
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.message
        };
      }
      
      const e164Number = validation.e164Format;
      
      // Check rate limiting
      const rateLimitKey = `phone_verification_rate:${e164Number}`;
      const recentAttempts = await getCache(rateLimitKey);
      
      if (recentAttempts && parseInt(recentAttempts) >= 3) {
        return {
          success: false,
          error: 'Too many verification attempts. Please try again later.'
        };
      }
      
      // Generate verification code
      const verificationCode = this.generateVerificationCode();
      
      // Store verification data
      const verificationData = {
        code: verificationCode,
        phone_number: e164Number,
        country_code: validation.countryCode,
        attempts: 0,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + this.verificationExpiry * 1000).toISOString()
      };
      
      const verificationKey = `phone_verification:${e164Number}`;
      await setCache(verificationKey, JSON.stringify(verificationData), this.verificationExpiry);
      
      // Update rate limiting
      const newAttemptCount = (parseInt(recentAttempts) || 0) + 1;
      await setCache(rateLimitKey, newAttemptCount.toString(), 3600); // 1 hour
      
      // In production, send actual SMS here
      console.log(`📱 Verification code for ${e164Number}: ${verificationCode}`);
      
      // Mock SMS sending result
      const smsResult = await this.mockSendSMS(e164Number, verificationCode);
      
      return {
        success: true,
        message: 'Verification code sent successfully',
        phone_number: e164Number,
        verification_id: this.generateVerificationId(),
        expires_in: this.verificationExpiry,
        sms_result: smsResult
      };
    } catch (error) {
      console.error('Error sending verification code:', error);
      return {
        success: false,
        error: 'Failed to send verification code'
      };
    }
  }

  /**
   * Verify phone number with code
   * @param {string} phoneNumber - Phone number
   * @param {string} code - Verification code
   * @returns {Object} Verification result
   */
  async verifyCode(phoneNumber, code) {
    try {
      const validation = this.validatePhoneNumber(phoneNumber);
      
      if (!validation.isValid) {
        return {
          success: false,
          error: 'Invalid phone number format'
        };
      }
      
      const e164Number = validation.e164Format;
      const verificationKey = `phone_verification:${e164Number}`;
      
      // Get verification data
      const verificationDataStr = await getCache(verificationKey);
      
      if (!verificationDataStr) {
        return {
          success: false,
          error: 'Verification code expired or not found'
        };
      }
      
      const verificationData = JSON.parse(verificationDataStr);
      
      // Check expiry
      if (new Date() > new Date(verificationData.expires_at)) {
        await setCache(verificationKey, null, 1); // Delete expired code
        return {
          success: false,
          error: 'Verification code has expired'
        };
      }
      
      // Check attempt limit
      if (verificationData.attempts >= this.maxVerificationAttempts) {
        return {
          success: false,
          error: 'Maximum verification attempts exceeded'
        };
      }
      
      // Verify code
      if (verificationData.code !== code) {
        // Increment attempts
        verificationData.attempts++;
        await setCache(verificationKey, JSON.stringify(verificationData), this.verificationExpiry);
        
        return {
          success: false,
          error: `Invalid verification code. ${this.maxVerificationAttempts - verificationData.attempts} attempts remaining.`
        };
      }
      
      // Success - remove verification data
      await setCache(verificationKey, null, 1);
      
      // Clear rate limiting
      const rateLimitKey = `phone_verification_rate:${e164Number}`;
      await setCache(rateLimitKey, null, 1);
      
      return {
        success: true,
        message: 'Phone number verified successfully',
        phone_number: e164Number,
        verified_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error verifying code:', error);
      return {
        success: false,
        error: 'Verification failed'
      };
    }
  }

  /**
   * Get verification status for a phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Object} Verification status
   */
  async getVerificationStatus(phoneNumber) {
    try {
      const validation = this.validatePhoneNumber(phoneNumber);
      
      if (!validation.isValid) {
        return {
          phone_number: phoneNumber,
          status: 'invalid',
          message: validation.message
        };
      }
      
      const e164Number = validation.e164Format;
      const verificationKey = `phone_verification:${e164Number}`;
      
      const verificationDataStr = await getCache(verificationKey);
      
      if (!verificationDataStr) {
        return {
          phone_number: e164Number,
          status: 'not_initiated',
          message: 'No verification process found'
        };
      }
      
      const verificationData = JSON.parse(verificationDataStr);
      
      // Check if expired
      if (new Date() > new Date(verificationData.expires_at)) {
        return {
          phone_number: e164Number,
          status: 'expired',
          message: 'Verification code has expired'
        };
      }
      
      // Check if blocked due to too many attempts
      if (verificationData.attempts >= this.maxVerificationAttempts) {
        return {
          phone_number: e164Number,
          status: 'blocked',
          message: 'Too many failed attempts'
        };
      }
      
      return {
        phone_number: e164Number,
        status: 'pending',
        attempts_remaining: this.maxVerificationAttempts - verificationData.attempts,
        expires_at: verificationData.expires_at,
        created_at: verificationData.created_at
      };
    } catch (error) {
      console.error('Error getting verification status:', error);
      return {
        phone_number: phoneNumber,
        status: 'error',
        message: 'Failed to get verification status'
      };
    }
  }

  /**
   * Generate verification code
   * @returns {string} 6-digit verification code
   */
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate verification ID
   * @returns {string} Unique verification ID
   */
  generateVerificationId() {
    return `verify_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Mock SMS sending (replace with actual SMS service in production)
   * @param {string} phoneNumber - Phone number
   * @param {string} code - Verification code
   * @returns {Object} SMS result
   */
  async mockSendSMS(phoneNumber, code) {
    // Simulate SMS sending delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Mock different scenarios based on phone number
    if (phoneNumber.includes('invalid')) {
      return {
        success: false,
        error: 'Invalid phone number for SMS delivery'
      };
    }
    
    return {
      success: true,
      message_id: `sms_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      provider: 'mock_sms_provider',
      cost: 0.05, // Mock cost
      delivered_at: new Date().toISOString()
    };
  }

  /**
   * Clean up expired verification codes (maintenance function)
   * @returns {number} Number of cleaned codes
   */
  async cleanupExpiredCodes() {
    // In a real implementation, this would clean up expired codes from the cache
    // For Redis with TTL, this happens automatically
    console.log('Cleanup of expired verification codes completed');
    return 0;
  }

  /**
   * Get phone number statistics
   * @returns {Object} Phone verification statistics
   */
  async getVerificationStats() {
    try {
      // Get basic stats from recent verifications
      // In production, this would query actual verification logs
      
      return {
        total_verifications_today: 0,
        success_rate: 95.5,
        average_attempts: 1.2,
        most_common_countries: ['NG', 'GB', 'US'],
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting verification stats:', error);
      return {
        error: 'Failed to get verification statistics'
      };
    }
  }
}

module.exports = new PhoneManagementService();
