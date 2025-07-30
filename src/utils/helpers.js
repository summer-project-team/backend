const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { setCache } = require('./redis');

/**
 * Generate JWT token
 * @param {Object} payload - Data to include in token
 * @returns {string} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || '1d',
  });
};

/**
 * Generate refresh token
 * @param {Object} payload - Data to include in token
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  });
};

/**
 * Blacklist a token (for logout)
 * @param {string} token - JWT token to blacklist
 * @returns {boolean} Success status
 */
const blacklistToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    
    // Only blacklist if token is still valid
    if (ttl > 0) {
      await setCache(`bl_${token}`, true, ttl);
    }
    
    return true;
  } catch (error) {
    console.error('Error blacklisting token:', error);
    return false;
  }
};

/**
 * Validate and format phone number
 * @param {string} phoneNumber - Phone number to validate
 * @param {string} countryCode - Country code (e.g., 'NG', 'GB', 'US')
 * @returns {Object} Validation result
 */
const validatePhoneNumber = (phoneNumber, countryCode) => {
  try {
    const parsedNumber = parsePhoneNumberFromString(phoneNumber, countryCode);
    
    if (!parsedNumber || !parsedNumber.isValid()) {
      return {
        isValid: false,
        message: 'Invalid phone number',
      };
    }
    
    return {
      isValid: true,
      formattedNumber: parsedNumber.formatInternational(),
      e164Format: parsedNumber.format('E.164'),
    };
  } catch (error) {
    return {
      isValid: false,
      message: 'Error validating phone number',
    };
  }
};

/**
 * Generate deterministic wallet address from phone number
 * @param {string} phoneNumber - E.164 formatted phone number
 * @returns {string} Wallet address
 */
const generateWalletAddress = (phoneNumber) => {
  const hash = crypto.createHash('sha256')
    .update(`${phoneNumber}-${process.env.JWT_SECRET || 'crossbridge-secret'}`)
    .digest('hex');
  
  // Format as 0x... wallet address (Ethereum-like)
  return `0x${hash.substring(0, 40)}`;
};

/**
 * Generate mock verification code (for demo purposes)
 * @returns {string} 6-digit verification code
 */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Format currency amount with symbol
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (NGN, GBP, USD)
 * @returns {string} Formatted currency amount
 */
const formatCurrency = (amount, currency) => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  
  return formatter.format(amount);
};

module.exports = {
  generateToken,
  generateRefreshToken,
  blacklistToken,
  validatePhoneNumber,
  generateWalletAddress,
  generateVerificationCode,
  formatCurrency,
}; 