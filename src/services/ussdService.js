/**
 * USSD Service
 * Handles USSD-specific business logic and integrations
 */
const { db } = require('../utils/database');
const { setCache, getCache } = require('../utils/redis');
const transactionService = require('./transaction');
const phoneManagementService = require('./phoneManagementService');
const pricingService = require('./pricingService');
const { v4: uuidv4 } = require('uuid');

class USSDService {
  constructor() {
    this.sessionTimeout = 180; // 3 minutes
    this.maxSessionsPerPhone = 3;
  }

  /**
   * Initiate USSD session
   * @param {string} phoneNumber - User's phone number
   * @param {string} networkCode - Telecom network code
   * @param {string} ussdCode - USSD code dialed
   * @returns {Object} Session initiation result
   */
  async initiateSession(phoneNumber, networkCode, ussdCode) {
    try {
      // Validate phone number
      const phoneValidation = phoneManagementService.validatePhoneNumber(phoneNumber, 'NG');
      if (!phoneValidation.isValid) {
        return {
          success: false,
          message: 'Invalid phone number format.',
          end_session: true
        };
      }

      // Check if user exists
      const user = await phoneManagementService.lookupUserByPhone(phoneValidation.e164Format);
      if (!user) {
        return {
          success: false,
          message: 'Welcome to CrossBridge. You need to register first.\nPlease download our app or visit our website to register.',
          end_session: true
        };
      }

      // Generate session ID
      const sessionId = uuidv4();
      
      // Check existing sessions for this phone
      const existingSessions = await this.getActiveSessionsForPhone(phoneValidation.e164Format);
      if (existingSessions.length >= this.maxSessionsPerPhone) {
        // Clear oldest sessions
        await this.clearOldestSessions(phoneValidation.e164Format);
      }

      // Create new session
      const session = {
        session_id: sessionId,
        phone_number: phoneValidation.e164Format,
        user_id: user.id,
        network_code: networkCode,
        ussd_code: ussdCode,
        step: 'main',
        data: {},
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };

      await setCache(`ussd:${sessionId}`, session, this.sessionTimeout);
      await this.trackSessionStart(sessionId, user.id, networkCode);

      return {
        success: true,
        session_id: sessionId,
        user_id: user.id,
        message: this.generateMainMenu(user)
      };
    } catch (error) {
      console.error('USSD session initiation error:', error);
      return {
        success: false,
        message: 'Service temporarily unavailable. Please try again.',
        end_session: true
      };
    }
  }

  /**
   * Process USSD transaction
   * @param {string} sessionId - Session ID
   * @param {Object} sessionData - Session data
   * @returns {Object} Transaction result
   */
  async processUSSDTransaction(sessionId, sessionData) {
    try {
      const { user_id, amount, recipient_phone } = sessionData.data;

      // Validate recipient
      const recipientValidation = phoneManagementService.validatePhoneNumber(recipient_phone, 'NG');
      if (!recipientValidation.isValid) {
        return {
          success: false,
          message: 'Invalid recipient phone number.',
          end_session: true
        };
      }

      const recipient = await phoneManagementService.lookupUserByPhone(recipientValidation.e164Format);
      if (!recipient) {
        return {
          success: false,
          message: 'Recipient not found on CrossBridge.',
          end_session: true
        };
      }

      // Process the transaction using existing transaction service
      const transactionResult = await transactionService.processP2PTransfer({
        sender_id: user_id,
        recipient_id: recipient.id,
        amount: amount,
        currency_from: 'CBUSD',
        currency_to: 'CBUSD',
        source: 'ussd',
        session_id: sessionId
      });

      if (transactionResult.success) {
        // Track successful USSD transaction
        await this.trackUSSDTransaction(sessionId, transactionResult.transaction_id, 'success');
        
        return {
          success: true,
          message: `Transfer successful!\n${amount} CBUSD sent to ${recipient_phone}\nRef: ${transactionResult.reference}`,
          transaction_id: transactionResult.transaction_id,
          end_session: true
        };
      } else {
        await this.trackUSSDTransaction(sessionId, null, 'failed', transactionResult.error);
        
        return {
          success: false,
          message: `Transfer failed: ${transactionResult.error}`,
          end_session: true
        };
      }
    } catch (error) {
      console.error('USSD transaction processing error:', error);
      await this.trackUSSDTransaction(sessionId, null, 'error', error.message);
      
      return {
        success: false,
        message: 'Transaction failed. Please try again or contact support.',
        end_session: true
      };
    }
  }

