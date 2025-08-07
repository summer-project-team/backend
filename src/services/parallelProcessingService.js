/**
 * Parallel Processing Service
 * Implements immediate speed optimizations from Series A roadmap
 */

const { db } = require('../utils/database');
const cbusdService = require('./cbusdService');
const WebSocketService = require('./websocket');

class ParallelProcessingService {
  /**
   * Parallel Deposit Processing - Start CBUSD operations immediately
   * Current: Webhook → Validation → CBUSD Mint (5+ seconds)
   * Optimized: Webhook → [Validation || CBUSD Mint] (2-3 seconds)
   */
  async processDepositWithPreMinting(depositData) {
    const { userId, amount, currency, metadata = {} } = depositData;
    
    console.log('🚀 Starting parallel deposit processing...');
    const startTime = Date.now();

    try {
      // Start both operations in parallel
      const [validationResult, preMintResult] = await Promise.allSettled([
        // Validation process (can be slow)
        this.validateDepositSecurity(userId, amount, currency),
        
        // Pre-mint CBUSD (fast operation)
        this.preMintCBUSD(userId, amount, currency, metadata)
      ]);

      // Check if validation failed
      if (validationResult.status === 'rejected') {
        // Rollback pre-mint if validation failed
        if (preMintResult.status === 'fulfilled' && preMintResult.value?.transactionId) {
          await this.rollbackPreMint(preMintResult.value.transactionId);
        }
        throw new Error(`Validation failed: ${validationResult.reason}`);
      }

      // Check if pre-mint failed
      if (preMintResult.status === 'rejected') {
        throw new Error(`Pre-mint failed: ${preMintResult.reason}`);
      }

      // If validation passed, confirm the pre-mint
      const finalTransaction = await this.confirmPreMint(
        preMintResult.value.transactionId,
        validationResult.value
      );

      const totalTime = Date.now() - startTime;
      console.log(`✅ Parallel deposit completed in ${totalTime}ms`);

      return finalTransaction;
    } catch (error) {
      console.error('Parallel deposit failed:', error);
      throw error;
    }
  }

  /**
   * Pre-mint CBUSD while other validations happen
   */
  async preMintCBUSD(userId, amount, currency, metadata = {}) {
    console.log('💰 Pre-minting CBUSD...');
    
    // Calculate CBUSD amount
    const cbusdRate = await this.getCBUSDRate(currency);
    const fee = amount * 0.001; // 0.1% fee for deposits
    const netAmount = amount - fee;
    const cbusdAmount = netAmount * cbusdRate;

    // Create pending transaction
    const [transaction] = await db('transactions').insert({
      sender_id: null,
      recipient_id: userId,
      amount: amount,
      source_currency: currency,
      target_currency: 'CBUSD',
      exchange_rate: cbusdRate,
      fee: fee,
      status: 'processing', // Processing status for parallel processing
      transaction_type: 'deposit',
      metadata: JSON.stringify({
        ...metadata,
        processing_type: 'parallel',
        pre_mint: true,
        cbusd_amount: cbusdAmount,
        stage: 'pre_mint'
      }),
      created_at: new Date()
    }).returning('*');

    return {
      transactionId: transaction.id,
      cbusdAmount,
      transaction,
      preProcessed: true
    };
  }

  /**
   * Validate deposit security (slower operation)
   */
  async validateDepositSecurity(userId, amount, currency) {
    console.log('🔒 Validating deposit security...');
    
    // Simulate security checks (in real implementation, these would be actual checks)
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    
    // Get user verification level
    const user = await db('users').where({ id: userId }).first();
    
    // Check transaction limits
    const dailyLimit = this.getDailyLimit(user.verification_level);
    const todaysDeposits = await this.getTodaysDeposits(userId);
    
    if (todaysDeposits + amount > dailyLimit) {
      throw new Error('Daily deposit limit exceeded');
    }

    // Check for suspicious patterns
    const riskScore = await this.calculateRiskScore(userId, amount, currency);
    
    return {
      approved: true,
      riskScore,
      verificationLevel: user.verification_level,
      dailyLimit,
      todaysDeposits
    };
  }

