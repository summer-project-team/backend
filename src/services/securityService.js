/**
 * Enhanced Security Service for Series A Production Readiness
 * Handles authentication, fraud detection, rate limiting, and security monitoring
 */
const crypto = require('crypto');
const { db } = require('../utils/database');
const { setCache, getCache } = require('../utils/redis');

/**
 * Advanced fraud detection patterns
 */
const FRAUD_PATTERNS = {
  RAPID_TRANSACTIONS: 'rapid_transactions',
  UNUSUAL_AMOUNTS: 'unusual_amounts',
  GEOGRAPHIC_ANOMALY: 'geographic_anomaly',
  DEVICE_SWITCH: 'device_switch',
  VELOCITY_ABUSE: 'velocity_abuse',
  PATTERN_BREAK: 'pattern_break'
};

/**
 * Security risk levels
 */
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Enhanced rate limiting configurations
 */
const RATE_LIMITS = {
  LOGIN_ATTEMPTS: { attempts: 5, window: 900 }, // 5 attempts per 15 minutes
  SMS_VERIFICATIONS: { attempts: 3, window: 3600 }, // 3 SMS per hour
  TRANSACTIONS: { attempts: 10, window: 3600 }, // 10 transactions per hour
  PASSWORD_RESET: { attempts: 3, window: 86400 }, // 3 resets per day
  API_CALLS: { attempts: 1000, window: 3600 } // 1000 API calls per hour
};

/**
 * Enhanced two-factor authentication verification
 * @param {string} userId - User ID
 * @param {string} code - 2FA code
 * @param {string} method - Verification method (sms, totp, email)
 * @returns {Promise<Object>} - Verification result
 */
const verifyTwoFactorCode = async (userId, code, method = 'sms') => {
  try {
    // Rate limiting for 2FA attempts
    const rateLimitKey = `2fa_attempts:${userId}`;
    const attempts = await getCache(rateLimitKey) || 0;
    
    if (attempts >= 5) {
      await logSecurityEvent(userId, 'EXCESSIVE_2FA_ATTEMPTS', { attempts });
      return { valid: false, error: 'Too many verification attempts. Please wait 15 minutes.' };
    }

    if (!code || !/^\d{6}$/.test(code)) {
      await incrementAttempts(rateLimitKey, 900); // 15 minutes
      return { valid: false, error: 'Invalid verification code format' };
    }

    // Get the stored verification code
    const storedCodeKey = `2fa_code:${userId}:${method}`;
    const storedData = await getCache(storedCodeKey);
    
    if (!storedData) {
      await incrementAttempts(rateLimitKey, 900);
      return { valid: false, error: 'Verification code expired or not found' };
    }

    const { code: storedCode, timestamp, attempts: codeAttempts = 0 } = JSON.parse(storedData);

    // Check if code has been attempted too many times
    if (codeAttempts >= 3) {
      await logSecurityEvent(userId, 'EXCESSIVE_CODE_ATTEMPTS', { method });
      return { valid: false, error: 'Verification code has been disabled due to too many attempts' };
    }

    // Verify the code
    if (code === storedCode) {
      // Clear the stored code and rate limit
      await Promise.all([
        setCache(storedCodeKey, null, 1), // Delete
        setCache(rateLimitKey, null, 1)   // Reset rate limit
      ]);

      await logSecurityEvent(userId, '2FA_SUCCESS', { method });
      return { valid: true };
    } else {
      // Increment both rate limit and code attempts
      await Promise.all([
        incrementAttempts(rateLimitKey, 900),
        setCache(storedCodeKey, JSON.stringify({
          ...JSON.parse(storedData),
          attempts: codeAttempts + 1
        }), 300) // 5 minutes TTL
      ]);

      await logSecurityEvent(userId, '2FA_FAILURE', { method, attempts: codeAttempts + 1 });
      return { valid: false, error: 'Invalid verification code' };
    }
  } catch (error) {
    console.error('Error verifying 2FA code:', error);
    await logSecurityEvent(userId, '2FA_ERROR', { error: error.message });
    return { valid: false, error: 'Verification failed. Please try again.' };
  }
};

/**
 * Advanced device fingerprinting and verification
 * @param {string} userId - User ID
 * @param {Object} deviceFingerprint - Comprehensive device data
 * @returns {Promise<Object>} - Device verification result
 */
