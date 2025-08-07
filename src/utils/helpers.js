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
 * Blacklist all tokens for a specific user (force logout all sessions)
 * @param {string} userId - User ID to blacklist tokens for
 * @returns {boolean} Success status
 */
const blacklistAllUserTokens = async (userId) => {
  try {
    // Set a timestamp for this user that invalidates all previous tokens
    const timestamp = Math.floor(Date.now() / 1000);
    await setCache(`user_token_invalidate:${userId}`, timestamp, 604800); // 7 days
    
    return true;
  } catch (error) {
    console.error('Error blacklisting user tokens:', error);
    return false;
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
 * @param {number} length - Length of the code (default: 6)
 * @returns {string} Verification code
 */
const generateVerificationCode = (length = 6) => {
  if (length <= 10) {
    // For shorter codes, use random numbers
    return Math.floor(Math.random() * Math.pow(10, length))
      .toString()
      .padStart(length, '0');
  } else {
    // For longer codes (like reset tokens), use crypto
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }
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
  blacklistAllUserTokens,
  generateWalletAddress,
  generateVerificationCode,
  formatCurrency,
}; 