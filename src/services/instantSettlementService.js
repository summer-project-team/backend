/**
 * Instant Settlement Service
 * Implements immediate liquidity optimizations for small amounts
 */

const { db } = require('../utils/database');
const WebSocketService = require('./websocket');

class InstantSettlementService {
  constructor() {
    // Instant settlement thresholds by currency
    this.INSTANT_THRESHOLDS = {
      'USD': 500,    // $500 and below = instant
      'GBP': 400,    // £400 and below = instant  
      'NGN': 200000, // ₦200k and below = instant
      'CBUSD': 500   // 500 CBUSD and below = instant
    };

    // Pre-funded liquidity pools for instant settlements
    this.LIQUIDITY_POOLS = {
      'USD': 50000,   // $50k pool
      'GBP': 40000,   // £40k pool
      'NGN': 50000000, // ₦50M pool
      'CBUSD': 100000  // 100k CBUSD pool
    };
  }

  /**
   * Determine if transaction qualifies for instant settlement
   */
  qualifiesForInstant(amount, currency, userTier = 'basic') {
    const threshold = this.INSTANT_THRESHOLDS[currency] || 0;
    
    // Tier-based multipliers
    const multipliers = {
      'basic': 1.0,
      'verified': 2.0,
      'premium': 5.0
    };
    
    const adjustedThreshold = threshold * (multipliers[userTier] || 1.0);
    
    return amount <= adjustedThreshold;
  }

  /**
   * Check if user is eligible for instant deposit
   */
  async isEligibleForInstantDeposit(amount, currency, userId) {
    try {
      // Get user info
      const user = await db('users').where({ id: userId }).first();
      if (!user) {
        return { eligible: false, reason: 'User not found' };
      }

      // Check amount threshold
      if (!this.qualifiesForInstant(amount, currency, user.verification_level || 'basic')) {
        return { 
          eligible: false, 
          reason: `Amount exceeds instant threshold for ${currency}`,
          threshold: this.INSTANT_THRESHOLDS[currency] || 0
        };
      }

      // Check liquidity pool availability
      const poolBalance = await this.getPoolBalance(currency);
      if (poolBalance < amount) {
        return { 
          eligible: false, 
          reason: 'Insufficient liquidity pool balance' 
        };
      }

      // Check daily limits (if user has any)
      const eligibility = await db('instant_settlement_eligibility')
        .where({ user_id: userId, currency })
        .first();

      if (eligibility) {
        const dailyUsed = parseFloat(eligibility.daily_used || 0);
        const dailyLimit = parseFloat(eligibility.daily_limit || 0);
        
        if (dailyUsed + amount > dailyLimit) {
          return {
            eligible: false,
            reason: 'Daily instant settlement limit exceeded',
            daily_used: dailyUsed,
            daily_limit: dailyLimit
          };
        }
      }

      return { 
        eligible: true, 
        estimated_completion: 'immediate',
        fee_rate: 0.001 // 0.1% for instant settlements
      };
    } catch (error) {
      console.error('Error checking instant deposit eligibility:', error);
      return { eligible: false, reason: 'System error checking eligibility' };
    }
  }

