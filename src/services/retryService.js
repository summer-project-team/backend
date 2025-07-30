/**
 * Transaction Retry Service
 * Handles automatic retries for failed or stuck transactions
 */
const { v4: uuidv4 } = require('uuid');
const { db } = require('../utils/database');
const { setCache, getCache, deleteCache, redisClient } = require('../utils/redis');
const Transaction = require('../models/Transaction');
const fallbackService = require('./fallbackService');
const { notifyTransactionUpdate } = require('../utils/websocket');

class RetryService {
  constructor() {
    this.retryQueue = 'transaction:retry:queue';
    this.processingKey = 'transaction:retry:processing';
    this.maxRetries = 3;
    this.retryIntervals = [
      60, // 1 minute
      300, // 5 minutes
      1800 // 30 minutes
    ];
    this.isProcessing = false;
  }

  /**
   * Schedule a transaction for retry
   * @param {string} transactionId - Transaction ID
   * @param {string} reason - Reason for retry
   * @param {number} retryCount - Current retry count
   * @param {string} failureType - Type of failure
   */
  async scheduleRetry(transactionId, reason, retryCount = 0, failureType = 'unknown') {
    try {
      // Check if transaction exists
      const transaction = await Transaction.findById(transactionId);
      
      if (!transaction) {
        console.error(`Cannot schedule retry for non-existent transaction: ${transactionId}`);
        return false;
      }
      
      // Check if we've reached the max retry count
      if (retryCount >= this.maxRetries) {
        console.log(`Max retries reached for transaction ${transactionId}, marking as permanently failed`);
        await this._markPermanentlyFailed(transactionId, reason);
        return false;
      }
      
      // Calculate next retry time
      const retryDelaySeconds = this.retryIntervals[retryCount] || this.retryIntervals[this.retryIntervals.length - 1];
      const nextRetryTime = Date.now() + (retryDelaySeconds * 1000);
      
      // Create retry record
      const retryId = uuidv4();
      const retryData = {
        retry_id: retryId,
        transaction_id: transactionId,
        retry_count: retryCount,
        next_retry_time: nextRetryTime,
        failure_reason: reason,
        failure_type: failureType,
        created_at: Date.now()
      };
      
      // Add to database for persistence
      await db('transaction_retries').insert({
        id: retryId,
        transaction_id: transactionId,
        retry_count: retryCount,
        next_retry_time: new Date(nextRetryTime),
        failure_reason: reason,
        failure_type: failureType,
        status: 'pending',
        created_at: new Date()
      });
      
      // Add to Redis for quick access using helper function
      await setCache(
        `transaction:retry:${retryId}`,
        retryData,
        retryDelaySeconds + 3600 // Give it an hour buffer
      );
      
      // Add to retry queue with score as timestamp for sorted set
      await redisClient.zAdd(this.retryQueue, {
        score: nextRetryTime,
        value: retryId
      });
      
      // Update transaction status to reflect retry
      await Transaction.updateStatus(transactionId, 'retry_scheduled', {
        metadata: JSON.stringify({
          ...JSON.parse(transaction.metadata || '{}'),
          retry_info: {
            retry_id: retryId,
            retry_count: retryCount,
            next_retry: new Date(nextRetryTime).toISOString(),
            reason: reason
          }
        }),
      });
      
      console.log(`Scheduled retry #${retryCount + 1} for transaction ${transactionId} at ${new Date(nextRetryTime).toISOString()}`);
      return true;
    } catch (error) {
      console.error('Error scheduling transaction retry:', error);
      return false;
    }
  }
  
  /**
   * Process all pending retries that are due
   */
  async processRetryQueue() {
    if (this.isProcessing) {
      return;
    }
    
    try {
      this.isProcessing = true;
      
      // Get lock to prevent multiple instances from processing same retries
      const gotLock = await setCache(
        this.processingKey,
        { processing_id: uuidv4() },
        30 // 30 second lock
      );
      
      if (!gotLock) {
        console.log('Another instance is already processing retries');
        this.isProcessing = false;
        return;
      }
      
      console.log('Processing transaction retry queue');
      
      // Get all retries that are due (score <= current time)
      const now = Date.now();
      const retryIds = await redisClient.zRangeByScore(
        this.retryQueue,
        0, // Min score
        now // Max score (current time)
      );
      
      if (!retryIds.length) {
        console.log('No retries due for processing');
        this.isProcessing = false;
        return;
      }
      
      console.log(`Found ${retryIds.length} retries due for processing`);
      
      // Process each retry
      for (const retryId of retryIds) {
        await this._processRetry(retryId);
        
        // Remove from retry queue
        await redisClient.zRem(this.retryQueue, retryId);
      }
      
    } catch (error) {
      console.error('Error processing retry queue:', error);
    } finally {
      // Release lock
      await deleteCache(this.processingKey);
      this.isProcessing = false;
    }
  }
  
