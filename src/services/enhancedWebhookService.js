/**
 * Enhanced Webhook Processing Service
 * Implements batching and parallel processing for faster webhook handling
 */

const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);
const WebSocketService = require('./websocket');
const parallelProcessingService = require('./parallelProcessingService');
const instantSettlementService = require('./instantSettlementService');

class EnhancedWebhookService {
  constructor() {
    this.webhookQueue = [];
    this.processing = false;
    this.batchSize = 10;
    this.batchTimeout = 1000; // 1 second
    
    // Start batch processor
    this.startBatchProcessor();
  }

  /**
   * Add webhook to processing queue
   */
  async queueWebhook(webhookData) {
    const webhookEvent = {
      id: require('uuid').v4(),
      type: webhookData.type || webhookData.event,
      data: webhookData,
      timestamp: new Date(),
      priority: this.getWebhookPriority(webhookData)
    };

    // Add to queue
    this.webhookQueue.push(webhookEvent);
    
    // Log webhook received
    await this.logWebhookEvent(webhookEvent);
    
    // Sort by priority
    this.webhookQueue.sort((a, b) => b.priority - a.priority);
    
    console.log(`📥 Webhook queued: ${webhookEvent.type} (queue size: ${this.webhookQueue.length})`);
    
    return webhookEvent.id;
  }

  /**
   * Determine webhook priority
   */
  getWebhookPriority(webhookData) {
    // High priority for completed transactions
    if (webhookData.event === 'charge.completed' || 
        webhookData.type === 'payment_intent.succeeded') {
      return 10;
    }
    
    // Medium priority for processing updates
    if (webhookData.event === 'charge.processing') {
      return 5;
    }
    
    // Low priority for informational events
    return 1;
  }

  /**
   * Start batch processor
   */
  startBatchProcessor() {
    setInterval(async () => {
      if (this.webhookQueue.length > 0 && !this.processing) {
        await this.processBatch();
      }
    }, this.batchTimeout);
  }

