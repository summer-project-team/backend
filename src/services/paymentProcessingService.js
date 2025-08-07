/**
 * Unified Payment Processing Service
 * Consolidates banking operations, integrations, and payment processing
 * Replaces: bankingService.js + bankIntegrationService.js
 */
const { db } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const transactionService = require('./transaction');
const pricingService = require('./pricingService');
const flutterwaveService = require('./flutterwaveService');
const stripeService = require('./stripeService');
const crypto = require('crypto');

class PaymentProcessingService {
  /**
   * Link a bank account to a user
   * @param {string} userId - User ID
   * @param {Object} accountData - Bank account data
   * @returns {Object} Linked bank account
   */
  async linkBankAccount(userId, accountData) {
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
          id: uuidv4(),
          user_id: userId,
          account_number: accountData.account_number,
          bank_code: accountData.bank_code,
          bank_name: accountData.bank_name,
          account_name: accountData.account_name,
          account_type: accountData.account_type || 'savings',
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
  }

  /**
   * Get user's linked bank accounts
   * @param {string} userId - User ID
   * @returns {Array} Bank accounts
   */
  async getUserBankAccounts(userId) {
    try {
      return await db('bank_accounts')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc');
    } catch (error) {
      console.error('Error getting user bank accounts:', error);
      throw error;
    }
  }

  /**
   * Remove a bank account
   * @param {string} userId - User ID
   * @param {string} accountId - Bank account ID
   * @returns {boolean} Success status
   */
  async removeBankAccount(userId, accountId) {
    try {
      const deleted = await db('bank_accounts')
        .where({
          id: accountId,
          user_id: userId
        })
        .del();
      
      return deleted > 0;
    } catch (error) {
      console.error('Error removing bank account:', error);
      throw error;
    }
  }

