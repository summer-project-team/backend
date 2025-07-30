/**
 * Fraud Detection Service
 * Provides real-time transaction monitoring and behavioral analysis
 */
const { db } = require('../utils/database');
const redis = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class FraudDetectionService {
  constructor() {
    // Cache keys
    this.userProfileCache = 'fraud:user_profiles:';
    this.alertCache = 'fraud:alerts:';
    this.cacheDuration = 24 * 60 * 60; // 24 hours
    
    // Risk thresholds
    this.LOW_RISK_THRESHOLD = 30;
    this.MEDIUM_RISK_THRESHOLD = 60;
    this.HIGH_RISK_THRESHOLD = 80;
    
    // Risk factors and weights
    this.riskFactors = {
      // Location factors
      'unusual_location': 25,
      'high_risk_country': 30,
      'location_velocity': 40, // Impossible travel
      
      // Amount factors
      'unusual_amount': 20,
      'amount_velocity': 25, // Sudden increase
      'large_transaction': 15,
      
      // Behavioral factors
      'unusual_time': 15,
      'multiple_currencies': 10,
      'new_recipient': 10,
      'multiple_devices': 20,
      'multiple_failed_attempts': 30,
      
      // Account factors
      'new_account': 15,
      'recently_modified': 20,
      'suspicious_activity_history': 35
    };
  }

  /**
   * Score a transaction for fraud risk
   * @param {Object} transaction - Transaction object
   * @param {Object} context - Additional context (IP, device, etc.)
   * @returns {Promise<Object>} Fraud assessment
   */
  async assessTransactionRisk(transaction, context = {}) {
    try {
      // Generate request ID for tracking
      const requestId = uuidv4();
      console.log(`Fraud assessment started for transaction ${transaction.id}, request ${requestId}`);
      
      // Get user profile data
      const userProfile = await this._getUserRiskProfile(transaction.sender_id);
      
      // Prepare assessment context
      const assessmentContext = {
        transaction,
        userProfile,
        context,
        requestId
      };
      
      // Run the risk assessment checks
      const checkResults = await Promise.all([
        this._checkLocationRisk(assessmentContext),
        this._checkAmountRisk(assessmentContext),
        this._checkBehavioralRisk(assessmentContext),
        this._checkAccountRisk(assessmentContext)
      ]);
      
      // Combine results
      const riskFactors = [];
      let totalRiskScore = 0;
      
      for (const result of checkResults) {
        riskFactors.push(...result.factors);
        totalRiskScore += result.score;
      }
      
      // Cap the risk score at 100
      totalRiskScore = Math.min(totalRiskScore, 100);
      
      // Determine risk level
      let riskLevel = 'low';
      if (totalRiskScore >= this.HIGH_RISK_THRESHOLD) {
        riskLevel = 'high';
      } else if (totalRiskScore >= this.MEDIUM_RISK_THRESHOLD) {
        riskLevel = 'medium';
      } else if (totalRiskScore >= this.LOW_RISK_THRESHOLD) {
        riskLevel = 'low';
      } else {
        riskLevel = 'minimal';
      }
      
      // Generate recommendations based on risk level
      const recommendations = this._generateRecommendations(riskLevel, totalRiskScore, riskFactors);
      
      // Log high risk transactions
      if (riskLevel === 'high' || riskLevel === 'medium') {
        await this._logRiskAlert(transaction, totalRiskScore, riskLevel, riskFactors);
      }
      
      // Update user risk profile with this transaction data
      await this._updateUserRiskProfile(transaction.sender_id, transaction, riskLevel, context);
      
      // Return assessment result
      const assessment = {
        transaction_id: transaction.id,
        request_id: requestId,
        risk_score: totalRiskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors,
        recommendations,
        timestamp: new Date().toISOString()
      };
      
      console.log(`Fraud assessment completed for transaction ${transaction.id}, risk level: ${riskLevel}`);
      
      return assessment;
    } catch (error) {
      console.error(`Error assessing transaction risk for ${transaction.id}:`, error);
      
      // Return a default medium risk level if assessment fails
      return {
        transaction_id: transaction.id,
        request_id: uuidv4(),
        risk_score: 50,
        risk_level: 'medium',
        risk_factors: ['assessment_error'],
        recommendations: ['additional_verification'],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Check for device fingerprint risk
   * @param {string} userId - User ID
   * @param {string} deviceFingerprint - Device fingerprint hash
   * @returns {Promise<Object>} Device risk assessment
   */
  async assessDeviceRisk(userId, deviceFingerprint) {
    try {
      // Get user's known devices
      const knownDevices = await this._getUserDevices(userId);
      
      // Check if this device is known
      const isKnownDevice = knownDevices.includes(deviceFingerprint);
      
      // Get user's total device count
      const deviceCount = knownDevices.length;
      
      // Calculate risk based on device familiarity
      let riskScore = 0;
      const riskFactors = [];
      
      if (!isKnownDevice) {
        riskScore += 30;
        riskFactors.push('new_device');
      }
      
      // Check for multiple devices recently
      if (deviceCount > 3) {
        riskScore += 20;
        riskFactors.push('multiple_devices');
      }
      
      // Check device velocity (multiple new devices recently)
      const recentDevices = await this._getRecentDevices(userId, 7); // last 7 days
      if (recentDevices.length > 2) {
        riskScore += 25;
        riskFactors.push('device_velocity');
      }
      
      // Determine risk level
      let riskLevel = 'low';
      if (riskScore >= this.HIGH_RISK_THRESHOLD) {
        riskLevel = 'high';
      } else if (riskScore >= this.MEDIUM_RISK_THRESHOLD) {
        riskLevel = 'medium';
      } else if (riskScore >= this.LOW_RISK_THRESHOLD) {
        riskLevel = 'low';
      } else {
        riskLevel = 'minimal';
      }
      
      // Save the device if it's new
      if (!isKnownDevice) {
        await this._addUserDevice(userId, deviceFingerprint);
      }
      
      return {
        user_id: userId,
        device_fingerprint: deviceFingerprint,
        is_known_device: isKnownDevice,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors,
        device_count: deviceCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error assessing device risk for user ${userId}:`, error);
      
      // Return a default medium risk level
      return {
        user_id: userId,
        device_fingerprint: deviceFingerprint,
        is_known_device: false,
        risk_score: 50,
        risk_level: 'medium',
        risk_factors: ['assessment_error'],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Get fraud alerts
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Fraud alerts
   */
  async getFraudAlerts(filters = {}) {
    try {
      // Build query
      let query = db('fraud_alerts').select('*');
      
      // Apply filters
      if (filters.userId) {
        query = query.where({ user_id: filters.userId });
      }
      
      if (filters.riskLevel) {
        query = query.where({ risk_level: filters.riskLevel });
      }
      
      if (filters.status) {
        query = query.where({ status: filters.status });
      }
      
      if (filters.startDate && filters.endDate) {
        query = query.whereBetween('created_at', [filters.startDate, filters.endDate]);
      }
      
      // Sort by created_at desc
      query = query.orderBy('created_at', 'desc');
      
      // Apply limit
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      
      // Execute query
      const alerts = await query;
      
      return {
        total: alerts.length,
        alerts,
        filters
      };
    } catch (error) {
      console.error('Error getting fraud alerts:', error);
      throw error;
    }
  }
  
  /**
   * Update alert status
   * @param {string} alertId - Alert ID
   * @param {string} status - New status
   * @param {string} resolution - Resolution notes
   * @param {string} resolvedBy - User ID who resolved the alert
   * @returns {Promise<Object>} Updated alert
   */
  async updateAlertStatus(alertId, status, resolution, resolvedBy) {
    try {
      const [alert] = await db('fraud_alerts')
        .where({ id: alertId })
        .update({
          status,
          resolution,
          resolved_by: resolvedBy,
          resolved_at: new Date()
        })
        .returning('*');
      
      return alert;
    } catch (error) {
      console.error(`Error updating fraud alert ${alertId}:`, error);
      throw error;
    }
  }
  
  /**
   * Check location-based risk factors
   * @private
   */
  async _checkLocationRisk({ transaction, userProfile, context }) {
    // Initialize
    let score = 0;
    const factors = [];
    
    // Check if location is provided
    if (context.ip_address || context.location) {
      // Get country from IP or location data
      const country = context.country_code || this._getCountryFromIP(context.ip_address) || 'unknown';
      
      // Check for high-risk countries
      if (this._isHighRiskCountry(country)) {
        score += this.riskFactors['high_risk_country'];
        factors.push('high_risk_country');
      }
      
      // Check if location is unusual for this user
      if (userProfile.common_countries && 
          !userProfile.common_countries.includes(country)) {
        score += this.riskFactors['unusual_location'];
        factors.push('unusual_location');
      }
      
      // Check for impossible travel (location velocity)
      if (userProfile.last_location && 
          userProfile.last_location_time) {
        const timeDiff = new Date() - new Date(userProfile.last_location_time);
        const hoursSinceLastTx = timeDiff / (1000 * 60 * 60);
        
        // If different country and less than 2 hours since last transaction
        if (country !== userProfile.last_location && hoursSinceLastTx < 2) {
          score += this.riskFactors['location_velocity'];
          factors.push('location_velocity');
        }
      }
    }
    
    return { score, factors };
  }
  
  /**
   * Check amount-based risk factors
   * @private
   */
  async _checkAmountRisk({ transaction, userProfile }) {
    // Initialize
    let score = 0;
    const factors = [];
    
    const amount = parseFloat(transaction.amount);
    
    // Check for large transactions
    if (amount > 10000) {
      score += this.riskFactors['large_transaction'];
      factors.push('large_transaction');
    }
    
    // Check for unusual amounts compared to user history
    if (userProfile.avg_transaction_amount) {
      const avgAmount = parseFloat(userProfile.avg_transaction_amount);
      if (amount > avgAmount * 5) {
        score += this.riskFactors['unusual_amount'];
        factors.push('unusual_amount');
      }
    }
    
    // Check for amount velocity (sudden increase)
    if (userProfile.transactions_last_24h) {
      const last24hTotal = userProfile.transactions_last_24h.reduce(
        (sum, tx) => sum + parseFloat(tx.amount), 0);
      
      // If this transaction is more than double all transactions in last 24h
      if (amount > last24hTotal * 2) {
        score += this.riskFactors['amount_velocity'];
        factors.push('amount_velocity');
      }
    }
    
    return { score, factors };
  }
  
  /**
   * Check behavioral risk factors
   * @private
   */
  async _checkBehavioralRisk({ transaction, userProfile, context }) {
    // Initialize
    let score = 0;
    const factors = [];
    
    // Check unusual time
    const hour = new Date().getHours();
    if (hour >= 0 && hour <= 5) { // Midnight to 5 AM
      score += this.riskFactors['unusual_time'];
      factors.push('unusual_time');
    }
    
    // Check for new recipient
    const recipientId = transaction.recipient_id;
    if (recipientId && 
        (!userProfile.common_recipients || 
         !userProfile.common_recipients.includes(recipientId))) {
      score += this.riskFactors['new_recipient'];
      factors.push('new_recipient');
    }
    
    // Check for multiple currencies
    if (userProfile.transactions_last_24h) {
      const currencies = new Set();
      
      userProfile.transactions_last_24h.forEach(tx => {
        currencies.add(tx.currency_from);
        currencies.add(tx.currency_to);
      });
      
      // Add current transaction currencies
      currencies.add(transaction.currency_from);
      currencies.add(transaction.currency_to);
      
      if (currencies.size > 3) {
        score += this.riskFactors['multiple_currencies'];
        factors.push('multiple_currencies');
      }
    }
    
    // Check for multiple failed login attempts
    if (userProfile.failed_login_attempts_24h > 3) {
      score += this.riskFactors['multiple_failed_attempts'];
      factors.push('multiple_failed_attempts');
    }
    
    return { score, factors };
  }
  
  /**
   * Check account risk factors
   * @private
   */
  async _checkAccountRisk({ transaction, userProfile }) {
    // Initialize
    let score = 0;
    const factors = [];
    
    // Check for new account
    if (userProfile.account_age_days < 7) {
      score += this.riskFactors['new_account'];
      factors.push('new_account');
    }
    
    // Check for recently modified account
    if (userProfile.last_profile_update_days < 2) {
      score += this.riskFactors['recently_modified'];
      factors.push('recently_modified');
    }
    
    // Check for previous suspicious activity
    if (userProfile.previous_fraud_alerts > 0) {
      score += this.riskFactors['suspicious_activity_history'];
      factors.push('suspicious_activity_history');
    }
    
    return { score, factors };
  }
  
  /**
   * Get user's risk profile
   * @private
   */
  async _getUserRiskProfile(userId) {
    try {
      // Try to get from cache first
      const cacheKey = `${this.userProfileCache}${userId}`;
      const cachedProfile = await redis.getCache(cacheKey);
      
      if (cachedProfile) {
        return cachedProfile;
      }
      
      // Get from database if not in cache
      const user = await db('users')
        .where({ id: userId })
        .first();
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      // Calculate account age in days
      const accountAge = Math.floor(
        (new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)
      );
      
      // Calculate days since last profile update
      const lastProfileUpdate = user.updated_at || user.created_at;
      const daysSinceUpdate = Math.floor(
        (new Date() - new Date(lastProfileUpdate)) / (1000 * 60 * 60 * 24)
      );
      
      // Get last 24h transactions
      const last24hTransactions = await db('transactions')
        .where({ sender_id: userId })
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .orderBy('created_at', 'desc');
      
      // Get transaction statistics
      const transactionStats = await db('transactions')
        .where({ sender_id: userId })
        .avg('amount as avg_amount')
        .first();
      
      // Get common recipients (recipients with >1 transaction)
      const recipientQuery = await db('transactions')
        .select('recipient_id')
        .count('* as count')
        .where({ sender_id: userId })
        .whereNotNull('recipient_id')
        .groupBy('recipient_id')
        .having(db.raw('count(*) > 1'));
      
      const commonRecipients = recipientQuery.map(r => r.recipient_id);
      
      // Get common countries
      const countryQuery = await db('user_logins')
        .select('country_code')
        .count('* as count')
        .where({ user_id: userId })
        .whereNotNull('country_code')
        .groupBy('country_code')
        .orderBy('count', 'desc')
        .limit(3);
      
      const commonCountries = countryQuery.map(c => c.country_code);
      
      // Get last location
      const lastLogin = await db('user_logins')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc')
        .first();
      
      // Get failed login attempts in last 24h
      const failedLogins = await db('user_logins')
        .where({ 
          user_id: userId, 
          success: false 
        })
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .count('* as count')
        .first();
      
      // Get previous fraud alerts
      const fraudAlerts = await db('fraud_alerts')
        .where({ user_id: userId })
        .count('* as count')
        .first();
      
      // Create user risk profile
      const profile = {
        user_id: userId,
        account_age_days: accountAge,
        last_profile_update_days: daysSinceUpdate,
        avg_transaction_amount: transactionStats?.avg_amount || 0,
        common_recipients: commonRecipients,
        common_countries: commonCountries,
        last_location: lastLogin?.country_code,
        last_location_time: lastLogin?.created_at,
        transactions_last_24h: last24hTransactions,
        failed_login_attempts_24h: parseInt(failedLogins?.count || 0),
        previous_fraud_alerts: parseInt(fraudAlerts?.count || 0)
      };
      
      // Cache the profile
      await redis.setCache(cacheKey, profile, this.cacheDuration);
      
      return profile;
    } catch (error) {
      console.error(`Error getting risk profile for user ${userId}:`, error);
      
      // Return a minimal profile
      return {
        user_id: userId,
        account_age_days: 0,
        last_profile_update_days: 0,
        transactions_last_24h: [],
        failed_login_attempts_24h: 0
      };
    }
  }
  
  /**
   * Update user risk profile with new transaction data
   * @private
   */
  async _updateUserRiskProfile(userId, transaction, riskLevel, context) {
    try {
      // Get the current profile
      const cacheKey = `${this.userProfileCache}${userId}`;
      let profile = await redis.getCache(cacheKey) || { user_id: userId };
      
      // Update last location if provided
      if (context.country_code) {
        profile.last_location = context.country_code;
        profile.last_location_time = new Date().toISOString();
      }
      
      // Add transaction to last 24h transactions
      if (!profile.transactions_last_24h) {
        profile.transactions_last_24h = [];
      }
      
      // Add new transaction to the list
      profile.transactions_last_24h.unshift({
        id: transaction.id,
        amount: transaction.amount,
        currency_from: transaction.currency_from,
        currency_to: transaction.currency_to,
        created_at: transaction.created_at || new Date().toISOString(),
        risk_level: riskLevel
      });
      
      // Keep only last 24h transactions
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      profile.transactions_last_24h = profile.transactions_last_24h.filter(
        tx => tx.created_at >= cutoff
      );
      
      // Update the cache
      await redis.setCache(cacheKey, profile, this.cacheDuration);
    } catch (error) {
      console.error(`Error updating risk profile for user ${userId}:`, error);
    }
  }
  
  /**
   * Log a risk alert in the database
   * @private
   */
  async _logRiskAlert(transaction, riskScore, riskLevel, riskFactors) {
    try {
      // Create alert record
      await db('fraud_alerts').insert({
        id: uuidv4(),
        user_id: transaction.sender_id,
        transaction_id: transaction.id,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: JSON.stringify(riskFactors),
        status: 'open',
        created_at: new Date()
      });
    } catch (error) {
      console.error('Error logging fraud alert:', error);
    }
  }
  
  /**
   * Generate recommendations based on risk assessment
   * @private
   */
  _generateRecommendations(riskLevel, riskScore, riskFactors) {
    const recommendations = [];
    
    switch (riskLevel) {
      case 'high':
        recommendations.push('block_transaction');
        recommendations.push('require_2fa');
        recommendations.push('notify_admin');
        break;
        
      case 'medium':
        recommendations.push('require_2fa');
        if (riskFactors.includes('new_device') || 
            riskFactors.includes('unusual_location')) {
          recommendations.push('verify_identity');
        }
        break;
        
      case 'low':
        if (riskFactors.includes('unusual_amount') ||
            riskFactors.includes('new_recipient')) {
          recommendations.push('confirm_transaction');
        }
        break;
        
      default:
        recommendations.push('proceed');
    }
    
    return recommendations;
  }
  
  /**
   * Check if country is high-risk
   * @private
   */
  _isHighRiskCountry(countryCode) {
    // List of high-risk countries
    const highRiskCountries = [
      'AF', 'KP', 'IR', 'IQ', 'SY', 'SS', 'YE', 'VE', 'MM'
    ];
    
    return highRiskCountries.includes(countryCode);
  }
  
  /**
   * Get country from IP address
   * @private
   */
  _getCountryFromIP(ipAddress) {
    // In a real implementation, this would use a GeoIP service
    // For now, return a mock country
    return 'US';
  }
  
  /**
   * Get user's known devices
   * @private
   */
  async _getUserDevices(userId) {
    try {
      const devices = await db('user_devices')
        .select('device_fingerprint')
        .where({ user_id: userId });
      
      return devices.map(d => d.device_fingerprint);
    } catch (error) {
      console.error(`Error getting devices for user ${userId}:`, error);
      return [];
    }
  }
  
  /**
   * Get recently added devices
   * @private
   */
  async _getRecentDevices(userId, days = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const devices = await db('user_devices')
        .select('device_fingerprint')
        .where({ user_id: userId })
        .where('created_at', '>=', cutoffDate);
      
      return devices.map(d => d.device_fingerprint);
    } catch (error) {
      console.error(`Error getting recent devices for user ${userId}:`, error);
      return [];
    }
  }
  
  /**
   * Add a device to user's known devices
   * @private
   */
  async _addUserDevice(userId, deviceFingerprint) {
    try {
      await db('user_devices').insert({
        id: uuidv4(),
        user_id: userId,
        device_fingerprint: deviceFingerprint,
        created_at: new Date()
      });
    } catch (error) {
      console.error(`Error adding device for user ${userId}:`, error);
    }
  }
}

// Create singleton instance
const fraudDetectionService = new FraudDetectionService();

module.exports = fraudDetectionService; 