  /**
   * Process a specific retry
   * @param {string} retryId - Retry ID
   */
  async _processRetry(retryId) {
    try {
      // Get retry data using helper function
      const retryData = await getCache(`transaction:retry:${retryId}`);
      
      if (!retryData) {
        console.log(`Retry data not found for ID: ${retryId}`);
        return;
      }
      
      const { transaction_id, retry_count, failure_type } = retryData;
      
      // Get transaction
      const transaction = await Transaction.findById(transaction_id);
      
      if (!transaction) {
        console.log(`Transaction not found for retry: ${transaction_id}`);
        return;
      }
      
      // Update retry status in database
      await db('transaction_retries')
        .where({ id: retryId })
        .update({
          status: 'processing',
          processing_started_at: new Date()
        });
      
      // Handle the retry based on transaction type and failure type
      const retryResult = await this._executeRetry(transaction, failure_type, retry_count);
      
      if (retryResult.success) {
        // Retry was successful
        await db('transaction_retries')
          .where({ id: retryId })
          .update({
            status: 'completed',
            completed_at: new Date(),
            result: JSON.stringify(retryResult.data)
          });
          
        // Delete retry data from Redis using helper function
        await deleteCache(`transaction:retry:${retryId}`);
        
      } else {
        // Retry failed, schedule another retry with incremented count
        await this.scheduleRetry(
          transaction_id, 
          retryResult.error || 'Retry failed', 
          retry_count + 1, 
          failure_type
        );
        
        await db('transaction_retries')
          .where({ id: retryId })
          .update({
            status: 'failed',
            completed_at: new Date(),
            result: JSON.stringify({
              error: retryResult.error,
              next_retry_scheduled: true,
              retry_count: retry_count + 1
            })
          });
      }
      
    } catch (error) {
      console.error(`Error processing retry ${retryId}:`, error);
      
      // Update retry status
      try {
        await db('transaction_retries')
          .where({ id: retryId })
          .update({
            status: 'error',
            completed_at: new Date(),
            result: JSON.stringify({ error: error.message })
          });
      } catch (dbError) {
        console.error('Error updating retry status:', dbError);
      }
    }
  }
  