const verifyDeviceFingerprint = async (userId, deviceFingerprint) => {
  try {
    const { 
      userAgent, 
      screenResolution, 
      timezone, 
      language, 
      platform,
      cookiesEnabled,
      doNotTrack,
      ipAddress,
      browserFingerprint 
    } = deviceFingerprint;

    // Create composite fingerprint hash
    const fingerprintString = [
      userAgent, screenResolution, timezone, language, 
      platform, cookiesEnabled, doNotTrack
    ].join('|');
    
    const fingerprintHash = crypto
      .createHash('sha256')
      .update(fingerprintString)
      .digest('hex');

    // Check if device is known
    const knownDevice = await db('user_devices')
      .where('user_id', userId)
      .where('fingerprint_hash', fingerprintHash)
      .where('is_active', true)
      .first();

    if (knownDevice) {
      // Update last seen
      await db('user_devices')
        .where('id', knownDevice.id)
        .update({ 
          last_seen: new Date(),
          ip_address: ipAddress 
        });

      return { 
        recognized: true, 
        deviceId: knownDevice.id,
        trustLevel: knownDevice.trust_level || 'medium'
      };
    }

    // New device detected
    await logSecurityEvent(userId, 'NEW_DEVICE_DETECTED', {
      fingerprint_hash: fingerprintHash,
      ip_address: ipAddress,
      user_agent: userAgent
    });

    // Register new device with low trust level
    const [newDevice] = await db('user_devices')
      .insert({
        user_id: userId,
        fingerprint_hash: fingerprintHash,
        device_name: extractDeviceName(userAgent),
        user_agent: userAgent,
        ip_address: ipAddress,
        platform: platform,
        trust_level: 'low',
        is_active: true,
        first_seen: new Date(),
        last_seen: new Date()
      })
      .returning('*');

    return { 
      recognized: false, 
      deviceId: newDevice.id,
      trustLevel: 'low',
      requiresVerification: true
    };

  } catch (error) {
    console.error('Error verifying device fingerprint:', error);
    return { 
      recognized: false, 
      error: 'Device verification failed',
      trustLevel: 'unknown'
    };
  }
};

/**
 * Advanced fraud detection and risk assessment
 * @param {Object} transactionData - Transaction details
 * @param {Object} userContext - User context and history
 * @returns {Promise<Object>} - Risk assessment result
 */
const assessTransactionRisk = async (transactionData, userContext) => {
  try {
    const { amount, currency, recipient_id, sender_id, transaction_type } = transactionData;
    const { device_id, ip_address, location } = userContext;

    const riskFactors = [];
    let riskScore = 0;

    // 1. Transaction velocity check
    const recentTransactions = await db('transactions')
      .where('sender_id', sender_id)
      .where('created_at', '>', new Date(Date.now() - 3600000)) // Last hour
      .count('id as count')
      .first();

    if (recentTransactions.count >= 5) {
      riskFactors.push(FRAUD_PATTERNS.RAPID_TRANSACTIONS);
      riskScore += 30;
    }

    // 2. Amount anomaly detection
    const avgAmount = await db('transactions')
      .where('sender_id', sender_id)
      .where('created_at', '>', new Date(Date.now() - 30 * 24 * 3600000)) // Last 30 days
      .avg('amount as avg_amount')
      .first();

    if (avgAmount.avg_amount && amount > avgAmount.avg_amount * 5) {
      riskFactors.push(FRAUD_PATTERNS.UNUSUAL_AMOUNTS);
      riskScore += 25;
    }

    // 3. Device trust level
    if (userContext.device_trust_level === 'low') {
      riskFactors.push(FRAUD_PATTERNS.DEVICE_SWITCH);
      riskScore += 20;
    }

    // 4. Geographic anomaly (if location tracking is available)
    if (location) {
      const lastKnownLocation = await db('user_locations')
        .where('user_id', sender_id)
        .orderBy('created_at', 'desc')
        .first();

      if (lastKnownLocation && calculateDistance(location, lastKnownLocation) > 1000) {
        riskFactors.push(FRAUD_PATTERNS.GEOGRAPHIC_ANOMALY);
        riskScore += 35;
      }
    }

    // 5. High-value transaction checks
    const thresholds = getHighValueThresholds();
    if (amount > thresholds[currency]) {
      riskScore += 15;
    }

    // Determine risk level
    let riskLevel = RISK_LEVELS.LOW;
    if (riskScore >= 70) riskLevel = RISK_LEVELS.CRITICAL;
    else if (riskScore >= 50) riskLevel = RISK_LEVELS.HIGH;
    else if (riskScore >= 25) riskLevel = RISK_LEVELS.MEDIUM;

    // Log risk assessment
    await logSecurityEvent(sender_id, 'RISK_ASSESSMENT', {
      transaction_id: transactionData.id,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_factors: riskFactors
    });

    return {
      riskLevel,
      riskScore,
      riskFactors,
      requiresManualReview: riskLevel === RISK_LEVELS.CRITICAL,
      requiresAdditionalAuth: riskLevel === RISK_LEVELS.HIGH || riskLevel === RISK_LEVELS.CRITICAL
    };

  } catch (error) {
    console.error('Error assessing transaction risk:', error);
    return {
      riskLevel: RISK_LEVELS.HIGH, // Default to high risk on error
      riskScore: 50,
      riskFactors: ['ASSESSMENT_ERROR'],
      requiresManualReview: true
    };
  }
};