  /**
   * Process deposit through appropriate payment provider
   * @param {Object} depositData - Deposit details
   * @returns {Object} Processing result
   */
  async processDeposit(depositData) {
    try {
      const { amount, currency, user_id, payment_method } = depositData;
      
      // Route to appropriate payment provider
      switch (currency.toUpperCase()) {
        case 'NGN':
          return await this.processFlutterwaveDeposit(depositData);
        case 'USD':
        case 'GBP':
        case 'EUR':
          return await this.processStripeDeposit(depositData);
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      console.error('Error processing deposit:', error);
      throw error;
    }
  }

  /**
   * Process deposit through Flutterwave (NGN)
   * @param {Object} depositData - Deposit details
   * @returns {Object} Processing result
   */
  async processFlutterwaveDeposit(depositData) {
    const { amount, user_id, bank_account_id } = depositData;
    
    // Generate deposit reference
    const referenceCode = `FLW-DEP-${Date.now().toString().slice(-8)}`;
    
    // Create deposit record
    const [depositRecord] = await db('bank_deposit_references').insert({
      id: uuidv4(),
      user_id,
      reference_code: referenceCode,
      amount: parseFloat(amount),
      currency: 'NGN',
      bank_account_id: bank_account_id || `FLW_${user_id.substr(-8)}`,
      status: 'pending',
      provider: 'flutterwave',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');

    return {
      success: true,
      deposit_reference: depositRecord,
      instructions: {
        bank_name: 'GTBank (Flutterwave)',
        account_number: '0123456789',
        account_name: 'CrossBridge Collections',
        amount: amount,
        reference: referenceCode,
        currency: 'NGN'
      }
    };
  }

  /**
   * Process deposit through Stripe (USD/GBP/EUR)
   * @param {Object} depositData - Deposit details
   * @returns {Object} Processing result
   */
  async processStripeDeposit(depositData) {
    const { amount, currency, user_id, metadata = {} } = depositData;
    
    // Create Stripe payment intent
    const paymentIntent = await stripeService.createPaymentIntent(
      amount,
      currency,
      {
        user_reference: user_id,
        deposit_type: 'bank_deposit',
        ...metadata
      }
    );

    return {
      success: true,
      payment_intent: paymentIntent.payment_intent,
      next_action: paymentIntent.next_action,
      provider: 'stripe'
    };
  }

  /**
   * Process withdrawal through appropriate payment provider
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Object} Processing result
   */
  async processWithdrawal(withdrawalData) {
    try {
      const { amount, currency, user_id, bank_account_details } = withdrawalData;
      
      // Route to appropriate payment provider
      switch (currency.toUpperCase()) {
        case 'NGN':
          return await this.processFlutterwaveWithdrawal(withdrawalData);
        case 'USD':
        case 'GBP':
        case 'EUR':
          return await this.processStripeWithdrawal(withdrawalData);
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      throw error;
    }
  }

  /**
   * Process withdrawal through Flutterwave (NGN)
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Object} Processing result
   */
  async processFlutterwaveWithdrawal(withdrawalData) {
    // Implementation would use Flutterwave transfer API
    // For now, return mock successful withdrawal
    const transferId = `FLW_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    return {
      success: true,
      transfer_id: transferId,
      status: 'processing',
      estimated_completion: '1-2 hours',
      provider: 'flutterwave'
    };
  }

  /**
   * Process withdrawal through Stripe (USD/GBP/EUR)
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Object} Processing result
   */
  async processStripeWithdrawal(withdrawalData) {
    return await stripeService.processWithdrawal(withdrawalData);
  }

  /**
   * Register a new bank integration partner
   * @param {Object} bankData - Bank data
   * @returns {Promise<Object>} - Registered bank
   */
  async registerBankPartner(bankData) {
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
      console.error('Error registering bank partner:', error);
      throw error;
    }
  }

  /**
   * Verify bank integration credentials
   * @param {string} apiKey - API key
   * @param {string} apiSecret - API secret
   * @returns {Promise<Object>} - Bank info if verified
   */
  async verifyBankCredentials(apiKey, apiSecret) {
    try {
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      const bank = await db('bank_integrations')
        .where({ api_key: hashedKey, is_active: true })
        .first();
      
      if (!bank) {
        return { verified: false, error: 'Invalid API credentials' };
      }
      
      // Verify API secret
      const expectedSecret = crypto.createHash('sha256').update(apiSecret).digest('hex');
      if (bank.api_secret !== expectedSecret) {
        return { verified: false, error: 'Invalid API secret' };
      }
      
      return {
        verified: true,
        bank: {
          id: bank.id,
          name: bank.bank_name,
          code: bank.bank_code,
          country: bank.country_code,
          supports_b2b: bank.supports_b2b
        }
      };
    } catch (error) {
      console.error('Error verifying bank credentials:', error);
      return { verified: false, error: 'Verification failed' };
    }
  }

  /**
   * Process bank-to-bank transfer
   * @param {Object} transferData - Transfer data
   * @returns {Promise<Object>} - Transfer result
   */
  async processBankToBank(transferData) {
    try {
      // Validate bank credentials
      const senderBank = await this.verifyBankCredentials(
        transferData.sender_api_key,
        transferData.sender_api_secret
      );
      
      if (!senderBank.verified) {
        throw new Error('Invalid sender bank credentials');
      }
      
      // Use transaction service for B2B processing
      const result = await transactionService.processBankToBank({
        ...transferData,
        sender_bank_id: senderBank.bank.id,
        verified_sender: true
      });
      
      return result;
    } catch (error) {
      console.error('Error processing bank-to-bank transfer:', error);
      throw error;
    }
  }

  /**
   * Get supported currencies by provider
   * @returns {Object} - Supported currencies by provider
   */
  getSupportedCurrencies() {
    return {
      flutterwave: ['NGN'],
      stripe: stripeService.getSupportedCurrencies(),
      all: ['NGN', 'USD', 'GBP', 'EUR']
    };
  }

  /**
   * Get optimal payment provider for currency
   * @param {string} currency - Currency code
   * @returns {string} - Provider name
   */
  getOptimalProvider(currency) {
    const currencyUpper = currency.toUpperCase();
    
    switch (currencyUpper) {
      case 'NGN':
        return 'flutterwave';
      case 'USD':
      case 'GBP':
      case 'EUR':
        return 'stripe';
      default:
        throw new Error(`Unsupported currency: ${currency}`);
    }
  }

  /**
   * Process webhook from payment providers
   * @param {string} provider - Provider name
   * @param {Object} webhookData - Webhook payload
   * @param {string} signature - Webhook signature
   * @returns {Object} - Processing result
   */
  async processWebhook(provider, webhookData, signature) {
    try {
      switch (provider.toLowerCase()) {
        case 'flutterwave':
          // Verify signature
          if (!flutterwaveService.verifyWebhookSignature(signature, JSON.stringify(webhookData))) {
            return { success: false, error: 'Invalid signature' };
          }
          return await flutterwaveService.processDepositWebhook(webhookData);
          
        case 'stripe':
          // Verify signature
          if (!stripeService.verifyWebhookSignature(signature, JSON.stringify(webhookData))) {
            return { success: false, error: 'Invalid signature' };
          }
          return await stripeService.processPaymentWebhook(webhookData);
          
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error) {
      console.error(`Error processing ${provider} webhook:`, error);
      throw error;
    }
  }

  /**
   * Get payment statistics
   * @param {Object} filters - Filter options
   * @returns {Object} - Payment statistics
   */
  async getPaymentStats(filters = {}) {
    try {
      const { start_date, end_date, currency, provider } = filters;
      
      let query = db('transactions')
        .select(
          db.raw('COUNT(*) as total_transactions'),
          db.raw('SUM(amount) as total_volume'),
          db.raw('AVG(amount) as average_amount'),
          'source_currency'
        )
        .where('transaction_type', 'IN', ['deposit', 'withdrawal'])
        .groupBy('source_currency');
      
      if (start_date) {
        query = query.where('created_at', '>=', start_date);
      }
      
      if (end_date) {
        query = query.where('created_at', '<=', end_date);
      }
      
      if (currency) {
        query = query.where('source_currency', currency.toUpperCase());
      }
      
      const stats = await query;
      
      return {
        success: true,
        statistics: stats,
        summary: {
          total_transactions: stats.reduce((sum, s) => sum + parseInt(s.total_transactions), 0),
          total_volume: stats.reduce((sum, s) => sum + parseFloat(s.total_volume), 0),
          currencies_processed: stats.length
        }
      };
    } catch (error) {
      console.error('Error getting payment stats:', error);
      throw error;
    }
  }

  /**
   * Select optimal payment provider based on currency and amount
   * @param {string} currency - Transaction currency
   * @param {number} amount - Transaction amount
   * @param {string} type - Transaction type ('deposit' or 'withdrawal')
   * @returns {string} - Optimal provider name
   */
  selectOptimalProvider(currency, amount, type = 'deposit') {
    try {
      const normalizedCurrency = currency.toUpperCase();
      
      // Provider selection logic based on currency and regional optimization
      const providerMatrix = {
        'NGN': 'flutterwave',    // Flutterwave for Nigerian Naira
        'GHS': 'flutterwave',    // Flutterwave for Ghanaian Cedi
        'KES': 'flutterwave',    // Flutterwave for Kenyan Shilling
        'ZAR': 'flutterwave',    // Flutterwave for South African Rand
        'USD': 'stripe',         // Stripe for US Dollar
        'GBP': 'stripe',         // Stripe for British Pound
        'EUR': 'stripe',         // Stripe for Euro
        'CAD': 'stripe',         // Stripe for Canadian Dollar
        'CBUSD': 'internal'      // Internal for CBUSD transfers
      };

      const selectedProvider = providerMatrix[normalizedCurrency] || 'stripe';
      
      // Log provider selection for analytics
      console.log(`🎯 Provider Selection: ${normalizedCurrency} ${amount} (${type}) → ${selectedProvider}`);
      
      return selectedProvider;
    } catch (error) {
      console.error('Error selecting optimal provider:', error);
      return 'stripe'; // Default fallback
    }
  }

  /**
   * Calculate fees for payment processing
   * @param {string} provider - Payment provider
   * @param {number} amount - Transaction amount
   * @param {string} currency - Transaction currency
   * @param {string} type - Transaction type ('deposit' or 'withdrawal')
   * @returns {Object} - Fee calculation result
   */
  calculateFees(provider, amount, currency, type = 'deposit') {
    try {
      const normalizedProvider = provider.toLowerCase();
      const normalizedCurrency = currency.toUpperCase();
      
      // Provider-specific fee structures
      const feeStructure = {
        stripe: {
          deposit: {
            percentage: 2.9,
            fixed: normalizedCurrency === 'USD' ? 0.30 : (normalizedCurrency === 'GBP' ? 0.20 : 0.25)
          },
          withdrawal: {
            percentage: 0.5,
            fixed: normalizedCurrency === 'USD' ? 0.25 : (normalizedCurrency === 'GBP' ? 0.15 : 0.20)
          }
        },
        flutterwave: {
          deposit: {
            percentage: 1.4,
            fixed: normalizedCurrency === 'NGN' ? 50 : 0
          },
          withdrawal: {
            percentage: 1.0,
            fixed: normalizedCurrency === 'NGN' ? 100 : 0
          }
        },
        internal: {
          deposit: { percentage: 0, fixed: 0 },
          withdrawal: { percentage: 0.1, fixed: 0 }
        }
      };

      const fees = feeStructure[normalizedProvider]?.[type] || { percentage: 1.0, fixed: 0 };
      
      const percentageFee = (amount * fees.percentage) / 100;
      const totalFee = percentageFee + fees.fixed;
      
      return {
        success: true,
        provider: normalizedProvider,
        base_amount: amount,
        percentage_fee: percentageFee,
        fixed_fee: fees.fixed,
        total_fee: totalFee,
        net_amount: type === 'deposit' ? amount - totalFee : amount,
        currency: normalizedCurrency
      };
    } catch (error) {
      console.error('Error calculating fees:', error);
      return {
        success: false,
        error: error.message,
        total_fee: 0,
        net_amount: amount
      };
    }
  }
}

module.exports = new PaymentProcessingService();
