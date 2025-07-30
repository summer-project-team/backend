/**
 * Bank Integration Service
 * Handles integrations with partner banks for B2B transfers
 */
const { v4: uuidv4 } = require('uuid');
const { db } = require('../utils/database');
const transactionService = require('./transaction');
const pricingService = require('./pricingService');
const crypto = require('crypto');

class BankIntegrationService {
  /**
   * Register a new bank integration
   * @param {Object} bankData - Bank data
   * @returns {Promise<Object>} - Registered bank
   */
  async registerBank(bankData) {
    try {
      const [bank] = await db('bank_integrations')
        .insert({
          id: uuidv4(),
          bank_name: bankData.bank_name,
          bank_code: bankData.bank_code,
          swift_code: bankData.swift_code,
          country_code: bankData.country_code,
          api_key: bankData.api_key,
          api_secret: bankData.api_secret,
          integration_settings: JSON.stringify(bankData.integration_settings || {}),
          is_active: true,
          supports_b2b: bankData.supports_b2b || false,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      return bank;
    } catch (error) {
      console.error('Error registering bank:', error);
      throw error;
    }
  }
  
  /**
   * Verify bank API credentials
   * @param {string} apiKey - API key
   * @param {string} apiSecret - API secret
   * @returns {Promise<Object>} - Bank info if verified
   */
  async verifyBankCredentials(apiKey, apiSecret) {
    try {
      const bank = await db('bank_integrations')
        .where({
          api_key: apiKey,
          api_secret: apiSecret,
          is_active: true
        })
        .first();
      
      if (!bank) {
        throw new Error('Invalid bank credentials');
      }
      
      return {
        bank_id: bank.id,
        bank_name: bank.bank_name,
        bank_code: bank.bank_code,
        country_code: bank.country_code,
        supports_b2b: bank.supports_b2b
      };
    } catch (error) {
      console.error('Error verifying bank credentials:', error);
      throw error;
    }
  }
  
  /**
   * Get bank integration by ID
   * @param {string} bankId - Bank ID
   * @returns {Promise<Object>} - Bank integration
   */
  async getBankById(bankId) {
    try {
      const bank = await db('bank_integrations')
        .where({ id: bankId })
        .first();
      
      if (!bank) {
        throw new Error('Bank integration not found');
      }
      
      return bank;
    } catch (error) {
      console.error('Error getting bank integration:', error);
      throw error;
    }
  }
  
  /**
   * Get bank integration by bank code
   * @param {string} bankCode - Bank code
   * @returns {Promise<Object>} - Bank integration
   */
  async getBankByCode(bankCode) {
    try {
      const bank = await db('bank_integrations')
        .where({ bank_code: bankCode, is_active: true })
        .first();
      
      if (!bank) {
        throw new Error('Bank integration not found');
      }
      
      return bank;
    } catch (error) {
      console.error('Error getting bank integration by code:', error);
      throw error;
    }
  }
  
  /**
   * List all active bank integrations
   * @returns {Promise<Array>} - List of banks
   */
  async listBanks() {
    try {
      const banks = await db('bank_integrations')
        .where({ is_active: true })
        .select(
          'id',
          'bank_name',
          'bank_code',
          'swift_code',
          'country_code',
          'supports_b2b',
          'created_at'
        );
      
      return banks;
    } catch (error) {
      console.error('Error listing banks:', error);
      throw error;
    }
  }
  
  /**
   * Verify webhook signature
   * @param {string} signature - Webhook signature from header
   * @param {string} payload - Raw JSON payload as string
   * @returns {boolean} - Whether signature is valid
   */
  async verifyWebhookSignature(signature, payload) {
    try {
      // Get webhook secret from environment
      const webhookSecret = process.env.WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }
      
      // Create HMAC using the payload and secret
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');
      
      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }
  
  /**
   * Process webhook event
   * @param {string} transactionId - Transaction ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - Updated transaction
   */
  async processWebhookEvent(transactionId, status, metadata) {
    try {
      // Get the transaction
      const transaction = await db('transactions')
        .where({ id: transactionId })
        .first();
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }
      
      // Get the bank transaction
      const bankTransaction = await db('bank_transactions_proxy')
        .where({ transaction_id: transactionId })
        .first();
      
      if (!bankTransaction) {
        throw new Error('Bank transaction not found');
      }
      
      // Merge existing metadata with new metadata
      const existingMetadata = JSON.parse(transaction.metadata || '{}');
      const mergedMetadata = {
        ...existingMetadata,
        webhook_received_at: new Date().toISOString(),
        webhook_status: status,
        ...metadata
      };
      
      // Record the webhook event
      await db('transaction_events').insert({
        transaction_id: transactionId,
        event_type: 'webhook_received',
        event_data: JSON.stringify({
          status,
          metadata,
          timestamp: new Date().toISOString()
        }),
        created_at: new Date()
      });
      
      // Update transaction status if applicable
      // Only allow specific status transitions to prevent abuse
      let shouldUpdateStatus = false;
      const validTransitions = {
        'initiated': ['processing', 'cancelled'],
        'processing': ['completed', 'failed'],
        'completed': [],
        'failed': [],
        'cancelled': []
      };
      
      if (
        validTransitions[transaction.status] && 
        validTransitions[transaction.status].includes(status)
      ) {
        shouldUpdateStatus = true;
      }
      
      if (shouldUpdateStatus) {
        // Update transaction status
        await db('transactions')
          .where({ id: transactionId })
          .update({
            status,
            metadata: JSON.stringify(mergedMetadata),
            updated_at: new Date(),
            completed_at: status === 'completed' ? new Date() : transaction.completed_at,
            failed_at: status === 'failed' ? new Date() : transaction.failed_at,
            cancelled_at: status === 'cancelled' ? new Date() : transaction.cancelled_at
          });
      } else {
        // Just update metadata without changing status
        await db('transactions')
          .where({ id: transactionId })
          .update({
            metadata: JSON.stringify(mergedMetadata),
            updated_at: new Date()
          });
      }
      
      return {
        transaction_id: transactionId,
        reference: transaction.reference_id,
        status: shouldUpdateStatus ? status : transaction.status,
        updated: true
      };
    } catch (error) {
      console.error('Error processing webhook event:', error);
      throw error;
    }
  }
  
  /**
   * Process a bank-to-bank transfer request
   * @param {string} apiKey - Bank API key
   * @param {string} apiSecret - Bank API secret
   * @param {Object} transferData - Transfer data
   * @returns {Promise<Object>} - Transfer result
   */
  async processBankToBank(apiKey, apiSecret, transferData) {
    try {
      // Verify bank credentials
      const sourceBankInfo = await this.verifyBankCredentials(apiKey, apiSecret);
      
      if (!sourceBankInfo.supports_b2b) {
        throw new Error('Bank does not support B2B transfers');
      }
      
      // Get recipient bank
      const recipientBank = await db('bank_integrations')
        .where({
          bank_code: transferData.recipient_bank_code,
          is_active: true
        })
        .first();
      
      if (!recipientBank) {
        throw new Error('Recipient bank not found or not integrated');
      }
      
      // Generate quote for the transfer
      const quote = await pricingService.generateB2BQuote(
        transferData.source_currency,
        transferData.target_currency,
        parseFloat(transferData.amount),
        sourceBankInfo.country_code,
        recipientBank.country_code
      );
      
      // Prepare transfer data
      const b2bTransferData = {
        sender_bank_id: sourceBankInfo.bank_id,
        recipient_bank_id: recipientBank.id,
        sender_country_code: sourceBankInfo.country_code,
        recipient_country_code: recipientBank.country_code,
        amount: parseFloat(transferData.amount),
        source_currency: transferData.source_currency.toUpperCase(),
        target_currency: transferData.target_currency.toUpperCase(),
        exchange_rate: quote.exchange_rate,
        fee: quote.fee_amount,
        sender_bank_name: sourceBankInfo.bank_name,
        recipient_bank_name: recipientBank.bank_name,
        sender_account_number: transferData.sender_account_number,
        recipient_account_number: transferData.recipient_account_number,
        sender_account_name: transferData.sender_account_name,
        recipient_account_name: transferData.recipient_account_name,
        swift_code: recipientBank.swift_code,
        sort_code: transferData.sort_code,
        purpose: transferData.purpose,
        memo: transferData.memo,
        integration_id: transferData.transaction_reference || uuidv4(),
        callback_url: transferData.callback_url,
        rate_lock_duration: transferData.rate_lock_duration || 30,
        is_test: transferData.is_test || false
      };
      
      // Process the bank-to-bank transfer
      const transaction = await transactionService.processBankToBank(b2bTransferData);
      
      return {
        transaction_id: transaction.id,
        reference: transaction.reference_id || transferData.transaction_reference,
        amount: transaction.amount,
        source_currency: transaction.source_currency,
        target_currency: transaction.target_currency,
        exchange_rate: transaction.exchange_rate,
        fee: transaction.fee,
        status: transaction.status,
        created_at: transaction.created_at,
        estimated_time: '2 minutes',
        rate_lock_expiry: transferData.rate_lock_duration ? 
          new Date(Date.now() + (transferData.rate_lock_duration * 60 * 1000)).toISOString() : null,
        integration_id: JSON.parse(transaction.metadata).integration_id
      };
    } catch (error) {
      console.error('Error processing bank-to-bank transfer:', error);
      throw error;
    }
  }
  
  /**
   * Process a batch of bank-to-bank transfers
   * @param {string} apiKey - Bank API key
   * @param {string} apiSecret - Bank API secret
   * @param {string} batchId - Batch identifier
   * @param {Array} transfers - Array of transfer data objects
   * @returns {Promise<Object>} - Batch processing results
   */
  async processBatchTransfer(apiKey, apiSecret, batchId, transfers) {
    try {
      // Verify bank credentials
      const sourceBankInfo = await this.verifyBankCredentials(apiKey, apiSecret);
      
      if (!sourceBankInfo.supports_b2b) {
        throw new Error('Bank does not support B2B transfers');
      }
      
      // Use provided batch ID or generate one
      const finalBatchId = batchId || `BATCH-${uuidv4()}`;
      
      // Create a batch record
      const [batch] = await db('bank_transfer_batches').insert({
        id: finalBatchId,
        bank_id: sourceBankInfo.bank_id,
        transfer_count: transfers.length,
        status: 'processing',
        created_at: new Date(),
        updated_at: new Date(),
        is_test: transfers[0]?.is_test || false
      }).returning('*');
      
      // Process each transfer
      const results = {
        batch_id: finalBatchId,
        transfers: [],
        accepted_count: 0,
        rejected_count: 0
      };
      
      for (const transfer of transfers) {
        try {
          // Prepare transfer with batch ID
          const transferWithBatch = {
            ...transfer,
            batch_id: finalBatchId,
            transaction_reference: transfer.transaction_reference || `${finalBatchId}-${uuidv4().substring(0, 8)}`
          };
          
          // Process individual transfer
          const transferResult = await this.processBankToBank(apiKey, apiSecret, transferWithBatch);
          
          // Record success
          results.transfers.push({
            transaction_id: transferResult.transaction_id,
            reference: transferResult.reference,
            status: 'accepted',
            recipient_account: transfer.recipient_account.account_number,
            amount: transfer.amount,
          });
          
          results.accepted_count++;
        } catch (error) {
          // Record failure but continue with batch
          results.transfers.push({
            reference: transfer.transaction_reference || `${finalBatchId}-ERROR-${uuidv4().substring(0, 8)}`,
            status: 'rejected',
            recipient_account: transfer.recipient_account?.account_number,
            amount: transfer.amount,
            error: error.message
          });
          
          results.rejected_count++;
        }
      }
      
      // Update batch status
      const batchStatus = results.rejected_count === transfers.length ? 'failed' : 
                         results.rejected_count > 0 ? 'partial' : 'processing';
      
      await db('bank_transfer_batches')
        .where({ id: finalBatchId })
        .update({
          status: batchStatus,
          accepted_count: results.accepted_count,
          rejected_count: results.rejected_count,
          updated_at: new Date()
        });
      
      return results;
    } catch (error) {
      console.error('Error processing batch transfer:', error);
      throw error;
    }
  }
  
  /**
   * Get bank transfer status
   * @param {string} apiKey - Bank API key
   * @param {string} apiSecret - Bank API secret
   * @param {string} transferId - Transfer ID
   * @returns {Promise<Object>} - Transfer status
   */
  async getTransferStatus(apiKey, apiSecret, transferId) {
    try {
      // Verify bank credentials
      await this.verifyBankCredentials(apiKey, apiSecret);
      
      // Get transaction
      const transaction = await db('transactions')
        .where({ id: transferId })
        .first();
      
      if (!transaction) {
        throw new Error('Transfer not found');
      }
      
      // Get bank transaction details
      const bankTransaction = await db('bank_transactions')
        .where({ transaction_id: transferId })
        .first();
      
      if (!bankTransaction) {
        throw new Error('Bank transfer details not found');
      }
      
      // Get transaction events
      const events = await db('transaction_events')
        .where({ transaction_id: transferId })
        .orderBy('created_at', 'asc');
      
      const transactionEvents = events.map(event => ({
        type: event.event_type,
        timestamp: event.created_at,
        data: JSON.parse(event.event_data)
      }));
      
      return {
        transaction_id: transaction.id,
        reference: transaction.reference_id,
        amount: transaction.amount,
        source_currency: transaction.source_currency,
        target_currency: transaction.target_currency,
        exchange_rate: transaction.exchange_rate,
        fee: transaction.fee,
        status: transaction.status,
        events: transactionEvents,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at,
        completed_at: transaction.completed_at || null,
        metadata: JSON.parse(transaction.metadata)
      };
    } catch (error) {
      console.error('Error getting transfer status:', error);
      throw error;
    }
  }
}

// Create singleton instance
const bankIntegrationService = new BankIntegrationService();

module.exports = bankIntegrationService; 