/**
 * Enhanced rate limiting with sophisticated tracking
 * @param {string} key - Rate limit key
 * @param {Object} limits - Rate limit configuration
 * @param {string} identifier - User/IP identifier
 * @returns {Promise<Object>} - Rate limit status
 */
const checkRateLimit = async (key, limits = RATE_LIMITS.API_CALLS, identifier = null) => {
  try {
    const cacheKey = `rate_limit:${key}`;
    const current = await getCache(cacheKey) || 0;

    if (current >= limits.attempts) {
      // Log rate limit violation
      if (identifier) {
        await logSecurityEvent(identifier, 'RATE_LIMIT_EXCEEDED', {
          limit_key: key,
          attempts: current,
          max_attempts: limits.attempts
        });
      }

      return {
        allowed: false,
        remaining: 0,
        resetTime: limits.window,
        exceeded: true
      };
    }

    // Increment counter
    const newCount = await incrementAttempts(cacheKey, limits.window);

    return {
      allowed: true,
      remaining: limits.attempts - newCount,
      resetTime: limits.window,
      exceeded: false
    };

  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open but log the error
    return { allowed: true, remaining: 0, resetTime: 0, error: error.message };
  }
};

/**
 * API key validation and management
 * @param {string} apiKey - API key to validate
 * @param {string} endpoint - Endpoint being accessed
 * @returns {Promise<Object>} - Validation result
 */
const validateApiKey = async (apiKey, endpoint = null) => {
  try {
    if (!apiKey) {
      return { valid: false, error: 'API key required' };
    }

    // Check API key in database
    const apiKeyRecord = await db('api_keys')
      .where('key_hash', crypto.createHash('sha256').update(apiKey).digest('hex'))
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .first();

    if (!apiKeyRecord) {
      await logSecurityEvent(null, 'INVALID_API_KEY', { 
        key_prefix: apiKey.substring(0, 8),
        endpoint 
      });
      return { valid: false, error: 'Invalid or expired API key' };
    }

    // Check endpoint permissions
    if (endpoint && apiKeyRecord.allowed_endpoints) {
      const allowedEndpoints = JSON.parse(apiKeyRecord.allowed_endpoints);
      if (!allowedEndpoints.includes(endpoint) && !allowedEndpoints.includes('*')) {
        return { valid: false, error: 'Endpoint not allowed for this API key' };
      }
    }

    // Update last used
    await db('api_keys')
      .where('id', apiKeyRecord.id)
      .update({ 
        last_used: new Date(),
        usage_count: apiKeyRecord.usage_count + 1
      });

    return {
      valid: true,
      userId: apiKeyRecord.user_id,
      permissions: JSON.parse(apiKeyRecord.permissions || '[]'),
      rateLimit: JSON.parse(apiKeyRecord.rate_limit || '{}')
    };

  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false, error: 'Validation failed' };
  }
};

/**
 * Enhanced security requirements for transactions
 */
