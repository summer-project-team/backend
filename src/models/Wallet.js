const { db } = require('../utils/database');

/**
 * Wallet model
 */
class Wallet {
  /**
   * Create a new wallet
   * @param {Object} walletData - Wallet data
   * @returns {Object} Created wallet
   */
  static async create(walletData) {
    const [wallet] = await db('wallets')
      .insert(walletData)
      .returning('*');
    
    return wallet;
  }
  
  /**
   * Find wallet by ID
   * @param {string} id - Wallet ID
   * @returns {Object|null} Wallet or null
   */
  static async findById(id) {
    const wallet = await db('wallets')
      .where({ id })
      .first();
    
    return wallet || null;
  }
  
  /**
   * Find wallet by user ID
   * @param {string} userId - User ID
   * @returns {Object|null} Wallet or null
   */
  static async findByUserId(userId) {
    const wallet = await db('wallets')
      .where({ user_id: userId })
      .first();
    
    return wallet || null;
  }
  
  /**
   * Find wallet by address
   * @param {string} address - Wallet address
   * @returns {Object|null} Wallet or null
   */
  static async findByAddress(address) {
    const wallet = await db('wallets')
      .where({ wallet_address: address })
      .first();
    
    return wallet || null;
  }
  
  /**
   * Update wallet balance
   * @param {string} id - Wallet ID
   * @param {string} currency - Currency code (ngn, gbp, usd, cbusd)
   * @param {number} amount - Amount to add (positive) or subtract (negative)
   * @returns {Object} Updated wallet
   */
  static async updateBalance(id, currency, amount) {
    // Start a transaction
    const trx = await db.transaction();
    
    try {
      const balanceColumn = `balance_${currency.toLowerCase()}`;
      
      // Special case for CBUSD
      const columnToUpdate = currency.toLowerCase() === 'cbusd' 
        ? 'cbusd_balance' 
        : balanceColumn;
      
      // Get current wallet
      const wallet = await trx('wallets')
        .where({ id })
        .first();
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      // Check if sufficient balance for debit
      if (amount < 0 && Math.abs(amount) > wallet[columnToUpdate]) {
        throw new Error('Insufficient balance');
      }
      
      // Update balance
      const [updatedWallet] = await trx('wallets')
        .where({ id })
        .update({
          [columnToUpdate]: db.raw(`?? + ?`, [columnToUpdate, amount]),
        })
        .returning('*');
      
      // Commit transaction
      await trx.commit();
      
      return updatedWallet;
    } catch (error) {
      // Rollback transaction on error
      await trx.rollback();
      throw error;
    }
  }
  
  /**
   * Add funds to a user's wallet (for demo purposes)
   * @param {string} userId - User ID
   * @param {string} currency - Currency code (NGN, GBP, USD, CBUSD)
   * @param {number} amount - Amount to add (must be positive)
   * @returns {Object} Updated wallet
   */
  static async addFunds(userId, currency, amount) {
    // Validate inputs
    if (!userId) throw new Error('User ID is required');
    if (!currency) throw new Error('Currency is required');
    if (!amount || amount <= 0) throw new Error('Amount must be a positive number');
    
    // Normalize currency
    const normalizedCurrency = currency.toUpperCase();
    if (!['NGN', 'GBP', 'USD', 'CBUSD'].includes(normalizedCurrency)) {
      throw new Error('Invalid currency');
    }
    
    // Start a transaction
    const trx = await db.transaction();
    
    try {
      // Find user's wallet
      const wallet = await trx('wallets')
        .where({ user_id: userId })
        .first();
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      // Determine the column to update
      let columnToUpdate;
      switch (normalizedCurrency) {
        case 'NGN':
          columnToUpdate = 'balance_ngn';
          break;
        case 'GBP':
          columnToUpdate = 'balance_gbp';
          break;
        case 'USD':
          columnToUpdate = 'balance_usd';
          break;
        case 'CBUSD':
          columnToUpdate = 'cbusd_balance';
          break;
      }
      
      // Update balance
      const [updatedWallet] = await trx('wallets')
        .where({ id: wallet.id })
        .update({
          [columnToUpdate]: db.raw(`?? + ?`, [columnToUpdate, amount]),
          updated_at: new Date()
        })
        .returning('*');
      
      // Commit transaction
      await trx.commit();
      
      return updatedWallet;
    } catch (error) {
      // Rollback transaction on error
      await trx.rollback();
      throw error;
    }
  }
  
  /**
   * Find wallet by phone number using mapping
   * @param {string} phoneNumber - Phone number
   * @returns {Object|null} Wallet or null
   */
  static async findByPhoneNumber(phoneNumber) {
    const mapping = await db('phone_wallet_mapping')
      .where({ phone_number: phoneNumber })
      .first();
    
    if (!mapping) {
      return null;
    }
    
    const wallet = await db('wallets')
      .where({ id: mapping.wallet_id })
      .first();
    
    return wallet || null;
  }
  
  /**
   * Create phone to wallet mapping
   * @param {string} phoneNumber - Phone number
   * @param {string} userId - User ID
   * @param {string} walletId - Wallet ID
   * @returns {Object} Created mapping
   */
  static async createPhoneMapping(phoneNumber, userId, walletId) {
    const [mapping] = await db('phone_wallet_mapping')
      .insert({
        phone_number: phoneNumber,
        user_id: userId,
        wallet_id: walletId,
      })
      .returning('*');
    
    return mapping;
  }
}

module.exports = Wallet; 