  /**
   * Check if user is eligible for instant withdrawal
   */
  async isEligibleForInstantWithdrawal(amount, currency, userId) {
    try {
      // Get user info
      const user = await db('users').where({ id: userId }).first();
      if (!user) {
        return { eligible: false, reason: 'User not found' };
      }

      // Check user's wallet balance
      const wallet = await db('wallets').where({ user_id: userId }).first();
      if (!wallet) {
        return { eligible: false, reason: 'Wallet not found' };
      }

      // Check amount threshold
      if (!this.qualifiesForInstant(amount, currency, user.verification_level || 'basic')) {
        return { 
          eligible: false, 
          reason: `Amount exceeds instant threshold for ${currency}`,
          threshold: this.INSTANT_THRESHOLDS[currency] || 0
        };
      }

      // For withdrawals, we convert CBUSD to target currency
      // Get CBUSD balance (this is what we actually withdraw from)
      const cbusdBalance = parseFloat(wallet.cbusd_balance || 0);
      
      // Calculate how much CBUSD we need for this withdrawal
      const cbusdRate = await this.getCBUSDRate(currency);
      const fee = amount * 0.002; // 0.2% fee for instant withdrawal
      const totalAmountNeeded = amount + fee;
      const cbusdRequired = totalAmountNeeded / cbusdRate;

      console.log(`Withdrawal check: ${amount} ${currency} + ${fee} fee = ${totalAmountNeeded} ${currency}`);
      console.log(`CBUSD rate: 1 CBUSD = ${cbusdRate} ${currency}`);
      console.log(`CBUSD required: ${cbusdRequired}, CBUSD available: ${cbusdBalance}`);

      if (cbusdBalance < cbusdRequired) {
        return { 
          eligible: false, 
          reason: `Insufficient CBUSD balance: ${cbusdBalance} < ${cbusdRequired} (need ${totalAmountNeeded} ${currency})`,
          available_cbusd: cbusdBalance,
          required_cbusd: cbusdRequired,
          withdrawal_amount: amount,
          currency: currency
        };
      }

      // Check liquidity pool availability
      const poolBalance = await this.getPoolBalance(currency);
      if (poolBalance < amount) {
        return { 
          eligible: false, 
          reason: 'Insufficient liquidity pool balance' 
        };
      }

      // Check daily limits
      const eligibility = await db('instant_settlement_eligibility')
        .where({ user_id: userId, currency })
        .first();

      if (eligibility) {
        const dailyUsed = parseFloat(eligibility.daily_used || 0);
        const dailyLimit = parseFloat(eligibility.daily_limit || 0);
        
        if (dailyUsed + amount > dailyLimit) {
          return {
            eligible: false,
            reason: 'Daily instant settlement limit exceeded',
            daily_used: dailyUsed,
            daily_limit: dailyLimit
          };
        }
      }

      return { 
        eligible: true, 
        estimated_completion: 'immediate',
        fee_rate: 0.002, // 0.2% for instant withdrawals
        fee_amount: fee,
        cbusd_required: cbusdRequired,
        available_cbusd: cbusdBalance
      };
    } catch (error) {
      console.error('Error checking instant withdrawal eligibility:', error);
      return { eligible: false, reason: 'System error checking eligibility' };
    }
  }

  /**
   * Process instant deposit - credit user immediately
   */
  async processInstantDeposit(userId, amount, currency, metadata = {}) {
    console.log('⚡ Processing instant deposit...');
    const startTime = Date.now();

    // Check instant eligibility first
    const eligibilityCheck = await this.isEligibleForInstantDeposit(amount, currency, userId);
    if (!eligibilityCheck.eligible) {
      throw new Error(`Instant deposit not eligible: ${eligibilityCheck.reason}`);
    }

    try {
      const transaction = await db.transaction(async (trx) => {
        // Create completed transaction immediately
        const [txn] = await trx('transactions').insert({
          sender_id: null,
          recipient_id: userId,
          amount: amount,
          source_currency: currency,
          target_currency: 'CBUSD',
          exchange_rate: await this.getCBUSDRate(currency),
          fee: amount * 0.001, // Lower fee for instant (0.1%)
          status: 'completed', // ✨ Instantly completed
          transaction_type: 'deposit', // Use standard type
          metadata: JSON.stringify({
            ...metadata,
            instant_settlement: true,
            settlement_type: 'pre_funded',
            pool_deducted: amount,
            processing_type: 'instant'
          }),
          created_at: new Date(),
          completed_at: new Date() // ✨ Instant completion
        }).returning('*');

        // Calculate CBUSD amount
        const cbusdAmount = amount * txn.exchange_rate * (1 - 0.001); // Minus fee

        // Credit user wallet immediately
        await trx('wallets')
          .where({ user_id: userId })
          .increment('cbusd_balance', cbusdAmount);

        // Deduct from liquidity pool
        await this.deductFromPool(currency, amount, trx);

        // Log instant settlement
        await trx('liquidity_events').insert({
          event_type: 'instant_settlement',
          currency: currency,
          amount: amount,
          pool_before: eligibilityCheck.poolBalance || await this.getPoolBalance(currency),
          pool_after: (eligibilityCheck.poolBalance || await this.getPoolBalance(currency)) - amount,
          transaction_id: txn.id,
          user_id: userId,
          created_at: new Date()
        });

        return txn;
      });

      const totalTime = Date.now() - startTime;
      console.log(`⚡ Instant deposit completed in ${totalTime}ms`);

      // Send instant notification
      if (WebSocketService && WebSocketService.sendToUser) {
        WebSocketService.sendToUser(userId, 'instant_deposit_completed', {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.target_currency,
          processingTime: totalTime,
          instant: true
        });
      }

      // Schedule pool rebalancing (async)
      this.schedulePoolRebalance(currency).catch(err => {
        console.error('Pool rebalance scheduling failed:', err);
      });

      return {
        ...transaction,
        instant: true,
        processingTime: totalTime
      };
    } catch (error) {
      console.error('Instant deposit failed:', error);
      throw error;
    }
  }

