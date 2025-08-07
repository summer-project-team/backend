/**
 * Stripe Integration Service
 * Handles USD and GBP payment processing through Stripe
 * Mirrors flutterwaveService.js patterns for consistency
 */
const crypto = require('crypto');
const { db } = require('../utils/database');

class StripeService {
  /**
   * Verify Stripe webhook signature
   * @param {string} signature - Webhook signature from header (stripe-signature)
   * @param {string} payload - Raw JSON payload as string
   * @returns {boolean} - Whether signature is valid
   */
  verifyWebhookSignature(signature, payload) {
    try {
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!endpointSecret) {
        console.warn('Stripe webhook secret not configured');
        return process.env.NODE_ENV === 'development'; // Allow in dev mode
      }
      
      // Extract timestamp and signature from header
      const sigHeader = signature.split(',').reduce((acc, pair) => {
        const [key, value] = pair.split('=');
        acc[key] = value;
        return acc;
      }, {});
      
      const { t: timestamp, v1: expectedSignature } = sigHeader;
      
      // Create expected signature
      const signedPayload = timestamp + '.' + payload;
      const computedSignature = crypto
        .createHmac('sha256', endpointSecret)
        .update(signedPayload)
        .digest('hex');
      
      return computedSignature === expectedSignature;
    } catch (error) {
      console.error('Error verifying Stripe webhook:', error);
      return false;
    }
  }

  /**
   * Process Stripe payment webhook
   * Validates the webhook and triggers existing bank deposit processing
   * @param {Object} webhookData - Stripe webhook payload
   * @returns {Object} - Processing result
   */
  async processPaymentWebhook(webhookData) {
    try {
      const { type, data } = webhookData;
      
      // Handle different Stripe events
      switch (type) {
        case 'payment_intent.succeeded':
          return await this.handleSuccessfulPayment(data.object);
        case 'payment_intent.payment_failed':
          return await this.handleFailedPayment(data.object);
        case 'transfer.created':
          return await this.handleWithdrawalTransfer(data.object);
        default:
          return { success: false, message: `Ignoring event type: ${type}` };
      }
    } catch (error) {
      console.error('Error processing Stripe webhook:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle successful payment intent
   * @param {Object} paymentIntent - Stripe payment intent object
   * @returns {Object} - Processing result
   */
  async handleSuccessfulPayment(paymentIntent) {
    try {
      const {
        id: stripePaymentId,
        amount,
        currency,
        metadata,
        customer,
        payment_method
      } = paymentIntent;

      // Extract user reference from metadata
      const userReference = metadata.user_reference || metadata.phone_number;
      if (!userReference) {
        console.log('⚠️ Stripe Payment: No user reference found in metadata');
        return { success: false, message: 'No user reference found' };
      }

      // Determine if this is a demo transaction
      const isDemo = metadata.demo === 'true' || amount === 500000; // $5000 demo amount

      if (isDemo) {
        console.log('🎯 Stripe Simulation: $5,000 USD deposit detected');
      }

      // Create transaction record
      const transactionData = {
        amount: amount / 100, // Convert from cents
        currency: currency.toUpperCase(),
        status: 'completed',
        transaction_type: 'deposit',
        metadata: JSON.stringify({
          stripe_payment_id: stripePaymentId,
          customer_id: customer,
          payment_method_id: payment_method?.id,
          demo_transaction: isDemo
        }),
        reference_id: `STRIPE-${currency.toUpperCase()}-${Date.now().toString().slice(-6)}`,
        external_reference: stripePaymentId,
        created_at: new Date()
      };

      // Find user by reference (phone number or user ID)
      let user;
      if (userReference.startsWith('+')) {
        // Phone number reference
        user = await db('users')
          .join('phone_wallet_mapping', 'users.id', 'phone_wallet_mapping.user_id')
          .where('phone_wallet_mapping.phone_number', userReference)
          .select('users.*')
          .first();
      } else {
        // User ID reference
        user = await db('users').where('id', userReference).first();
      }

      if (!user) {
        console.log(`⚠️ Stripe Payment: User not found for reference: ${userReference}`);
        return { success: false, message: 'User not found' };
      }

      // Insert transaction
      const [transaction] = await db('transactions')
        .insert({
          ...transactionData,
          recipient_id: user.id,
          recipient_phone: user.phone_number,
          recipient_country_code: user.country_code
        })
        .returning('*');

      // Convert to CBUSD and credit user wallet
      const cbusdAmount = await this.convertToCBUSD(amount / 100, currency.toUpperCase());
      
      await db('wallets')
        .where('user_id', user.id)
        .increment('cbusd_balance', cbusdAmount)
        .update({ updated_at: new Date() });

      console.log(`✅ Stripe Deposit: ${amount / 100} ${currency.toUpperCase()} → ${cbusdAmount} CBUSD for user ${user.id}`);

      return {
        success: true,
        transaction_id: transaction.id,
        amount: amount / 100,
        currency: currency.toUpperCase(),
        cbusd_amount: cbusdAmount,
        user_id: user.id,
        description: isDemo ? 'Stripe Sandbox - $5,000 USD Deposit Demo' : 'Stripe Payment Processed',
        demo_transaction: isDemo,
        provider: 'stripe'
      };
    } catch (error) {
      console.error('Error processing Stripe payment:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment intent
   * @param {Object} paymentIntent - Stripe payment intent object
   * @returns {Object} - Processing result
   */
  async handleFailedPayment(paymentIntent) {
    try {
      const { id: stripePaymentId, last_payment_error, metadata } = paymentIntent;
      
      console.log(`❌ Stripe Payment Failed: ${stripePaymentId}`, last_payment_error?.message);
      
      // Log the failed payment for monitoring
      await db('transaction_events').insert({
        event_type: 'stripe_payment_failed',
        event_data: JSON.stringify({
          stripe_payment_id: stripePaymentId,
          error_message: last_payment_error?.message,
          error_code: last_payment_error?.code,
          user_reference: metadata.user_reference
        }),
        created_at: new Date()
      });

      return {
        success: true,
        message: 'Payment failure recorded',
        stripe_payment_id: stripePaymentId
      };
    } catch (error) {
      console.error('Error handling Stripe payment failure:', error);
      throw error;
    }
  }

  /**
   * Handle withdrawal transfer creation
   * @param {Object} transfer - Stripe transfer object
   * @returns {Object} - Processing result
   */
  async handleWithdrawalTransfer(transfer) {
    try {
      const { id: transferId, amount, currency, metadata } = transfer;
      
      console.log(`💸 Stripe Withdrawal: ${amount / 100} ${currency.toUpperCase()} transfer created: ${transferId}`);
      
      // Update the related transaction status
      if (metadata.transaction_id) {
        await db('transactions')
          .where('id', metadata.transaction_id)
          .update({
            status: 'completed',
            completed_at: new Date(),
            external_reference: transferId
          });
      }

      return {
        success: true,
        message: 'Withdrawal transfer processed',
        transfer_id: transferId
      };
    } catch (error) {
      console.error('Error handling Stripe withdrawal:', error);
      throw error;
    }
  }

  /**
   * Create payment intent for deposits
   * @param {number} amount - Amount in base currency units
   * @param {string} currency - Currency code (USD, GBP)
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - Payment intent details
   */
  async createPaymentIntent(amount, currency, metadata = {}) {
    try {
      // In production, this would use the Stripe SDK
      // For now, return a mock payment intent structure
      const paymentIntentId = `pi_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const paymentIntent = {
        id: paymentIntentId,
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        status: 'requires_payment_method',
        client_secret: `${paymentIntentId}_secret_${Math.random().toString(36).substring(7)}`,
        metadata: {
          ...metadata,
          provider: 'stripe',
          integration_type: 'crossbridge_deposit'
        },
        created: Math.floor(Date.now() / 1000)
      };

      console.log(`🎬 Stripe Payment Intent Created: ${paymentIntentId} for ${amount} ${currency}`);
      
      return {
        success: true,
        payment_intent: paymentIntent,
        next_action: {
          type: 'redirect_to_stripe',
          redirect_url: `https://checkout.stripe.com/pay/${paymentIntent.client_secret}`
        }
      };
    } catch (error) {
      console.error('Error creating Stripe payment intent:', error);
      throw error;
    }
  }

  /**
   * Process withdrawal to bank account
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Object} - Withdrawal result
   */
  async processWithdrawal(withdrawalData) {
    try {
      const {
        amount,
        currency,
        user_id,
        bank_account_details,
        transaction_id
      } = withdrawalData;

      // In production, this would create a Stripe transfer
      const transferId = `tr_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      console.log(`💸 Processing Stripe Withdrawal: ${amount} ${currency} to bank account`);
      
      // Mock transfer processing
      const transfer = {
        id: transferId,
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        destination: bank_account_details.account_id || 'mock_account',
        metadata: {
          transaction_id,
          user_id,
          withdrawal_type: 'bank_transfer'
        },
        created: Math.floor(Date.now() / 1000),
        status: 'in_transit'
      };

      // Update transaction with external reference
      if (transaction_id) {
        await db('transactions')
          .where('id', transaction_id)
          .update({
            external_reference: transferId,
            metadata: db.raw('metadata || ?', [JSON.stringify({ stripe_transfer_id: transferId })])
          });
      }

      return {
        success: true,
        transfer_id: transferId,
        transfer,
        estimated_arrival: '1-3 business days'
      };
    } catch (error) {
      console.error('Error processing Stripe withdrawal:', error);
      throw error;
    }
  }

  /**
   * Create transfer for withdrawals
   * @param {Object} transferData - Transfer data including amount, currency, destination
   * @returns {Object} - Transfer result
   */
  async createTransfer(transferData) {
    try {
      const { amount, currency, destination, metadata } = transferData;
      
      console.log(`💸 Creating Stripe transfer: ${amount} ${currency}`);
      
      const transfer = await this.stripe.transfers.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        destination: destination,
        metadata: metadata || {}
      });
      
      console.log(`✅ Stripe transfer created: ${transfer.id}`);
      
      return {
        success: true,
        transfer_id: transfer.id,
        amount: transfer.amount / 100,
        currency: transfer.currency.toUpperCase(),
        status: transfer.status || 'processing'
      };
    } catch (error) {
      console.error('❌ Error creating Stripe transfer:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Convert fiat currency to CBUSD
   * @param {number} amount - Amount to convert
   * @param {string} currency - Source currency
   * @returns {number} - CBUSD amount
   */
  async convertToCBUSD(amount, currency) {
    try {
      // Get current exchange rates
      const rate = await db('exchange_rates')
        .where({
          from_currency: currency,
          to_currency: 'CBUSD'
        })
        .orderBy('created_at', 'desc')
        .first();

      if (!rate) {
        // Fallback rates
        const fallbackRates = {
          'USD': 1.0,      // 1 USD = 1 CBUSD
          'GBP': 1.25,     // 1 GBP = 1.25 CBUSD
          'EUR': 1.08      // 1 EUR = 1.08 CBUSD
        };
        
        const fallbackRate = fallbackRates[currency] || 1.0;
        return parseFloat((amount * fallbackRate).toFixed(6));
      }

      return parseFloat((amount * rate.rate).toFixed(6));
    } catch (error) {
      console.error('Error converting to CBUSD:', error);
      return amount; // Fallback to 1:1 conversion
    }
  }

  /**
   * Get supported currencies
   * @returns {Array} - Supported currency codes
   */
  getSupportedCurrencies() {
    return ['USD', 'GBP', 'EUR']; // Can be expanded based on Stripe account setup
  }

  /**
   * Validate currency support
   * @param {string} currency - Currency to validate
   * @returns {boolean} - Whether currency is supported
   */
  isCurrencySupported(currency) {
    return this.getSupportedCurrencies().includes(currency.toUpperCase());
  }

  /**
   * Retrieve payment intent
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Object} - Payment intent details
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      console.log(`🔍 Retrieving Stripe Payment Intent: ${paymentIntentId}`);
      
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      
      return {
        success: true,
        payment_intent: paymentIntent,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      };
    } catch (error) {
      console.error('❌ Error retrieving Stripe payment intent:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Health check for Stripe service
   * @returns {Object} - Health status
   */
  async healthCheck() {
    try {
      // Simple API call to verify Stripe connectivity
      // Using account retrieve which is lightweight
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const account = await stripe.accounts.retrieve();
      
      return {
        webhook_status: 'connected',
        account_id: account.id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        country: account.country
      };
    } catch (error) {
      throw new Error(`Stripe health check failed: ${error.message}`);
    }
  }
}

module.exports = new StripeService();
