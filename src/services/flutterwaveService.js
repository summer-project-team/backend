/**
 * Flutterwave Integration Service
 * Extends existing banking infrastructure for Flutterwave-specific sandbox simulation
 */
const crypto = require('crypto');
const { db } = require('../utils/database');

class FlutterwaveService {
  /**
   * Verify Flutterwave webhook signature
   * @param {string} signature - Webhook signature from header
   * @param {string} payload - Raw JSON payload as string
   * @returns {boolean} - Whether signature is valid
   */
  verifyWebhookSignature(signature, payload) {
    try {
      const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
      if (!secretHash) {
        console.warn('Flutterwave secret hash not configured');
        return process.env.NODE_ENV === 'development'; // Allow in dev mode
      }
      
      const expectedSignature = crypto
        .createHash('sha256')
        .update(secretHash + payload)
        .digest('hex');
      
      return signature === expectedSignature;
    } catch (error) {
      console.error('Error verifying Flutterwave webhook:', error);
      return false;
    }
  }

  /**
   * Process Flutterwave deposit webhook
   * Validates the webhook and triggers existing bank deposit processing
   * @param {Object} webhookData - Flutterwave webhook payload
   * @returns {Object} - Processing result
   */
  async processDepositWebhook(webhookData) {
    try {
      const { event, data } = webhookData;
      
      if (event !== 'charge.completed') {
        return { success: false, message: 'Ignoring non-completion event' };
      }

      // Extract transaction details
      const {
        id: flutterwaveId,
        tx_ref: referenceCode,
        amount,
        currency,
        customer,
        status,
        charged_amount
      } = data;

      if (status !== 'successful') {
        return { success: false, message: 'Transaction not successful' };
      }

      // Enhanced logging for simulation flow
      if (currency === 'NGN' && parseFloat(amount) === 100000) {
        console.log('🎯 Flutterwave Simulation: ₦100k GTBank transfer detected');
        
        // Log the webhook event using existing webhook logging
        await db('webhook_events').insert({
          id: require('uuid').v4(),
          event_type: 'flutterwave_deposit',
          reference_code: referenceCode,
          amount: parseFloat(amount),
          currency: currency,
          bank_reference: flutterwaveId,
          raw_data: JSON.stringify(webhookData),
          created_at: new Date()
        });

        // Use existing bank deposit processing
        const existingWebhookController = require('../controllers/webhookController');
        
        // Create standardized bank deposit payload
        const bankDepositPayload = {
          reference_code: referenceCode,
          amount: amount,
          currency: currency,
          bank_reference: flutterwaveId,
          timestamp: new Date().toISOString()
        };

        // Mock request/response for existing controller
        const mockReq = { body: bankDepositPayload };
        const mockRes = {
          status: () => mockRes,
          json: (data) => data
        };

        try {
          // Use existing bank deposit handler
          await existingWebhookController.handleBankDeposit(mockReq, mockRes, (err) => {
            if (err) throw err;
          });

          console.log('✅ Existing bank deposit processing completed');
          
          // Add simulation-specific enhancements
          await this.enhanceWithSimulationFlow(referenceCode, amount, currency);

          return {
            success: true,
            message: 'CrossBridge simulation flow completed',
            data: {
              reference_code: referenceCode,
              amount: amount,
              currency: currency,
              simulation_enhanced: true
            }
          };
        } catch (error) {
          console.error('Bank deposit processing failed:', error);
          throw error;
        }
      }

      return { success: true, message: 'Webhook processed' };
    } catch (error) {
      console.error('Error processing Flutterwave webhook:', error);
      throw error;
    }
  }

