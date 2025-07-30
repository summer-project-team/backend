const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { db } = require('../utils/database');
const { generateWalletAddress } = require('../utils/helpers');

/**
 * Phone service for phone number validation and lookup
 */
const phoneService = {
  /**
   * Validate a phone number
   * @param {string} phoneNumber - Phone number to validate
   * @param {string} countryCode - ISO country code (e.g., 'NG', 'GB', 'US')
   * @returns {Object} Validation result
   */
  validatePhoneNumber: (phoneNumber, countryCode) => {
    try {
      // Remove any spaces or special characters
      let cleanedNumber = phoneNumber.replace(/\s+/g, '');
      
      // Handle different formats
      if (cleanedNumber.startsWith('0') && countryCode === 'NG') {
        // Convert local Nigerian format to international
        cleanedNumber = '234' + cleanedNumber.substring(1);
      }
      
      // Ensure we have a + prefix for parsing
      if (!cleanedNumber.startsWith('+')) {
        cleanedNumber = '+' + cleanedNumber;
      }
      
      // Parse phone number
      const parsedNumber = parsePhoneNumberFromString(cleanedNumber);
      
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
        countryCode: parsedNumber.country,
      };
    } catch (error) {
      console.error('Phone validation error:', error);
      return {
        isValid: false,
        message: 'Error validating phone number',
      };
    }
  },
  
  /**
   * Look up a user by phone number
   * @param {string} phoneNumber - Phone number to look up
   * @returns {Object|null} User data or null
   */
  lookupUserByPhone: async (phoneNumber) => {
    try {
      // Clean up phone number format
      const cleanedNumber = phoneNumber.replace(/\s+/g, '');
      
      // Query the phone wallet mapping
      const mapping = await db('phone_wallet_mapping')
        .where({ phone_number: cleanedNumber })
        .first();
      
      if (!mapping) {
        return null;
      }
      
      // Get user data
      const user = await db('users')
        .select([
          'users.id',
          'users.phone_number',
          'users.country_code',
          'users.first_name',
          'users.last_name',
          'wallets.wallet_address',
        ])
        .join('wallets', 'users.id', 'wallets.user_id')
        .where('users.id', mapping.user_id)
        .first();
      
      return user;
    } catch (error) {
      console.error('Phone lookup error:', error);
      return null;
    }
  },
  
  /**
   * Generate a deterministic wallet address from a phone number
   * @param {string} phoneNumber - E.164 formatted phone number
   * @returns {string} Wallet address
   */
  generateWalletAddress: (phoneNumber) => {
    return generateWalletAddress(phoneNumber);
  },
  
  /**
   * Register a phone number to wallet mapping
   * @param {string} phoneNumber - E.164 formatted phone number
   * @param {string} userId - User ID
   * @param {string} walletId - Wallet ID
   * @returns {Object} Created mapping
   */
  registerPhoneWallet: async (phoneNumber, userId, walletId) => {
    try {
      // Check if mapping already exists
      const existingMapping = await db('phone_wallet_mapping')
        .where({ phone_number: phoneNumber })
        .first();
      
      if (existingMapping) {
        return existingMapping;
      }
      
      // Create new mapping
      const [mapping] = await db('phone_wallet_mapping')
        .insert({
          phone_number: phoneNumber,
          user_id: userId,
          wallet_id: walletId,
        })
        .returning('*');
      
      return mapping;
    } catch (error) {
      console.error('Phone registration error:', error);
      throw error;
    }
  },
  
  /**
   * Send verification SMS (mock implementation)
   * @param {string} phoneNumber - Phone number to send to
   * @param {string} verificationCode - Verification code
   * @returns {Object} Result
   */
  sendVerificationSMS: async (phoneNumber, verificationCode) => {
    // This is a mock implementation for the prototype
    console.log(`[MOCK SMS] Sending verification code ${verificationCode} to ${phoneNumber}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      messageId: `mock-sms-${Date.now()}`,
      phoneNumber,
    };
  },
};

module.exports = phoneService; 