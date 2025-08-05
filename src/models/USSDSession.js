const { db } = require('../utils/database');

class USSDSession {
  /**
   * Create a new USSD session
   * @param {Object} sessionData - Session data
   * @returns {Object} Created session
   */
  static async create(sessionData) {
    try {
      const [session] = await db('ussd_sessions')
        .insert({
          session_id: sessionData.session_id,
          user_id: sessionData.user_id,
          phone_number: sessionData.phone_number,
          network_code: sessionData.network_code,
          ussd_code: sessionData.ussd_code,
          status: 'active',
          session_data: JSON.stringify(sessionData.session_data || {}),
          expires_at: new Date(Date.now() + (3 * 60 * 1000)) // 3 minutes
        })
        .returning('*');
      
      return session;
    } catch (error) {
      console.error('Error creating USSD session:', error);
      throw error;
    }
  }

  /**
   * Find session by session ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session or null
   */
  static async findBySessionId(sessionId) {
    try {
      const session = await db('ussd_sessions')
        .where('session_id', sessionId)
        .first();
      
      if (session && session.session_data) {
        session.session_data = JSON.parse(session.session_data);
      }
      
      return session;
    } catch (error) {
      console.error('Error finding USSD session:', error);
      throw error;
    }
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated session
   */
  static async update(sessionId, updates) {
    try {
      const updateData = { ...updates };
      
      if (updateData.session_data) {
        updateData.session_data = JSON.stringify(updateData.session_data);
      }
      
      updateData.updated_at = new Date();
      
      const [session] = await db('ussd_sessions')
        .where('session_id', sessionId)
        .update(updateData)
        .returning('*');
      
      if (session && session.session_data) {
        session.session_data = JSON.parse(session.session_data);
      }
      
      return session;
    } catch (error) {
      console.error('Error updating USSD session:', error);
      throw error;
    }
  }

  /**
   * Get active sessions for a phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Array} Active sessions
   */
  static async getActiveSessionsForPhone(phoneNumber) {
    try {
      const sessions = await db('ussd_sessions')
        .where('phone_number', phoneNumber)
        .where('status', 'active')
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'desc');
      
      return sessions.map(session => {
        if (session.session_data) {
          session.session_data = JSON.parse(session.session_data);
        }
        return session;
      });
    } catch (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }
  }

  /**
   * Expire old sessions
   * @param {string} phoneNumber - Phone number (optional)
   * @returns {number} Number of expired sessions
   */
  static async expireOldSessions(phoneNumber = null) {
    try {
      let query = db('ussd_sessions')
        .where('expires_at', '<', new Date())
        .where('status', 'active');
      
      if (phoneNumber) {
        query = query.where('phone_number', phoneNumber);
      }
      
      const expiredCount = await query.update({
        status: 'expired',
        updated_at: new Date()
      });
      
      return expiredCount;
    } catch (error) {
      console.error('Error expiring old sessions:', error);
      throw error;
    }
  }

  /**
   * Get session analytics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} networkCode - Network code (optional)
   * @returns {Object} Analytics data
   */
  static async getAnalytics(startDate, endDate, networkCode = null) {
    try {
      let query = db('ussd_sessions')
        .whereBetween('created_at', [startDate, endDate]);
      
      if (networkCode) {
        query = query.where('network_code', networkCode);
      }
      
      const analytics = await query
        .select(
          db.raw('COUNT(*) as total_sessions'),
          db.raw('COUNT(DISTINCT user_id) as unique_users'),
          db.raw('AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration'),
          'network_code'
        )
        .groupBy('network_code');
      
      return analytics;
    } catch (error) {
      console.error('Error getting USSD analytics:', error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   * @param {number} olderThanDays - Clean sessions older than X days
   * @returns {number} Number of deleted sessions
   */
  static async cleanup(olderThanDays = 7) {
    try {
      const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
      
      const deletedCount = await db('ussd_sessions')
        .where('created_at', '<', cutoffDate)
        .del();
      
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up USSD sessions:', error);
      throw error;
    }
  }
}

module.exports = USSDSession;