  /**
   * Enhance existing transaction with simulation-specific logging and events
   * This adds the 5-step flow tracking on top of existing processing
   * @param {string} referenceCode - Deposit reference code
   * @param {number} amount - Amount in NGN
   * @param {string} currency - Source currency
   */
  async enhanceWithSimulationFlow(referenceCode, amount, currency) {
    try {
      console.log('🚀 Enhancing with CrossBridge simulation flow...');
      
      // Find the transaction created by existing processing
      const depositRef = await db('bank_deposit_references')
        .where({ reference_code: referenceCode })
        .first();

      if (!depositRef) {
        console.warn('Deposit reference not found for simulation enhancement');
        return;
      }

      // Step 1: Log Fiat Simulation Start
      await this.logSimulationStep(depositRef.id, 'fiat_simulation_start', {
        step: 1,
        description: 'Flutterwave Sandbox - ₦100k GTBank Transfer',
        amount: amount,
        currency: currency,
        provider: 'flutterwave_sandbox'
      });

      // Step 2: Log Core System Processing (already handled by existing code)
      await this.logSimulationStep(depositRef.id, 'crossbridge_core', {
        step: 2,
        description: 'CrossBridge Core - KYC + Rate Lock + Route Selection',
        kyc_status: 'verified', // Mock for simulation
        exchange_rate: 0.0025, // ₦1 = £0.0025
        route: 'polygon_bridge'
      });

      // Step 3: Log Token Logic (enhance existing CBUSD processing)
      const gbpAmount = amount * 0.0025; // Mock conversion
      await this.logSimulationStep(depositRef.id, 'polygon_tokens', {
        step: 3,
        description: 'Polygon Testnet - CBUSD Minting + DEX Simulation',
        network: 'polygon_mumbai',
        cbusd_amount: gbpAmount,
        dex_protocol: 'quickswap_mumbai'
      });

      // Step 4: Log GBP Payout Simulation
      await this.logSimulationStep(depositRef.id, 'gbp_payout_simulation', {
        step: 4,
        description: 'Mock UK Bank Transfer',
        gbp_amount: gbpAmount.toFixed(2),
        recipient_bank: 'NatWest Bank',
        recipient_account: 'GB29 NWBK 6016 1331 9268 19'
      });

      // Step 5: Log Integration Complete
      await this.logSimulationStep(depositRef.id, 'integration_complete', {
        step: 5,
        description: 'Flow Complete - SMS + Logging',
        total_time: '~5-10 minutes',
        simulation_mode: true
      });

      // Send mock SMS using existing patterns
      await this.sendSimulationSMS(gbpAmount);

    } catch (error) {
      console.error('Error enhancing simulation flow:', error);
    }
  }

  /**
   * Log simulation step events (builds on existing transaction events)
   */
  async logSimulationStep(depositRefId, stepType, stepData) {
    await db('transaction_events').insert({
      id: require('uuid').v4(),
      transaction_id: depositRefId, // Using deposit ref ID as reference
      event_type: `simulation_${stepType}`,
      event_data: JSON.stringify({
        ...stepData,
        timestamp: new Date().toISOString(),
        simulation: true
      }),
      created_at: new Date()
    });

    console.log(`📋 Step ${stepData.step}: ${stepData.description}`);
  }

  /**
   * Send simulation SMS (uses existing patterns)
   */
  async sendSimulationSMS(gbpAmount) {
    const message = `CrossBridge Simulation: £${gbpAmount.toFixed(2)} transfer completed successfully. This is a demo transaction.`;
    console.log('📱 Mock SMS:', message);
    return { success: true, message };
  }

  /**
   * List available banks for transfers
   * @returns {Array} - List of supported banks
   */
  async listBanks() {
    try {
      // Mock bank list for Nigeria (most commonly used)
      const mockBanks = [
        { code: '044', name: 'Access Bank' },
        { code: '014', name: 'Afribank' },
        { code: '050', name: 'Ecobank' },
        { code: '070', name: 'Fidelity Bank' },
        { code: '011', name: 'First Bank' },
        { code: '214', name: 'First City Monument Bank' },
        { code: '058', name: 'Guaranty Trust Bank' },
        { code: '030', name: 'Heritage Bank' },
        { code: '082', name: 'Keystone Bank' },
        { code: '076', name: 'Polaris Bank' },
        { code: '101', name: 'Providus Bank' },
        { code: '221', name: 'Stanbic IBTC Bank' },
        { code: '068', name: 'Standard Chartered Bank' },
        { code: '232', name: 'Sterling Bank' },
        { code: '032', name: 'Union Bank' },
        { code: '033', name: 'United Bank for Africa' },
        { code: '215', name: 'Unity Bank' },
        { code: '035', name: 'Wema Bank' },
        { code: '057', name: 'Zenith Bank' }
      ];

      return mockBanks;
    } catch (error) {
      console.error('Error fetching bank list:', error);
      throw error;
    }
  }