  /**
   * Execute a transaction retry based on type and failure
   * @param {Object} transaction - Transaction object
   * @param {string} failureType - Type of failure
   * @param {number} retryCount - Current retry count
   */
  async _executeRetry(transaction, failureType, retryCount) {
    console.log(`Executing retry for transaction ${transaction.id} (type: ${transaction.transaction_type}, failure: ${failureType})`);
    
    try {
      let result;
      
      // Update transaction status
      await Transaction.updateStatus(transaction.id, 'processing', {
        metadata: JSON.stringify({
          ...JSON.parse(transaction.metadata || '{}'),
          retry_info: {
            retry_attempt: retryCount + 1,
            retry_timestamp: new Date().toISOString()
          }
        })
      });
      
      // Get current transaction metadata to check for failed providers
      const metadata = JSON.parse(transaction.metadata || '{}');
      const failedProviders = metadata.failed_providers || [];
      
      // Determine if we should use a fallback route
      const useFallback = retryCount > 0 || failedProviders.length > 0;
      
      // For bank transfers and some other types, try using the fallback service
      if (['bank_to_bank', 'deposit', 'withdrawal'].includes(transaction.transaction_type)) {
        // Get the optimal route with fallback if needed
        const routeInfo = await fallbackService.getRouteForTransaction(transaction, useFallback);
        
        console.log(`Selected route for retry: ${routeInfo.selected_route.provider} (fallback: ${useFallback})`);
        
        // Process with the selected route
        const routeResult = await fallbackService.processTransactionWithRoute(transaction, routeInfo);
        
        if (!routeResult.success) {
          // Track failed provider for future retries
          if (!failedProviders.includes(routeInfo.selected_route.provider)) {
            failedProviders.push(routeInfo.selected_route.provider);
            
            // Update metadata with failed provider
            await Transaction.updateStatus(transaction.id, 'retry_scheduled', {
              metadata: JSON.stringify({
                ...metadata,
                failed_providers: failedProviders,
                last_failed_provider: routeInfo.selected_route.provider,
                last_failure_reason: routeResult.error
              })
            });
          }
          
          return {
            success: false,
            error: routeResult.error || `Failed with provider ${routeInfo.selected_route.provider}`
          };
        }
        
        result = {
          success: true,
          data: {
            provider: routeInfo.selected_route.provider,
            is_fallback: useFallback,
            ...routeResult
          }
        };
      } else {
        // Handle based on transaction type (for non-bank transfers)
        switch (transaction.transaction_type) {
          case 'app_transfer':
            result = await this._retryAppTransfer(transaction);
            break;
            
          default:
            throw new Error(`Unsupported transaction type for retry: ${transaction.transaction_type}`);
        }
      }
      
      if (result.success) {
        // Update transaction to completed
        await Transaction.updateStatus(transaction.id, 'completed', {
          completed_at: new Date(),
          metadata: JSON.stringify({
            ...metadata,
            retry_info: {
              retry_successful: true,
              retry_completed_at: new Date().toISOString(),
              retry_attempt: retryCount + 1,
              used_fallback: useFallback,
              ...(result.data || {})
            }
          })
        });
        
        // Notify about successful transaction
        notifyTransactionUpdate(transaction.id);
      }
      
      return result;
    } catch (error) {
      console.error(`Error executing retry for transaction ${transaction.id}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Handle app-to-app transfer retry
   */
  async _retryAppTransfer(transaction) {
    // Implementation would depend on transaction service
    // Here's a basic structure:
    try {
      // Get wallet and balance info
      const senderWallet = await db('wallets').where({ user_id: transaction.sender_id }).first();
      const recipientWallet = await db('wallets').where({ user_id: transaction.recipient_id }).first();
      
      if (!senderWallet || !recipientWallet) {
        return { success: false, error: 'Wallet not found' };
      }
      
      // Check if amount was already deducted (to prevent double-charging)
      const balanceKey = `balance_${transaction.currency_from.toLowerCase()}`;
      const transactionEvents = await db('transaction_events')
        .where({ transaction_id: transaction.id, event_type: 'debit_sender' })
        .count('id as count')
        .first();
      
      const senderDebited = transactionEvents && transactionEvents.count > 0;
      
      // If sender wasn't debited yet, debit them
      if (!senderDebited) {
        await db('wallets')
          .where({ id: senderWallet.id })
          .decrement(balanceKey, transaction.amount);
      }
      
      // Credit recipient
      const recipientKey = `balance_${transaction.currency_to.toLowerCase()}`;
      await db('wallets')
        .where({ id: recipientWallet.id })
        .increment(recipientKey, transaction.amount * transaction.exchange_rate - transaction.fee);
      
      // Record events
      if (!senderDebited) {
        await db('transaction_events').insert({
          transaction_id: transaction.id,
          event_type: 'debit_sender',
          event_data: JSON.stringify({
            wallet_id: senderWallet.id,
            amount: transaction.amount,
            currency: transaction.currency_from,
            balance_after: senderWallet[balanceKey] - transaction.amount,
          }),
          created_at: new Date()
        });
      }
      
      await db('transaction_events').insert({
        transaction_id: transaction.id,
        event_type: 'credit_recipient',
        event_data: JSON.stringify({
          wallet_id: recipientWallet.id,
          amount: transaction.amount * transaction.exchange_rate - transaction.fee,
          currency: transaction.currency_to
        }),
        created_at: new Date()
      });
      
      return {
        success: true,
        data: {
          sender_debited: true,
          recipient_credited: true,
        }
      };
      
    } catch (error) {
      console.error('Error retrying app transfer:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Handle bank-to-bank transfer retry
   */
  async _retryBankToBank(transaction) {
    // This would use the bank integration service
    // For now, return mock success
    return {
      success: true,
      data: {
        message: 'Bank-to-bank transfer retried successfully'
      }
    };
  }
  
  /**
   * Handle deposit retry
   */
  async _retryDeposit(transaction) {
    // This would use the banking service
    // For now, return mock success
    return {
      success: true,
      data: {
        message: 'Deposit retried successfully'
      }
    };
  }
  
  /**
   * Handle withdrawal retry
   */
  async _retryWithdrawal(transaction) {
    // This would use the banking service
    // For now, return mock success
    return {
      success: true,
      data: {
        message: 'Withdrawal retried successfully'
      }
    };
  }
  
  /**
   * Mark a transaction as permanently failed
   */
  async _markPermanentlyFailed(transactionId, reason) {
    try {
      const transaction = await Transaction.findById(transactionId);
      
      if (!transaction) {
        return false;
      }
      
      await Transaction.updateStatus(transactionId, 'failed', {
        metadata: JSON.stringify({
          ...JSON.parse(transaction.metadata || '{}'),
          permanent_failure: true,
          failure_reason: reason,
          max_retries_reached: true,
          final_failure_time: new Date().toISOString()
        })
      });
      
      // Record the permanent failure event
      await db('transaction_events').insert({
        transaction_id: transactionId,
        event_type: 'permanent_failure',
        event_data: JSON.stringify({
          reason,
          max_retries_reached: true
        }),
        created_at: new Date()
      });
      
      // Notify about the failure
      notifyTransactionUpdate(transactionId);
      
      return true;
    } catch (error) {
      console.error('Error marking transaction as permanently failed:', error);
      return false;
    }
  }
  
  /**
   * Start the retry processing scheduler
   * @param {number} intervalMs - Processing interval in milliseconds
   */
  startScheduler(intervalMs = 30000) {
    // Process retries every 30 seconds by default
    this.schedulerInterval = setInterval(() => {
      this.processRetryQueue().catch(error => {
        console.error('Error in retry scheduler:', error);
      });
    }, intervalMs);
    
    console.log(`Retry scheduler started with ${intervalMs}ms interval`);
  }
  
  /**
   * Stop the retry processing scheduler
   */
  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log('Retry scheduler stopped');
    }
  }
}

// Create singleton instance
const retryService = new RetryService();

module.exports = retryService;