  /**
   * Confirm pre-mint after validation passes
   */
  async confirmPreMint(transactionId, validationData) {
    console.log('✅ Confirming pre-mint...');
    
    return await db.transaction(async (trx) => {
      // Update transaction status
      const [transaction] = await trx('transactions')
        .where({ id: transactionId })
        .update({ 
          status: 'completed',
          completed_at: new Date(),
          metadata: trx.raw('metadata || ?', [JSON.stringify(validationData)])
        })
        .returning('*');

      // Actually mint CBUSD to wallet
      const metadata = transaction.metadata; // Already an object from JSONB
      await trx('wallets')
        .where({ user_id: transaction.recipient_id })
        .increment('cbusd_balance', metadata.cbusd_amount);

      return transaction;
    });
  }

  /**
   * Rollback pre-mint if validation fails
   */
  async rollbackPreMint(transactionId) {
    if (!transactionId) return;
    
    console.log('⚠️ Rolling back pre-mint...');
    
    await db('transactions')
      .where({ id: transactionId })
      .update({
        status: 'failed',
        failed_at: new Date(),
        metadata: db.raw('metadata || ?', [JSON.stringify({ rollback: true })])
      });
  }

  /**
   * Parallel Withdrawal Processing - Start bank transfer while burning CBUSD
   */
  async processWithdrawalWithPreBurn(withdrawalData) {
    const { userId, amount, currency, bankDetails } = withdrawalData;
    
    console.log('🚀 Starting parallel withdrawal processing...');
    const startTime = Date.now();

    try {
      // Start both operations in parallel
      const [burnResult, bankInitResult] = await Promise.allSettled([
        // Burn CBUSD immediately (fast)
        this.preBurnCBUSD(userId, amount, currency),
        
        // Initiate bank transfer (can be slow)
        this.initiateBankTransfer(bankDetails, amount, currency)
      ]);

      // Check if CBUSD burn failed
      if (burnResult.status === 'rejected') {
        throw new Error(`CBUSD burn failed: ${burnResult.reason}`);
      }

      // Check if bank initiation failed
      if (bankInitResult.status === 'rejected') {
        // Restore CBUSD if bank transfer failed
        await this.restoreCBUSD(burnResult.value?.transactionId, burnResult.value?.cbusdAmount);
        throw new Error(`Bank transfer failed: ${bankInitResult.reason}`);
      }

      // Both operations succeeded, link them
      const finalTransaction = await this.linkBurnToBankTransfer(
        burnResult.value.transactionId,
        bankInitResult.value.bankReference
      );

      const totalTime = Date.now() - startTime;
      console.log(`✅ Parallel withdrawal completed in ${totalTime}ms`);

      return finalTransaction;
    } catch (error) {
      console.error('Parallel withdrawal failed:', error);
      throw error;
    }
  }

  // Helper methods
  async getCBUSDRate(currency) {
    const rates = {
      'USD': 1.0,
      'NGN': 1/1500,
      'GBP': 1.25
    };
    return rates[currency] || 1.0;
  }

  getDailyLimit(verificationLevel) {
    const limits = {
      'basic': 10000,     // Increased for testing
      'verified': 50000,
      'premium': 500000
    };
    return limits[verificationLevel] || 10000;
  }

  async getTodaysDeposits(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await db('transactions')
      .where({
        recipient_id: userId,
        transaction_type: 'deposit',
        status: 'completed'
      })
      .where('created_at', '>=', today)
      .sum('amount as total')
      .first();
    
    return parseFloat(result.total) || 0;
  }

  async calculateRiskScore(userId, amount, currency) {
    // Simplified risk scoring
    let score = 0;
    
    // Amount risk
    if (amount > 10000) score += 30;
    else if (amount > 5000) score += 15;
    
    // Frequency risk
    const recentTransactions = await db('transactions')
      .where({ recipient_id: userId })
      .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .count('* as count')
      .first();
    
    if (recentTransactions.count > 5) score += 25;
    
    return score;
  }