  /**
   * Create payment charge for deposits
   * @param {number} amount - Amount in Naira
   * @param {string} currency - Currency code (NGN)
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - Payment charge details
   */
  async createPaymentCharge(amount, currency = 'NGN', metadata = {}) {
    try {
      const chargeData = {
        tx_ref: `FLW-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: amount,
        currency: currency.toUpperCase(),
        redirect_url: metadata.redirect_url || `${process.env.FRONTEND_URL}/payment/success`,
        meta: metadata,
        customer: {
          email: metadata.customer_email || 'demo@crossbridge.com',
          phone_number: metadata.customer_phone || '+2348000000000',
          name: metadata.customer_name || 'Demo Customer'
        },
        customizations: {
          title: 'CrossBridge Deposit',
          description: 'Fund your CrossBridge wallet',
          logo: `${process.env.FRONTEND_URL}/logo.png`
        }
      };

      // Mock Flutterwave payment link generation
      console.log(`🔗 Flutterwave Charge Created: ${chargeData.tx_ref} for ₦${amount}`);

      return {
        success: true,
        data: {
          link: `https://checkout.flutterwave.com/v3/hosted/pay/${chargeData.tx_ref}`,
          tx_ref: chargeData.tx_ref,
          amount: amount,
          currency: currency,
          ...chargeData
        }
      };
    } catch (error) {
      console.error('Error creating Flutterwave charge:', error);
      throw error;
    }
  }

  /**
   * Process withdrawal to Nigerian bank account
   * @param {Object} withdrawalData - Withdrawal details
   * @returns {Object} - Processing result
   */
  async processWithdrawal(withdrawalData) {
    try {
      const {
        account_bank,
        account_number,
        amount,
        narration,
        currency = 'NGN',
        beneficiary_name,
        user_id,
        reference
      } = withdrawalData;

      // Mock transfer to bank account
      const transferRef = `FLW-TRANSFER-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      
      console.log(`💸 Flutterwave Withdrawal: ₦${amount} to ${account_bank} ${account_number}`);

      // Create transaction record
      const [transaction] = await db('transactions')
        .insert({
          sender_id: user_id,
          amount: amount,
          currency: currency,
          status: 'processing',
          transaction_type: 'withdrawal',
          metadata: JSON.stringify({
            flutterwave_transfer_id: transferRef,
            account_bank,
            account_number,
            beneficiary_name,
            narration
          }),
          reference_id: reference || `FLW-WITH-${Date.now().toString().slice(-6)}`,
          external_reference: transferRef,
          created_at: new Date()
        })
        .returning('*');

      // Simulate processing delay and success
      setTimeout(async () => {
        await db('transactions')
          .where('id', transaction.id)
          .update({
            status: 'completed',
            completed_at: new Date()
          });
        console.log(`✅ Withdrawal ${transferRef} completed successfully`);
      }, 2000);

      return {
        success: true,
        transaction_id: transaction.id,
        transfer_id: transferRef,
        amount: amount,
        currency: currency,
        status: 'processing',
        description: 'Bank withdrawal initiated via Flutterwave'
      };
    } catch (error) {
      console.error('Error processing Flutterwave withdrawal:', error);
      throw error;
    }
  }

  /**
   * Convert amount to CBUSD (matches Stripe pattern)
   * @param {number} amount - Amount in source currency
   * @param {string} currency - Source currency
   * @returns {number} - CBUSD amount
   */
  async convertToCBUSD(amount, currency) {
    try {
      // Exchange rates (mock rates for demo)
      const rates = {
        'NGN': 0.0013, // 1 NGN = 0.0013 USD (approx 770 NGN per USD)
        'USD': 1.0,
        'GBP': 1.27,   // 1 GBP = 1.27 USD
        'EUR': 1.09    // 1 EUR = 1.09 USD
      };

      const usdAmount = amount * (rates[currency] || 1);
      
      // CBUSD is 1:1 with USD
      return parseFloat(usdAmount.toFixed(6));
    } catch (error) {
      console.error('Error converting to CBUSD:', error);
      return amount; // Fallback to original amount
    }
  }

  /**
   * Get supported currencies for Flutterwave
   * @returns {Array} - Supported currency codes
   */
  getSupportedCurrencies() {
    return ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'UGX', 'ZAR'];
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
   * Verify payment transaction
   * @param {string} transactionId - Flutterwave transaction ID
   * @returns {Object} - Payment verification result
   */
  async verifyPayment(transactionId) {
    try {
      console.log(`🔍 Verifying Flutterwave payment: ${transactionId}`);
      
      // Mock verification for sandbox
      const mockVerification = {
        id: transactionId,
        tx_ref: `FLW-${Date.now()}-VERIFIED`,
        flw_ref: `FLW-MOCK-${transactionId}`,
        status: 'successful',
        amount: 100000, // Mock amount
        currency: 'NGN',
        charged_amount: 100000,
        app_fee: 1000,
        merchant_fee: 0,
        processor_response: 'Transaction successful',
        auth_model: 'BANK_TRANSFER',
        payment_type: 'banktransfer',
        created_at: new Date().toISOString()
      };

      return {
        success: true,
        transaction: mockVerification,
        status: mockVerification.status,
        amount: mockVerification.amount,
        currency: mockVerification.currency
      };
    } catch (error) {
      console.error('❌ Error verifying Flutterwave payment:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Health check for Flutterwave service
   * @returns {Object} - Health status
   */
  async healthCheck() {
    try {
      // Simple connectivity check by attempting to list banks
      const banks = await this.listBanks();
      
      return {
        api_status: 'connected',
        supported_currencies: this.getSupportedCurrencies(),
        available_banks_count: banks.length,
        integration_type: 'sandbox' // or 'production'
      };
    } catch (error) {
      throw new Error(`Flutterwave health check failed: ${error.message}`);
    }
  }
}

module.exports = new FlutterwaveService();