  /**
   * Process instant withdrawal - pay user immediately from pool
   */
  async processInstantWithdrawal(userId, amount, currency, metadata = {}) {
    console.log('⚡ Processing instant withdrawal...');
    const startTime = Date.now();

    // Check instant eligibility first
    const eligibilityCheck = await this.isEligibleForInstantWithdrawal(amount, currency, userId);
    if (!eligibilityCheck.eligible) {
      throw new Error(`Instant withdrawal not eligible: ${eligibilityCheck.reason}`);
    }

    try {
      const transaction = await db.transaction(async (trx) => {
        const cbusdRate = await this.getCBUSDRate(currency);
        const fee = amount * 0.002; // 0.2% fee for instant withdrawal
        const totalAmount = amount + fee;
        const cbusdRequired = totalAmount / cbusdRate;

        // Burn CBUSD immediately
        await trx('wallets')
          .where({ user_id: userId })
          .decrement('cbusd_balance', cbusdRequired);

        // Create completed transaction
        const [txn] = await trx('transactions').insert({
          sender_id: userId,
          recipient_id: null,
          amount: amount,
          source_currency: 'CBUSD',
          target_currency: currency,
          exchange_rate: cbusdRate,
          fee: fee,
          status: 'completed', // ✨ Instantly completed
          transaction_type: 'withdrawal', // Use standard type
          metadata: JSON.stringify({
            ...metadata,
            instant_settlement: true,
            settlement_type: 'pre_funded',
            cbusd_burned: cbusdRequired,
            processing_type: 'instant'
          }),
          created_at: new Date(),
          completed_at: new Date() // ✨ Instant completion
        }).returning('*');

        // Add to pending bank transfers queue (for actual payout)
        await trx('instant_bank_queue').insert({
          transaction_id: txn.id,
          amount: amount,
          currency: currency,
          bank_details: metadata, // Store as object since it's JSONB
          priority: 'high',
          scheduled_at: new Date(),
          created_at: new Date()
        });

        return txn;
      });

      const totalTime = Date.now() - startTime;
      console.log(`⚡ Instant withdrawal completed in ${totalTime}ms`);

      // Send instant notification
      if (WebSocketService && WebSocketService.sendToUser) {
        WebSocketService.sendToUser(userId, 'instant_withdrawal_completed', {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.target_currency,
          processingTime: totalTime,
          instant: true,
          note: 'Funds sent to your bank account within 2 hours'
        });
      }

      // Process actual bank transfer in background
      this.processBankTransferQueue().catch(err => {
        console.error('Bank transfer queue processing failed:', err);
      });

      return {
        ...transaction,
        instant: true,
        processingTime: totalTime
      };
    } catch (error) {
      console.error('Instant withdrawal failed:', error);
      throw error;
    }
  }

  /**
   * Get current liquidity pool balance
   */
  async getPoolBalance(currency) {
    const pool = await db('liquidity_pools')
      .where({ currency: currency })
      .first();
    
    return pool ? parseFloat(pool.current_balance) : 0;
  }

  /**
   * Get all pool balances for monitoring
   */
  async getAllPoolBalances() {
    const pools = await db('liquidity_pools').select('*');
    return pools.reduce((acc, pool) => {
      acc[pool.currency] = {
        available: pool.current_balance,
        total: pool.current_balance
      };
      return acc;
    }, {});
  }