  /**
   * Process webhooks in batches
   */
  async processBatch() {
    if (this.processing || this.webhookQueue.length === 0) {
      return;
    }

    this.processing = true;
    console.log('🚀 Processing webhook batch...');
    
    try {
      // Take batch from queue
      const batch = this.webhookQueue.splice(0, this.batchSize);
      const startTime = Date.now();

      // Group by provider for parallel processing
      const grouped = this.groupWebhooksByProvider(batch);
      
      // Process each provider group in parallel
      const results = await Promise.allSettled([
        this.processStripeWebhooks(grouped.stripe || []),
        this.processFlutterwaveWebhooks(grouped.flutterwave || []),
        this.processBankWebhooks(grouped.bank || [])
      ]);

      const totalTime = Date.now() - startTime;
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      
      console.log(`✅ Batch processed: ${batch.length} webhooks in ${totalTime}ms (${successCount}/${results.length} providers succeeded)`);
      
      // Update processing stats
      await this.updateProcessingStats(batch.length, totalTime, successCount);
      
    } catch (error) {
      console.error('Batch processing failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Group webhooks by provider
   */
  groupWebhooksByProvider(webhooks) {
    return webhooks.reduce((groups, webhook) => {
      let provider = 'unknown';
      
      // Detect provider from webhook data
      if (webhook.data.object === 'payment_intent' || webhook.data.id?.startsWith('pi_')) {
        provider = 'stripe';
      } else if (webhook.data.data?.tx_ref || webhook.data.event?.includes('charge')) {
        provider = 'flutterwave';
      } else if (webhook.data.bank_reference) {
        provider = 'bank';
      }
      
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(webhook);
      
      return groups;
    }, {});
  }

  /**
   * Process Stripe webhooks in parallel
   */
  async processStripeWebhooks(webhooks) {
    if (webhooks.length === 0) return { processed: 0 };
    
    console.log(`💳 Processing ${webhooks.length} Stripe webhooks...`);
    
    const results = await Promise.allSettled(
      webhooks.map(webhook => this.processStripeWebhook(webhook))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Stripe: ${successful}/${webhooks.length} processed`);
    
    return { processed: successful, total: webhooks.length };
  }

  /**
   * Process single Stripe webhook
   */
  async processStripeWebhook(webhook) {
    const { data } = webhook.data;
    
    if (webhook.data.type === 'payment_intent.succeeded') {
      const { id, amount, currency, metadata } = data;
      
      // Extract user info from metadata
      const userId = metadata.user_reference;
      const amountDecimal = amount / 100; // Convert from cents
      
      // Check if this qualifies for instant settlement
      if (instantSettlementService.qualifiesForInstant(amountDecimal, currency.toUpperCase())) {
        return await instantSettlementService.processInstantDeposit({
          userId,
          amount: amountDecimal,
          currency: currency.toUpperCase(),
          referenceCode: id,
          provider: 'stripe'
        });
      } else {
        // Use parallel processing for larger amounts
        return await parallelProcessingService.processDepositWithPreMinting({
          userId,
          amount: amountDecimal,
          currency: currency.toUpperCase(),
          referenceCode: id,
          provider: 'stripe'
        });
      }
    }
    
    return { status: 'ignored', reason: 'Non-completion event' };
  }

  /**
   * Process Flutterwave webhooks in parallel
   */
  async processFlutterwaveWebhooks(webhooks) {
    if (webhooks.length === 0) return { processed: 0 };
    
    console.log(`🌍 Processing ${webhooks.length} Flutterwave webhooks...`);
    
    const results = await Promise.allSettled(
      webhooks.map(webhook => this.processFlutterwaveWebhook(webhook))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Flutterwave: ${successful}/${webhooks.length} processed`);
    
    return { processed: successful, total: webhooks.length };
  }

  /**
   * Process single Flutterwave webhook
   */
  async processFlutterwaveWebhook(webhook) {
    const { data } = webhook.data;
    
    if (webhook.data.event === 'charge.completed' && data.status === 'successful') {
      const { tx_ref, amount, currency, customer } = data;
      
      // Extract user ID from reference
      const userId = await this.getUserIdFromReference(tx_ref);
      
      // Check if this qualifies for instant settlement
      if (instantSettlementService.qualifiesForInstant(amount, currency)) {
        return await instantSettlementService.processInstantDeposit({
          userId,
          amount: parseFloat(amount),
          currency: currency.toUpperCase(),
          referenceCode: tx_ref,
          provider: 'flutterwave'
        });
      } else {
        // Use parallel processing for larger amounts
        return await parallelProcessingService.processDepositWithPreMinting({
          userId,
          amount: parseFloat(amount),
          currency: currency.toUpperCase(),
          referenceCode: tx_ref,
          provider: 'flutterwave'
        });
      }
    }
    
    return { status: 'ignored', reason: 'Non-completion event' };
  }

  /**
   * Process bank webhooks in parallel
   */
  async processBankWebhooks(webhooks) {
    if (webhooks.length === 0) return { processed: 0 };
    
    console.log(`🏦 Processing ${webhooks.length} bank webhooks...`);
    
    const results = await Promise.allSettled(
      webhooks.map(webhook => this.processBankWebhook(webhook))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Bank: ${successful}/${webhooks.length} processed`);
    
    return { processed: successful, total: webhooks.length };
  }

  /**
   * Process single bank webhook
   */
  async processBankWebhook(webhook) {
    const { reference_code, amount, currency } = webhook.data;
    
    // Find user from reference
    const depositRef = await knex('bank_deposit_references')
      .where({ reference_code, status: 'pending' })
      .first();
    
    if (!depositRef) {
      throw new Error('Invalid reference code');
    }
    
    // Process deposit based on amount
    if (instantSettlementService.qualifiesForInstant(amount, currency)) {
      return await instantSettlementService.processInstantDeposit({
        userId: depositRef.user_id,
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        referenceCode: reference_code,
        provider: 'bank'
      });
    } else {
      return await parallelProcessingService.processDepositWithPreMinting({
        userId: depositRef.user_id,
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        referenceCode: reference_code,
        provider: 'bank'
      });
    }
  }

  /**
   * Log webhook event
   */
  async logWebhookEvent(webhookEvent) {
    await knex('webhook_events').insert({
      id: webhookEvent.id,
      event_type: webhookEvent.type,
      priority: webhookEvent.priority,
      raw_data: JSON.stringify(webhookEvent.data),
      processed: false,
      created_at: webhookEvent.timestamp
    });
  }

  /**
   * Update processing statistics
   */
  async updateProcessingStats(batchSize, processingTime, successCount) {
    await knex('webhook_processing_stats').insert({
      batch_size: batchSize,
      processing_time_ms: processingTime,
      successful_count: successCount,
      avg_time_per_webhook: processingTime / batchSize,
      created_at: new Date()
    });
  }

  /**
   * Get user ID from transaction reference
   */
  async getUserIdFromReference(reference) {
    // Try to find in transactions first
    const transaction = await knex('transactions')
      .where('external_reference', reference)
      .orWhere('reference_id', reference)
      .first();
    
    if (transaction) {
      return transaction.recipient_id || transaction.sender_id;
    }
    
    // Try bank deposit references
    const depositRef = await knex('bank_deposit_references')
      .where('reference_code', reference)
      .first();
    
    if (depositRef) {
      return depositRef.user_id;
    }
    
    throw new Error('User not found for reference');
  }

  /**
   * Get real-time webhook processing stats
   */
  async getProcessingStats() {
    const recentStats = await knex('webhook_processing_stats')
      .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .select(
        knex.raw('COUNT(*) as batches_processed'),
        knex.raw('SUM(batch_size) as total_webhooks'),
        knex.raw('AVG(processing_time_ms) as avg_batch_time'),
        knex.raw('AVG(avg_time_per_webhook) as avg_webhook_time'),
        knex.raw('SUM(successful_count)::float / SUM(batch_size) as success_rate')
      )
      .first();

    return {
      queue_size: this.webhookQueue.length,
      processing: this.processing,
      stats_24h: {
        batches_processed: parseInt(recentStats.batches_processed) || 0,
        total_webhooks: parseInt(recentStats.total_webhooks) || 0,
        avg_batch_time_ms: parseFloat(recentStats.avg_batch_time) || 0,
        avg_webhook_time_ms: parseFloat(recentStats.avg_webhook_time) || 0,
        success_rate: parseFloat(recentStats.success_rate) || 0
      }
    };
  }

  /**
   * Force process queue (for testing/emergency)
   */
  async forceProcessQueue() {
    if (this.processing) {
      throw new Error('Already processing');
    }
    
    await this.processBatch();
    return this.getProcessingStats();
  }
}

module.exports = new EnhancedWebhookService();
