/**
 * Transaction Service for enhanced transaction processing
 */
const { v4: uuidv4 } = require('uuid');
const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);

// Will be imported once WebSocket service is created
let websocketService;
try {
  websocketService = require('./websocket');
} catch (error) {
  console.log('WebSocket service not available yet');
  websocketService = {
    sendTransactionUpdate: () => false,
    sendNotification: () => false
  };
}

class TransactionService {
/**
 * Create a new transaction
 * @param {Object} transactionData - Transaction data
 * @returns {Promise<Object>} - Created transaction
 */
async createTransaction(transactionData) {
  const transactionId = uuidv4();
  const reference = `TRX-${transactionData.source_currency}-${transactionData.target_currency}-${Date.now().toString().slice(-6)}`;
  
  // Validate transaction_type
  const validTypes = ['app_transfer', 'deposit', 'withdrawal', 'mint', 'burn', 'bank_to_bank'];
  if (!transactionData.transaction_type) {
    throw new Error('transaction_type is required');
  }
  if (!validTypes.includes(transactionData.transaction_type)) {
    throw new Error(`Invalid transaction_type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  // Ensure exchange_rate is set
  const exchangeRate = (typeof transactionData.exchange_rate === 'number' && !isNaN(transactionData.exchange_rate)) ? transactionData.exchange_rate : 1.0;
  
  // Begin transaction
  const transaction = await knex.transaction(async (trx) => {
    console.log('=== DEBUG: About to insert transaction ===');
    console.log('exchangeRate:', exchangeRate);
    console.log('typeof exchangeRate:', typeof exchangeRate);
    console.log('transactionData.exchange_rate:', transactionData.exchange_rate);
    console.log('Full insert data:', {
      id: transactionId,
      sender_id: transactionData.sender_id,
      recipient_id: transactionData.recipient_id,
      amount: transactionData.amount,
      source_currency: transactionData.source_currency,
      target_currency: transactionData.target_currency,
      exchange_rate: exchangeRate,
      fee: transactionData.fee,
      transaction_type: transactionData.transaction_type,
      reference_id: reference
    });

    // Create the transaction record with 'initiated' status
    const [createdTransaction] = await trx('transactions').insert({
      id: transactionId,
      sender_id: transactionData.sender_id,
      recipient_id: transactionData.recipient_id,
      sender_phone: transactionData.sender_phone,
      recipient_phone: transactionData.recipient_phone,
      sender_country_code: transactionData.sender_country_code,
      recipient_country_code: transactionData.recipient_country_code,
      amount: transactionData.amount,
      source_currency: transactionData.source_currency,
      target_currency: transactionData.target_currency,
      exchange_rate: exchangeRate,
      fee: transactionData.fee,
      status: 'initiated',
      transaction_type: transactionData.transaction_type, // Add transaction_type here
      reference_id: reference,
      metadata: JSON.stringify(transactionData.metadata || {}),
      created_at: new Date(),
      updated_at: new Date(),
      is_test: transactionData.is_test || false
    }).returning('*');

    // Create initial transaction event
    await trx('transaction_events').insert({
      transaction_id: transactionId,
      event_type: 'initiated',
      event_data: JSON.stringify({
        amount: transactionData.amount,
        source_currency: transactionData.source_currency,
        target_currency: transactionData.target_currency,
        fee: transactionData.fee,
        transaction_type: transactionData.transaction_type
      }),
      created_at: new Date()
    });

    return createdTransaction;
  });

  // Send real-time update
  if (websocketService) {
    websocketService.sendTransactionUpdate(transaction.sender_id, transaction);
  }
  
  return transaction;
}

  /**
   * Process a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Updated transaction
   */
  async processTransaction(transactionId) {
    // Begin transaction
    const transaction = await knex.transaction(async (trx) => {
      // Get transaction
      const [txn] = await trx('transactions')
        .where({ id: transactionId })
        .update({
          status: 'processing',
          processing_started_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      if (!txn) {
        throw new Error('Transaction not found');
      }

      // Create transaction event
      await trx('transaction_events').insert({
        transaction_id: transactionId,
        event_type: 'processing',
        event_data: JSON.stringify({
          started_at: new Date().toISOString()
        }),
        created_at: new Date()
      });

      return txn;
    });

    // Send real-time update
    if (websocketService) {
      websocketService.sendTransactionUpdate(transaction.sender_id, transaction);
    }
    
    return transaction;
  }

/**
   * Complete a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Updated transaction
   */
async completeTransaction(transactionId) {
  // Begin transaction
  const transaction = await knex.transaction(async (trx) => {
    // Get transaction
    const txn = await trx('transactions').where({ id: transactionId }).first();
    
    if (!txn) {
      throw new Error('Transaction not found');
    }

    // Check if transaction can be completed
    if (txn.status !== 'processing' && txn.status !== 'initiated') {
      throw new Error(`Cannot complete transaction with status: ${txn.status}`);
    }

    // Handle different transaction types
    if (txn.transaction_type === 'deposit') {
      // For deposits, sender_id is null, only credit recipient
      if (txn.recipient_id) {
        await this.updateWalletBalance(trx, txn.recipient_id, txn.target_currency, parseFloat(txn.amount) * parseFloat(txn.exchange_rate));
      }
    } else if (txn.transaction_type === 'withdrawal') {
      // For withdrawals, CBUSD was already burned upfront
      // NO wallet updates needed - money goes to external bank account
      console.log(`Withdrawal completed: CBUSD already burned, no wallet updates needed`);
    } else {
      // For regular transactions (app_transfer, etc.)
      
      // Update sender wallet (deduct amount + fee) - only if sender exists
      if (txn.sender_id) {
        const senderWallet = await trx('wallets')
          .where({ user_id: txn.sender_id })
          .first();
        
        if (!senderWallet) {
          throw new Error('Sender wallet not found');
        }

        // Get the balance column for source currency
        const senderBalanceColumn = this.getCurrencyBalanceColumn(txn.source_currency);
        
        // Check if sufficient balance
        const totalDeduction = parseFloat(txn.amount) + parseFloat(txn.fee);
        if (senderWallet[senderBalanceColumn] < totalDeduction) {
          throw new Error('Insufficient balance');
        }

        // Deduct from sender
        await trx('wallets')
          .where({ id: senderWallet.id })
          .decrement(senderBalanceColumn, totalDeduction)
          .update({ updated_at: new Date() });
      }

      // Update recipient wallet (add converted amount) - only if recipient exists
      if (txn.recipient_id) {
        await this.updateWalletBalance(trx, txn.recipient_id, txn.target_currency, parseFloat(txn.amount) * parseFloat(txn.exchange_rate));
      }
    }

    // Update transaction status
    const [updatedTxn] = await trx('transactions')
      .where({ id: transactionId })
      .update({
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    // Create transaction event
    await trx('transaction_events').insert({
      transaction_id: transactionId,
      event_type: 'completed',
      event_data: JSON.stringify({
        completed_at: new Date().toISOString(),
        converted_amount: parseFloat(txn.amount) * parseFloat(txn.exchange_rate)
      }),
      created_at: new Date()
    });

    return updatedTxn;
  });

  // Send real-time updates
  if (websocketService) {
    if (transaction.sender_id) {
      websocketService.sendTransactionUpdate(transaction.sender_id, transaction);
    }
    if (transaction.recipient_id) {
      websocketService.sendTransactionUpdate(transaction.recipient_id, transaction);
    }
    
    // Send notifications
    if (transaction.sender_id) {
      websocketService.sendNotification(transaction.sender_id, {
        type: 'transaction_completed',
        title: 'Transfer Completed',
        message: `Your transfer of ${transaction.amount} ${transaction.source_currency} has been completed.`,
        transaction_id: transaction.id
      });
    }

    if (transaction.recipient_id && transaction.sender_phone) {
      websocketService.sendNotification(transaction.recipient_id, {
        type: 'funds_received',
        title: 'Funds Received',
        message: `You have received funds from ${transaction.sender_phone}.`,
        transaction_id: transaction.id
      });
    }
  }
  
  return transaction;
}

/**
 * Helper method to get the balance column name for a currency
 * @param {string} currency - Currency code
 * @returns {string} - Balance column name
 */
getCurrencyBalanceColumn(currency) {
  const normalizedCurrency = currency.toUpperCase();
  switch (normalizedCurrency) {
    case 'NGN':
      return 'balance_ngn';
    case 'GBP':
      return 'balance_gbp';
    case 'USD':
      return 'balance_usd';
    case 'CBUSD':
      return 'cbusd_balance';
    default:
      throw new Error(`Unsupported currency: ${currency}`);
  }
}

/**
 * Helper method to update wallet balance for a user
 * @param {Object} trx - Knex transaction object
 * @param {string} userId - User ID
 * @param {string} currency - Currency code
 * @param {number} amount - Amount to add
 */
async updateWalletBalance(trx, userId, currency, amount) {
  // Safety check: Do not process null or undefined userIds
  if (!userId) {
    console.log(`⚠️  updateWalletBalance: Skipping null/undefined userId`);
    return;
  }

  // Get or create user wallet
  let wallet = await trx('wallets')
    .where({ user_id: userId })
    .first();
  
  if (!wallet) {
    // Create wallet if it doesn't exist
    const walletId = uuidv4();
    await trx('wallets').insert({
      id: walletId,
      user_id: userId,
      balance_ngn: 0,
      balance_gbp: 0,
      balance_usd: 0,
      cbusd_balance: 0,
      wallet_address: `wallet_${userId.substr(-8)}_${Date.now()}`,
      created_at: new Date(),
      updated_at: new Date()
    });
    
    wallet = await trx('wallets')
      .where({ id: walletId })
      .first();
  }

  // Get the balance column for target currency
  const balanceColumn = this.getCurrencyBalanceColumn(currency);
  
  // Add to recipient balance
  await trx('wallets')
    .where({ id: wallet.id })
    .increment(balanceColumn, amount)
    .update({ updated_at: new Date() });
}

  /**
   * Fail a transaction
   * @param {string} transactionId - Transaction ID
   * @param {string} reason - Failure reason
   * @returns {Promise<Object>} - Updated transaction
   */
  async failTransaction(transactionId, reason) {
    // Begin transaction
    const transaction = await knex.transaction(async (trx) => {
      // Update transaction status
      const [updatedTxn] = await trx('transactions')
        .where({ id: transactionId })
        .update({
          status: 'failed',
          failed_at: new Date(),
          failure_reason: reason,
          updated_at: new Date()
        })
        .returning('*');

      if (!updatedTxn) {
        throw new Error('Transaction not found');
      }

      // Create transaction event
      await trx('transaction_events').insert({
        transaction_id: transactionId,
        event_type: 'failed',
        event_data: JSON.stringify({
          failed_at: new Date().toISOString(),
          reason
        }),
        created_at: new Date()
      });

      return updatedTxn;
    });

    // Send real-time update
    if (websocketService) {
      websocketService.sendTransactionUpdate(transaction.sender_id, transaction);
      
      // Send notification
      websocketService.sendNotification(transaction.sender_id, {
        type: 'transaction_failed',
        title: 'Transfer Failed',
        message: `Your transfer of ${transaction.amount} ${transaction.source_currency} has failed: ${reason}`,
        transaction_id: transaction.id
      });
    }
    
    return transaction;
  }

  /**
   * Cancel a transaction
   * @param {string} transactionId - Transaction ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>} - Updated transaction
   */
  async cancelTransaction(transactionId, reason) {
    // Begin transaction
    const transaction = await knex.transaction(async (trx) => {
      // Get transaction
      const txn = await trx('transactions').where({ id: transactionId }).first();
      
      if (!txn) {
        throw new Error('Transaction not found');
      }

      // Check if transaction can be cancelled
      if (txn.status !== 'initiated' && txn.status !== 'processing') {
        throw new Error(`Cannot cancel transaction with status: ${txn.status}`);
      }

      // Update transaction status
      const [updatedTxn] = await trx('transactions')
        .where({ id: transactionId })
        .update({
          status: 'cancelled',
          cancelled_at: new Date(),
          cancellation_reason: reason,
          updated_at: new Date()
        })
        .returning('*');

      // Create transaction event
      await trx('transaction_events').insert({
        transaction_id: transactionId,
        event_type: 'cancelled',
        event_data: JSON.stringify({
          cancelled_at: new Date().toISOString(),
          reason
        }),
        created_at: new Date()
      });

      return updatedTxn;
    });

    // Send real-time update
    if (websocketService) {
      websocketService.sendTransactionUpdate(transaction.sender_id, transaction);
      
      // Send notification
      websocketService.sendNotification(transaction.sender_id, {
        type: 'transaction_cancelled',
        title: 'Transfer Cancelled',
        message: `Your transfer of ${transaction.amount} ${transaction.source_currency} has been cancelled.`,
        transaction_id: transaction.id
      });
    }
    
    return transaction;
  }

  /**
   * Get transaction by ID
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} - Transaction
   */
  async getTransaction(transactionId) {
    const transaction = await knex('transactions').where({ id: transactionId }).first();
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    return transaction;
  }

  /**
   * Get transaction events
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Array>} - Transaction events
   */
  async getTransactionEvents(transactionId) {
    const events = await knex('transaction_events')
      .where({ transaction_id: transactionId })
      .orderBy('created_at', 'asc');
    
    return events;
  }

  /**
   * Get user transactions
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Transactions with pagination
   */
  async getUserTransactions(userId, options = {}) {
    const { 
      limit = 20, 
      offset = 0, 
      status = null, 
      startDate = null, 
      endDate = null,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    // Build query
    let query = knex('transactions')
      .where(function() {
        this.where('sender_id', userId).orWhere('recipient_id', userId);
      });
    
    // Apply filters
    if (status) {
      query = query.where('status', status);
    }
    
    if (startDate) {
      query = query.where('created_at', '>=', new Date(startDate));
    }
    
    if (endDate) {
      query = query.where('created_at', '<=', new Date(endDate));
    }
    
    // Apply sorting
    query = query.orderBy(sortBy, sortOrder);
    
    // Apply pagination
    query = query.limit(parseInt(limit)).offset(parseInt(offset));
    
    // Execute query
    const transactions = await query;
    
    // Get total count
    const countQuery = knex('transactions')
      .count('* as total')
      .where(function() {
        this.where('sender_id', userId).orWhere('recipient_id', userId);
      });
    
    // Apply filters to count query
    if (status) {
      countQuery.where('status', status);
    }
    
    if (startDate) {
      countQuery.where('created_at', '>=', new Date(startDate));
    }
    
    if (endDate) {
      countQuery.where('created_at', '<=', new Date(endDate));
    }
    
    const [{ total }] = await countQuery;
    
    return {
      transactions,
      pagination: {
        total: parseInt(total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(total) > parseInt(offset) + transactions.length,
      },
    };
  }

  /**
   * Save a recipient
   * @param {string} userId - User ID
   * @param {Object} recipientData - Recipient data
   * @returns {Promise<Object>} - Saved recipient
   */
  async saveRecipient(userId, recipientData) {
    const { recipient_phone, recipient_name, country_code } = recipientData;
    
    // Check if recipient already exists
    const existingRecipient = await knex('saved_recipients')
      .where({ 
        user_id: userId,
        recipient_phone
      })
      .first();
    
    if (existingRecipient) {
      // Update existing recipient
      const [updatedRecipient] = await knex('saved_recipients')
        .where({ id: existingRecipient.id })
        .update({
          recipient_name,
          country_code,
          updated_at: new Date(),
          last_used_at: new Date()
        })
        .returning('*');
      
      return updatedRecipient;
    } else {
      // Create new recipient
      const [newRecipient] = await knex('saved_recipients')
        .insert({
          id: uuidv4(),
          user_id: userId,
          recipient_phone,
          recipient_name,
          country_code,
          is_favorite: false,
          created_at: new Date(),
          updated_at: new Date(),
          last_used_at: new Date()
        })
        .returning('*');
      
      return newRecipient;
    }
  }

  /**
   * Get saved recipients
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Saved recipients
   */
  async getSavedRecipients(userId) {
    const recipients = await knex('saved_recipients')
      .where({ user_id: userId })
      .orderBy([
        { column: 'is_favorite', order: 'desc' },
        { column: 'last_used_at', order: 'desc' }
      ]);
    
    return recipients;
  }

  /**
   * Toggle recipient favorite status
   * @param {string} userId - User ID
   * @param {string} recipientId - Recipient ID
   * @returns {Promise<Object>} - Updated recipient
   */
  async toggleFavoriteRecipient(userId, recipientId) {
    const recipient = await knex('saved_recipients')
      .where({ 
        id: recipientId,
        user_id: userId
      })
      .first();
    
    if (!recipient) {
      throw new Error('Recipient not found');
    }
    
    const [updatedRecipient] = await knex('saved_recipients')
      .where({ id: recipientId })
      .update({
        is_favorite: !recipient.is_favorite,
        updated_at: new Date()
      })
      .returning('*');
    
    return updatedRecipient;
  }

  /**
   * Delete a saved recipient
   * @param {string} userId - User ID
   * @param {string} recipientId - Recipient ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRecipient(userId, recipientId) {
    const deleted = await knex('saved_recipients')
      .where({ 
        id: recipientId,
        user_id: userId
      })
      .delete();
    
    return deleted > 0;
  }
  
  /**
   * Process a bank-to-bank transfer
   * This method handles B2B infrastructure transactions between banks using CrossBridge
   * @param {Object} transferData - Transfer data
   * @returns {Promise<Object>} - Transfer result
   */
  async processBankToBank(transferData) {
    const transactionId = uuidv4();
    // Use provided transaction_reference if available
    const reference = transferData.transaction_reference || 
      `B2B-${transferData.source_currency}-${transferData.target_currency}-${Date.now().toString().slice(-6)}`;
    
    // Create mock user IDs for the banks if they don't exist as UUID
    // This is a temporary solution until we have a proper bank entity model
    const isSenderBankUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferData.sender_bank_id);
    const isRecipientBankUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transferData.recipient_bank_id);
    
    // Generate proxy UUIDs for string bank IDs
    const senderIdToUse = isSenderBankUuid ? transferData.sender_bank_id : uuidv4();
    const recipientIdToUse = isRecipientBankUuid ? transferData.recipient_bank_id : uuidv4();
    
    // Begin transaction
    const transaction = await knex.transaction(async (trx) => {
      // Create the transaction record with 'initiated' status
      const [createdTransaction] = await trx('transactions').insert({
        id: transactionId,
        sender_id: senderIdToUse, // Use UUID
        recipient_id: recipientIdToUse, // Use UUID
        sender_phone: null, // Not applicable for B2B
        recipient_phone: null, // Not applicable for B2B
        sender_country_code: transferData.sender_country_code,
        recipient_country_code: transferData.recipient_country_code,
        amount: transferData.amount,
        source_currency: transferData.source_currency,
        target_currency: transferData.target_currency,
        exchange_rate: transferData.exchange_rate,
        fee: transferData.fee,
        status: 'initiated',
        reference_id: reference,
        transaction_type: 'bank_to_bank',
        metadata: JSON.stringify({
          sender_bank_id: transferData.sender_bank_id, // Store original bank ID
          recipient_bank_id: transferData.recipient_bank_id, // Store original bank ID
          sender_bank_name: transferData.sender_bank_name,
          recipient_bank_name: transferData.recipient_bank_name,
          sender_account_number: transferData.sender_account_number,
          recipient_account_number: transferData.recipient_account_number,
          sender_account_name: transferData.sender_account_name,
          recipient_account_name: transferData.recipient_account_name,
          swift_code: transferData.swift_code,
          sort_code: transferData.sort_code,
          purpose: transferData.purpose || '',
          memo: transferData.memo || '',
          callback_url: transferData.callback_url || null,
          rate_lock_duration: transferData.rate_lock_duration || 30,
          rate_lock_expiry: transferData.rate_lock_duration ? 
            new Date(Date.now() + (transferData.rate_lock_duration * 60 * 1000)).toISOString() : null,
          integration_id: transferData.integration_id || null,
          transaction_reference: transferData.transaction_reference || null
        }),
        created_at: new Date(),
        updated_at: new Date(),
        is_test: transferData.is_test || false
      }).returning('*');

      // Create initial transaction event
      await trx('transaction_events').insert({
        transaction_id: transactionId,
        event_type: 'initiated',
        event_data: JSON.stringify({
          amount: transferData.amount,
          source_currency: transferData.source_currency,
          target_currency: transferData.target_currency,
          fee: transferData.fee,
          bank_to_bank: true,
          transaction_reference: transferData.transaction_reference || null
        }),
        created_at: new Date()
      });

      return createdTransaction;
    });
    
    // Immediately start processing the transaction in the background
    this.processBankToBankSteps(transaction).catch(err => {
      console.error('Background bank-to-bank processing error:', err);
    });
    
    return transaction;
  }
  
  /**
   * Process the steps of a bank-to-bank transfer
   * This handles the conversion through CBUSD and settlement to the recipient bank
   * @param {Object} transaction - Transaction object
   * @returns {Promise<Object>} - Updated transaction
   */
  async processBankToBankSteps(transaction) {
    try {
      // Update to processing status
      await this.processTransaction(transaction.id);
      
      // Get metadata
      const metadata = typeof transaction.metadata === 'string' 
        ? JSON.parse(transaction.metadata) 
        : transaction.metadata;
      
      // Create a record in bank_transactions_proxy table
      await knex('bank_transactions_proxy').insert({
        transaction_id: transaction.id,
        sender_bank_id: metadata.sender_bank_id,
        recipient_bank_id: metadata.recipient_bank_id,
        amount: transaction.amount,
        source_currency: transaction.source_currency,
        target_currency: transaction.target_currency,
        status: 'processing',
        exchange_rate: transaction.exchange_rate,
        fee: transaction.fee,
        reference: transaction.reference_id,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // Step 1: Convert from source currency to CBUSD
      await knex('transaction_events').insert({
        transaction_id: transaction.id,
        event_type: 'convert_to_cbusd',
        event_data: JSON.stringify({
          from_currency: transaction.source_currency,
          amount: transaction.amount,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });
      
      // Step 2: Transfer CBUSD to recipient bank's pool
      await knex('transaction_events').insert({
        transaction_id: transaction.id,
        event_type: 'cbusd_transfer',
        event_data: JSON.stringify({
          amount: transaction.amount,
          recipient_bank: metadata.recipient_bank_name,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });
      
      // Step 3: Convert from CBUSD to target currency
      const convertedAmount = parseFloat(transaction.amount) * parseFloat(transaction.exchange_rate);
      await knex('transaction_events').insert({
        transaction_id: transaction.id,
        event_type: 'convert_from_cbusd',
        event_data: JSON.stringify({
          to_currency: transaction.target_currency,
          converted_amount: convertedAmount,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });
      
      // Step 4: Settle to recipient bank account
      await knex('transaction_events').insert({
        transaction_id: transaction.id,
        event_type: 'settlement',
        event_data: JSON.stringify({
          recipient_account: metadata.recipient_account_number,
          recipient_name: metadata.recipient_account_name,
          amount: convertedAmount,
          currency: transaction.target_currency,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });
      
      // Complete the transaction
      const completedTransaction = await this.completeTransaction(transaction.id);
      
      // Update bank_transactions_proxy record
      await knex('bank_transactions_proxy').where({ transaction_id: transaction.id }).update({
        status: 'completed',
        settled_amount: convertedAmount,
        completed_at: new Date(),
        updated_at: new Date()
      });
      
      return completedTransaction;
    } catch (error) {
      console.error('Bank-to-bank transfer failed:', error);
      
      // Fail the transaction
      await this.failTransaction(transaction.id, error.message);
      
      // Update bank_transactions_proxy record
      await knex('bank_transactions_proxy').where({ transaction_id: transaction.id }).update({
        status: 'failed',
        failure_reason: error.message,
        updated_at: new Date()
      });
      
      throw error;
    }
  }
}

// Create a singleton instance
const transactionService = new TransactionService();

module.exports = transactionService; 