  /**
   * Deduct amount from liquidity pool
   */
  async deductFromPool(currency, amount, trx = db) {
    await trx('liquidity_pools')
      .where({ currency: currency })
      .decrement('current_balance', amount);
  }

  /**
   * Schedule pool rebalancing to maintain liquidity
   */
  async schedulePoolRebalance(currency) {
    console.log(`📊 Scheduling pool rebalance for ${currency}...`);
    
    // Check if pool is below threshold
    const poolBalance = await this.getPoolBalance(currency);
    const threshold = this.LIQUIDITY_POOLS[currency] * 0.3; // 30% threshold
    
    if (poolBalance < threshold) {
      // Schedule immediate rebalance
      await db('pool_rebalance_queue').insert({
        currency: currency,
        current_balance: poolBalance,
        target_balance: this.LIQUIDITY_POOLS[currency],
        priority: poolBalance < threshold * 0.5 ? 'urgent' : 'normal',
        scheduled_at: new Date(),
        created_at: new Date()
      });
      
      console.log(`🚨 Pool rebalance scheduled for ${currency} (balance: ${poolBalance})`);
    }
  }

  /**
   * Process background bank transfers for instant withdrawals
   */
  async processBankTransferQueue() {
    console.log('🏦 Processing bank transfer queue...');
    
    const pendingTransfers = await db('instant_bank_queue')
      .where({ status: 'pending' })
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .limit(10);

    for (const transfer of pendingTransfers) {
      try {
        // Mark as processing
        await db('instant_bank_queue')
          .where({ id: transfer.id })
          .update({ status: 'processing', started_at: new Date() });

        // Process actual bank transfer
        const result = await this.executeBankTransfer(
          transfer.amount,
          transfer.currency,
          transfer.bank_details // Already an object from JSONB
        );

        // Mark as completed
        await db('instant_bank_queue')
          .where({ id: transfer.id })
          .update({ 
            status: 'completed',
            completed_at: new Date(),
            bank_reference: result.reference
          });

        console.log(`✅ Bank transfer completed: ${transfer.transaction_id}`);
      } catch (error) {
        console.error(`❌ Bank transfer failed: ${transfer.id}`, error);
        
        // Mark as failed and schedule retry
        await db('instant_bank_queue')
          .where({ id: transfer.id })
          .update({ 
            status: 'failed',
            failed_at: new Date(),
            error_message: error.message,
            retry_count: db.raw('retry_count + 1')
          });
      }
    }
  }

  /**
   * Execute actual bank transfer
   */
  async executeBankTransfer(amount, currency, bankDetails) {
    // Implementation would call Flutterwave/Stripe APIs
    console.log(`Executing bank transfer: ${amount} ${currency}`);
    
    // Simulate bank transfer
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      reference: `INSTANT_${Date.now()}`,
      status: 'completed'
    };
  }

  /**
   * Get CBUSD exchange rate for withdrawals
   * Returns how much local currency you get per 1 CBUSD
   */
  async getCBUSDRate(currency) {
    // For withdrawals: 1 CBUSD = X local currency
    const rates = {
      'USD': 1.0,    // 1 CBUSD = 1 USD
      'NGN': 1500,   // 1 CBUSD = 1500 NGN  
      'GBP': 0.8     // 1 CBUSD = 0.8 GBP
    };
    return rates[currency] || 1.0;
  }

  /**
   * Get instant settlement stats
   */
  async getInstantStats() {
    const stats = await db('transactions')
      .select(
        db.raw('COUNT(*) as total_instant'),
        db.raw('SUM(amount) as total_volume'),
        db.raw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_time')
      )
      .whereRaw("metadata::text LIKE '%\"instant_settlement\":true%'")
      .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .first();

    return {
      transactions_24h: stats.total_instant || 0,
      volume_24h: stats.total_volume || 0,
      avg_processing_time: stats.avg_time || 0,
      pools: await this.getAllPoolBalances()
    };
  }
}

module.exports = new InstantSettlementService();