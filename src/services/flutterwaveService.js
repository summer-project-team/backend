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
}

module.exports = new FlutterwaveService();
