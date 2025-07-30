const { db } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Transaction model
 */
class Transaction {
  /**
   * Create a new transaction
   * @param {Object} transactionData - Transaction data
   * @returns {Object} Created transaction
   */
  static async create(transactionData) {
    // Generate reference if not provided
    if (!transactionData.reference) {
      const prefix = `TRX-${transactionData.currency_from}-${transactionData.currency_to}`;
      const uniqueId = uuidv4().substring(0, 8);
      transactionData.reference = `${prefix}-${uniqueId}`;
    }
    
    // Ensure exchange_rate is always set (default to 1.0 for same currency)
    if (!transactionData.exchange_rate) {
      transactionData.exchange_rate = 1.0;
    }
    
    // Ensure required fields are set
    const transactionToInsert = {
      id: transactionData.id || uuidv4(),
      ...transactionData,
      created_at: transactionData.created_at || new Date(),
      updated_at: transactionData.updated_at || new Date()
    };
    
    const [transaction] = await db('transactions')
      .insert(transactionToInsert)
      .returning('*');
    
    return transaction;
  }
  
  /**
   * Find transaction by ID
   * @param {string} id - Transaction ID
   * @returns {Object|null} Transaction or null
   */
  static async findById(id) {
    const transaction = await db('transactions')
      .where({ id })
      .first();
    
    return transaction || null;
  }
  
  /**
   * Find transaction by reference
   * @param {string} reference - Transaction reference
   * @returns {Object|null} Transaction or null
   */
  static async findByReference(reference) {
    const transaction = await db('transactions')
      .where({ reference })
      .first();
    
    return transaction || null;
  }
  
  /**
   * Update transaction status
   * @param {string} id - Transaction ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Object} Updated transaction
   */
  static async updateStatus(id, status, additionalData = {}) {
    const updateData = {
      status,
      ...additionalData,
    };
    
    // Add completed_at timestamp if status is completed
    if (status === 'completed' && !additionalData.completed_at) {
      updateData.completed_at = db.fn.now();
    }
    
    const [transaction] = await db('transactions')
      .where({ id })
      .update(updateData)
      .returning('*');
    
    return transaction;
  }
  
  /**
   * Get user's transaction history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} Transactions
   */
  static async getUserTransactions(userId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      status,
      type,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;
    
    const query = db('transactions')
      .where(function() {
        this.where('sender_id', userId)
          .orWhere('recipient_id', userId);
      })
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);
    
    // Apply filters if provided
    if (status) {
      query.where('status', status);
    }
    
    if (type) {
      query.where('transaction_type', type);
    }
    
    const transactions = await query;
    
    // Get total count
    const [{ count }] = await db('transactions')
      .where(function() {
        this.where('sender_id', userId)
          .orWhere('recipient_id', userId);
      })
      .count();
    
    return {
      transactions,
      pagination: {
        total: parseInt(count),
        limit,
        offset,
        hasMore: parseInt(count) > offset + limit,
      },
    };
  }
  
  /**
   * Get transaction by phone numbers
   * @param {string} senderPhone - Sender phone number
   * @param {string} recipientPhone - Recipient phone number
   * @param {Object} options - Query options
   * @returns {Array} Transactions
   */
  static async getTransactionsByPhones(senderPhone, recipientPhone, options = {}) {
    const {
      limit = 20,
      offset = 0,
      status,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;
    
    const query = db('transactions')
      .where(function() {
        this.where({ sender_phone: senderPhone, recipient_phone: recipientPhone })
          .orWhere({ sender_phone: recipientPhone, recipient_phone: senderPhone });
      })
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);
    
    // Apply status filter if provided
    if (status) {
      query.where('status', status);
    }
    
    return await query;
  }

/**
 * Get recent transactions for a user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of transactions to return
 * @returns {Promise<Array>} Recent transactions
 */
static async getRecentTransactions(userId, limit = 5) {
  try {
    const transactions = await db('transactions')
      .select('id', 'transaction_type', 'amount', 'currency_from', 'currency_to', 'status', 'created_at')
      .where(function() {
        this.where('sender_id', userId)
          .orWhere('recipient_id', userId);
      })
      .orderBy('created_at', 'desc')
      .limit(limit);
    
    return transactions;
  } catch (error) {
    console.error(`Error getting recent transactions for user ${userId}:`, error);
    return [];
  }
}
}

module.exports = Transaction; 