  /**
   * Get session status
   * @param {string} sessionId - Session ID
   * @returns {Object} Session status
   */
  async getSessionStatus(sessionId) {
    try {
      const session = await getCache(`ussd:${sessionId}`);
      if (!session) {
        return {
          exists: false,
          message: 'Session not found or expired'
        };
      }

      return {
        exists: true,
        session_id: sessionId,
        user_id: session.user_id,
        step: session.step,
        created_at: session.created_at,
        last_activity: session.last_activity,
        expires_in: await this.getSessionTimeRemaining(sessionId)
      };
    } catch (error) {
      console.error('Error getting session status:', error);
      return {
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Handle telecom provider callback
   * @param {Object} callbackData - Callback data from telecom provider
   * @returns {Object} Callback processing result
   */
  async handleProviderCallback(callbackData) {
    try {
      const { session_id, phone_number, text, network_code } = callbackData;

      // Validate callback data
      if (!session_id || !phone_number) {
        return {
          success: false,
          message: 'Invalid callback data'
        };
      }

      // Get session
      const session = await getCache(`ussd:${session_id}`);
      if (!session) {
        return {
          success: false,
          message: 'Session expired. Please dial *737# to start again.',
          end_session: true
        };
      }

      // Update last activity
      session.last_activity = new Date().toISOString();
      await setCache(`ussd:${session_id}`, session, this.sessionTimeout);

      // Track callback
      await this.trackCallback(session_id, network_code, text);

      return {
        success: true,
        session_id: session_id,
        message: 'Callback processed successfully'
      };
    } catch (error) {
      console.error('Provider callback error:', error);
      return {
        success: false,
        message: 'Callback processing failed',
        error: error.message
      };
    }
  }

  /**
   * Generate main menu for USSD
   * @param {Object} user - User object
   * @returns {string} Main menu message
   */
  generateMainMenu(user) {
    return `Welcome to CrossBridge, ${user.first_name}\n` +
           '1. Check balance\n' +
           '2. Send money\n' +
           '3. Deposit from bank\n' +
           '4. Withdraw to bank\n' +
           '5. Check rates\n' +
           '6. Recent transactions\n' +
           '7. Settings\n' +
           '0. Exit';
  }

  /**
   * Get active sessions for a phone number
   * @private
   */
  async getActiveSessionsForPhone(phoneNumber) {
    try {
      // This would require implementing a way to track sessions by phone
      // For now, we'll return empty array
      return [];
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Clear oldest sessions for a phone number
   * @private
   */
  async clearOldestSessions(phoneNumber) {
    try {
      // Implementation would clear oldest sessions
      console.log(`Clearing oldest sessions for ${phoneNumber}`);
    } catch (error) {
      console.error('Error clearing old sessions:', error);
    }
  }

  /**
   * Track session start
   * @private
   */
  async trackSessionStart(sessionId, userId, networkCode) {
    try {
      await db('ussd_sessions').insert({
        session_id: sessionId,
        user_id: userId,
        network_code: networkCode,
        status: 'active',
        created_at: new Date()
      });
    } catch (error) {
      console.error('Error tracking session start:', error);
    }
  }

  /**
   * Track USSD transaction
   * @private
   */
  async trackUSSDTransaction(sessionId, transactionId, status, errorMessage = null) {
    try {
      await db('ussd_transactions').insert({
        session_id: sessionId,
        transaction_id: transactionId,
        status: status,
        error_message: errorMessage,
        created_at: new Date()
      });
    } catch (error) {
      console.error('Error tracking USSD transaction:', error);
    }
  }

  /**
   * Track provider callback
   * @private
   */
  async trackCallback(sessionId, networkCode, text) {
    try {
      await db('ussd_callbacks').insert({
        session_id: sessionId,
        network_code: networkCode,
        input_text: text,
        created_at: new Date()
      });
    } catch (error) {
      console.error('Error tracking callback:', error);
    }
  }

  /**
   * Get session time remaining
   * @private
   */
  async getSessionTimeRemaining(sessionId) {
    try {
      const ttl = await getCache(`ussd:${sessionId}:ttl`);
      return ttl || 0;
    } catch (error) {
      return 0;
    }
  }
}

// Create singleton instance
const ussdService = new USSDService();

module.exports = ussdService;