  async preBurnCBUSD(userId, amount, currency) {
    console.log('🔥 Pre-burning CBUSD...');
    
    // Get user's wallet
    const wallet = await db('wallets').where({ user_id: userId }).first();
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Calculate CBUSD amount needed (including fee)
    const cbusdRate = await this.getCBUSDRate(currency);
    const fee = amount * 0.002; // 0.2% fee
    const totalAmount = amount + fee;
    const cbusdRequired = totalAmount / cbusdRate;

    // Check if user has enough CBUSD
    const cbusdBalance = parseFloat(wallet.cbusd_balance || 0);
    if (cbusdBalance < cbusdRequired) {
      throw new Error(`Insufficient CBUSD balance: ${cbusdBalance} < ${cbusdRequired}`);
    }

    // Create burn transaction
    const [transaction] = await db('transactions').insert({
      sender_id: userId,
      recipient_id: null,
      amount: amount,
      source_currency: 'CBUSD',
      target_currency: currency,
      exchange_rate: cbusdRate,
      fee: fee,
      status: 'processing',
      transaction_type: 'withdrawal',
      metadata: JSON.stringify({
        processing_type: 'parallel',
        cbusd_burned: cbusdRequired,
        stage: 'cbusd_burned'
      }),
      created_at: new Date()
    }).returning('*');

    // Burn CBUSD from wallet
    await db('wallets')
      .where({ user_id: userId })
      .decrement('cbusd_balance', cbusdRequired);

    return {
      transactionId: transaction.id,
      cbusdAmount: cbusdRequired,
      transaction: transaction
    };
  }

  async initiateBankTransfer(bankDetails, amount, currency) {
    console.log('🏦 Initiating bank transfer...');
    
    // Simulate bank transfer initiation (would call real bank APIs)
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
    
    const bankReference = `BANK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      bankReference: bankReference,
      status: 'initiated',
      estimatedCompletion: new Date(Date.now() + 60000) // 1 minute from now
    };
  }

  async getCBUSDRate(currency) {
    // Get exchange rate (same as instant settlement service)
    const rates = {
      'USD': 1.0,
      'NGN': 1500,
      'GBP': 0.8
    };
    return rates[currency] || 1.0;
  }

  async restoreCBUSD(transactionId, cbusdAmount) {
    if (!transactionId || !cbusdAmount) {
      console.log('⚠️ Cannot restore CBUSD: missing transaction ID or amount');
      return;
    }

    console.log(`🔄 Restoring ${cbusdAmount} CBUSD for transaction ${transactionId}`);
    
    // Get the transaction to find the user
    const transaction = await db('transactions').where({ id: transactionId }).first();
    if (!transaction) {
      throw new Error('Transaction not found for CBUSD restoration');
    }

    // Restore CBUSD to user's wallet
    await db('wallets')
      .where({ user_id: transaction.sender_id })
      .increment('cbusd_balance', cbusdAmount);

    // Update transaction status to failed
    await db('transactions')
      .where({ id: transactionId })
      .update({
        status: 'failed',
        metadata: db.raw('metadata || ?', [JSON.stringify({ 
          rollback: true, 
          cbusd_restored: cbusdAmount,
          failed_at: new Date()
        })])
      });
  }

  async linkBurnToBankTransfer(transactionId, bankReference) {
    console.log(`🔗 Linking transaction ${transactionId} to bank reference ${bankReference}`);
    
    // Update transaction with bank reference and complete it
    const [updatedTransaction] = await db('transactions')
      .where({ id: transactionId })
      .update({
        status: 'completed',
        completed_at: new Date(),
        metadata: db.raw('metadata || ?', [JSON.stringify({
          bank_reference: bankReference,
          completed_via: 'parallel_processing'
        })])
      })
      .returning('*');

    return updatedTransaction;
  }
}

module.exports = new ParallelProcessingService();
