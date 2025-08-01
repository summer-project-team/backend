const { db } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Banking service for mock bank operations
 */
const bankingService = {
  /**
   * Link a bank account to a user
   * @param {string} userId - User ID
   * @param {Object} accountData - Bank account data
   * @returns {Object} Linked bank account
   */
  linkBankAccount: async (userId, accountData) => {
    try {
      // Check if account already exists
      const existingAccount = await db('bank_accounts')
        .where({
          user_id: userId,
          account_number: accountData.account_number,
          bank_code: accountData.bank_code,
        })
        .first();
      
      if (existingAccount) {
        return existingAccount;
      }
      
      // Insert new bank account
      const [bankAccount] = await db('bank_accounts')
        .insert({
          user_id: userId,
          account_number: accountData.account_number,
          bank_code: accountData.bank_code,
          bank_name: accountData.bank_name,
          account_name: accountData.account_name,
          account_type: accountData.account_type,
          currency: accountData.currency,
          is_verified: false, // Requires verification
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');
      
      return bankAccount;
    } catch (error) {
      console.error('Error linking bank account:', error);
      throw error;
    }
  },
  
  /**
   * Get user's linked bank accounts
   * @param {string} userId - User ID
   * @returns {Array} Bank accounts
   */
  getUserBankAccounts: async (userId) => {
    try {
      const accounts = await db('bank_accounts')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc');
      
      return accounts;
    } catch (error) {
      console.error('Error getting bank accounts:', error);
      throw error;
    }
  },
  
  /**
   * Verify bank account (mock implementation)
   * @param {string} accountId - Bank account ID
   * @returns {Object} Verification result
   */
  verifyBankAccount: async (accountId) => {
    try {
      // In a real implementation, this would call a bank verification API
      // For the prototype, we'll simulate verification with a delay
      
      // Simulate API delay
      const delayMs = parseInt(process.env.MOCK_BANK_DELAY_MS) || 2000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Update account as verified
      const [account] = await db('bank_accounts')
        .where({ id: accountId })
        .update({
          is_verified: true,
          updated_at: new Date(),
        })
        .returning('*');
      
      return {
        success: true,
        account,
        verification_id: `verify-${uuidv4().substring(0, 8)}`,
        verified_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error verifying bank account:', error);
      throw error;
    }
  },
  
  /**
   * Process bank deposit (mock implementation)
   * @param {string} userId - User ID
   * @param {string} accountId - Bank account ID
   * @param {number} amount - Deposit amount
   * @param {string} currency - Currency code
   * @returns {Object} Deposit result
   */
  processDeposit: async (userId, accountId, amount, currency) => {
    try {
      // Simulate bank processing delay
      const delayMs = parseInt(process.env.MOCK_BANK_DELAY_MS) || 2000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Simulate success rate
      const successRate = parseFloat(process.env.MOCK_SUCCESS_RATE) || 0.95;
      const isSuccessful = Math.random() < successRate;
      
      if (!isSuccessful) {
        throw new Error('Bank deposit failed');
      }
      
      // Generate reference
      const reference = `DEP-${currency}-${uuidv4().substring(0, 8)}`;
      
      return {
        success: true,
        amount,
        currency,
        reference,
        account_id: accountId,
        user_id: userId,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
    } catch (error) {
      console.error('Error processing deposit:', error);
      throw error;
    }
  },
  
  /**
   * Process bank withdrawal (mock implementation)
   * @param {string} userId - User ID
   * @param {string} accountId - Bank account ID
   * @param {number} amount - Withdrawal amount
   * @param {string} currency - Currency code
   * @returns {Object} Withdrawal result
   */
  processWithdrawal: async (userId, accountId, amount, currency) => {
    try {
      // Simulate bank processing delay
      const delayMs = parseInt(process.env.MOCK_BANK_DELAY_MS) || 2000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Simulate success rate
      const successRate = parseFloat(process.env.MOCK_SUCCESS_RATE) || 0.95;
      const isSuccessful = Math.random() < successRate;
      
      if (!isSuccessful) {
        throw new Error('Bank withdrawal failed');
      }
      
      // Generate reference
      const reference = `WDR-${currency}-${uuidv4().substring(0, 8)}`;
      
      return {
        success: true,
        amount,
        currency,
        reference,
        account_id: accountId,
        user_id: userId,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      throw error;
    }
  },

  /**
   * Get a specific bank account for a user
   * @param {string} userId - User ID
   * @param {string} accountId - Account ID
   * @returns {Object} Bank account
   */
  getBankAccount: async (userId, accountId) => {
    try {
      const account = await db('bank_accounts')
        .where({
          user_id: userId,
          id: accountId,
        })
        .first();
      
      return account;
    } catch (error) {
      console.error('Error getting bank account:', error);
      throw error;
    }
  },

  /**
   * Remove a bank account for a user
   * @param {string} userId - User ID
   * @param {string} accountId - Account ID
   */
  removeBankAccount: async (userId, accountId) => {
    try {
      const deletedCount = await db('bank_accounts')
        .where({
          user_id: userId,
          id: accountId,
        })
        .del();
      
      if (deletedCount === 0) {
        throw new Error('Bank account not found or already deleted');
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error removing bank account:', error);
      throw error;
    }
  },
};

module.exports = bankingService; 