const getSecurityRequirements = (amount, currency, transactionType, riskLevel = RISK_LEVELS.LOW) => {
  const thresholds = getHighValueThresholds();
  const threshold = thresholds[currency] || thresholds['USD'];
  const isHighValue = amount > threshold;
  
  // Base requirements
  let requirements = {
    requiresTwoFactor: isHighValue,
    requiresDeviceVerification: isHighValue && transactionType === 'withdrawal',
    requiresTransactionPin: amount > threshold * 0.1, // 10% of high-value threshold
    threshold,
    isHighValue
  };

  // Risk-based adjustments
  switch (riskLevel) {
    case RISK_LEVELS.CRITICAL:
      requirements.requiresManualReview = true;
      requirements.requiresTwoFactor = true;
      requirements.requiresDeviceVerification = true;
      requirements.requiresAdminApproval = amount > threshold * 2;
      break;
    case RISK_LEVELS.HIGH:
      requirements.requiresTwoFactor = true;
      requirements.requiresDeviceVerification = true;
      break;
    case RISK_LEVELS.MEDIUM:
      requirements.requiresTwoFactor = isHighValue;
      requirements.requiresTransactionPin = true;
      break;
  }

  return requirements;
};

/**
 * Enhanced transaction PIN validation
 */
const validateTransactionPin = async (userId, pin) => {
  try {
    const User = require('../models/User');
    
    // Rate limiting for PIN attempts
    const rateLimitKey = `pin_attempts:${userId}`;
    const attempts = await getCache(rateLimitKey) || 0;
    
    if (attempts >= 3) {
      await logSecurityEvent(userId, 'EXCESSIVE_PIN_ATTEMPTS', { attempts });
      return { 
        valid: false, 
        error: 'Account temporarily locked due to too many PIN attempts',
        pinRequired: true,
        locked: true
      };
    }

    const pinEnabled = await User.hasPinEnabled(userId);
    if (!pinEnabled) {
      return { valid: true, pinRequired: false };
    }
    
    if (!pin) {
      return { 
        valid: false, 
        error: 'Transaction PIN is required',
        pinRequired: true 
      };
    }
    
    const pinVerification = await User.verifyTransactionPin(userId, pin);
    
    if (!pinVerification.valid) {
      await incrementAttempts(rateLimitKey, 1800); // 30 minutes
      await logSecurityEvent(userId, 'PIN_VERIFICATION_FAILED', { attempts: attempts + 1 });
    } else {
      // Clear rate limit on success
      await setCache(rateLimitKey, null, 1);
      await logSecurityEvent(userId, 'PIN_VERIFICATION_SUCCESS');
    }
    
    return {
      valid: pinVerification.valid,
      error: pinVerification.error,
      pinRequired: true
    };
  } catch (error) {
    console.error('Error validating transaction PIN:', error);
    return { 
      valid: false, 
      error: 'PIN validation failed',
      pinRequired: true 
    };
  }
};

// Helper functions
const incrementAttempts = async (key, ttl) => {
  const current = await getCache(key) || 0;
  const newValue = current + 1;
  await setCache(key, newValue, ttl);
  return newValue;
};

const logSecurityEvent = async (userId, eventType, metadata = {}) => {
  try {
    await db('security_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata: JSON.stringify(metadata),
      ip_address: metadata.ip_address || null,
      user_agent: metadata.user_agent || null,
      created_at: new Date()
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};

const getHighValueThresholds = () => ({
  'CBUSD': 500,
  'USD': 500,
  'GBP': 400,
  'EUR': 450,
  'NGN': 750000
});

const extractDeviceName = (userAgent) => {
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('Android')) return 'Android Device';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Windows')) return 'Windows PC';
  if (userAgent.includes('Mac')) return 'Mac';
  return 'Unknown Device';
};

const calculateDistance = (loc1, loc2) => {
  // Simple distance calculation (in km)
  const R = 6371;
  const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
  const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

module.exports = {
  verifyTwoFactorCode,
  verifyDeviceFingerprint,
  assessTransactionRisk,
  checkRateLimit,
  validateApiKey,
  getSecurityRequirements,
  validateTransactionPin,
  logSecurityEvent,
  FRAUD_PATTERNS,
  RISK_LEVELS,
  RATE_LIMITS
};
