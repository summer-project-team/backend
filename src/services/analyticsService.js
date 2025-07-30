/**
 * Transaction Analytics Service
 * Provides comprehensive analytics and reporting on transactions
 */
const { db } = require('../utils/database');
const redis = require('../utils/redis');

class AnalyticsService {
  constructor() {
    // Cache keys
    this.dailyVolumeCache = 'analytics:daily_volume';
    this.weeklyVolumeCache = 'analytics:weekly_volume';
    this.monthlyVolumeCache = 'analytics:monthly_volume';
    
    // Cache durations (seconds)
    this.shortCacheDuration = 5 * 60; // 5 minutes
    this.mediumCacheDuration = 30 * 60; // 30 minutes
    this.longCacheDuration = 24 * 60 * 60; // 24 hours
  }

  /**
   * Get transaction volume summary
   * @param {string} period - time period (daily, weekly, monthly, yearly)
   * @param {string} currency - optional currency filter
   * @returns {Promise<Object>} Volume data
   */
  async getVolumeData(period = 'daily', currency = null) {
    try {
      // Determine time interval for query
      const { interval, format, cacheKey } = this._getIntervalConfig(period, currency);
      
      // Try to get from cache first
      if (cacheKey) {
        const cachedData = await redis.getCache(cacheKey);
        if (cachedData) {
          return cachedData;
        }
      }
      
      // Build base query
      let query = db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          db.raw('SUM(amount) as volume'),
          db.raw('COUNT(*) as transaction_count'),
          'currency_from'
        )
        .where('status', 'completed');
      
      // Apply currency filter if provided
      if (currency) {
        query = query.where('currency_from', currency.toUpperCase());
      }
      
      // Group and sort
      query = query
        .groupBy('time_period', 'currency_from')
        .orderBy('time_period');
      
      // Execute query
      const volumeData = await query;
      
      // Process results
      const result = this._formatVolumeData(volumeData, period);
      
      // Cache results
      if (cacheKey) {
        await redis.setCache(cacheKey, result, this._getCacheDuration(period));
      }
      
      return result;
    } catch (error) {
      console.error('Error getting volume data:', error);
      throw error;
    }
  }
  
  /**
   * Get analytics for a specific corridor
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {string} period - time period (daily, weekly, monthly)
   * @returns {Promise<Object>} Corridor analytics
   */
  async getCorridorAnalytics(fromCurrency, toCurrency, period = 'daily') {
    try {
      // Normalize currency codes
      fromCurrency = fromCurrency.toUpperCase();
      toCurrency = toCurrency.toUpperCase();
      
      // Determine time interval
      const { interval } = this._getIntervalConfig(period);
      
      // Get volume data
      const volumeQuery = db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          db.raw('SUM(amount) as volume'),
          db.raw('COUNT(*) as transaction_count'),
          db.raw('AVG(exchange_rate) as average_rate')
        )
        .where({
          'currency_from': fromCurrency,
          'currency_to': toCurrency,
          'status': 'completed'
        })
        .groupBy('time_period')
        .orderBy('time_period');
      
      const volumeData = await volumeQuery;
      
      // Get success rate data
      const statusQuery = db('transactions')
        .select('status')
        .count('* as count')
        .where({
          'currency_from': fromCurrency,
          'currency_to': toCurrency
        })
        .groupBy('status');
      
      const statusData = await statusQuery;
      
      // Get average processing time
      const avgTimeQuery = db('transactions')
        .select(db.raw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_processing_time'))
        .where({
          'currency_from': fromCurrency,
          'currency_to': toCurrency,
          'status': 'completed'
        });
      
      const avgTimeData = await avgTimeQuery;
      
      // Get fee revenue
      const feeQuery = db('transactions')
        .select(db.raw('SUM(fee) as total_fees'))
        .where({
          'currency_from': fromCurrency,
          'currency_to': toCurrency,
          'status': 'completed'
        });
      
      const feeData = await feeQuery;
      
      // Format results
      const formattedVolumeData = this._formatVolumeData(volumeData, period);
      const totalTransactions = statusData.reduce((sum, item) => sum + parseInt(item.count), 0);
      const successRate = statusData.find(s => s.status === 'completed')
        ? parseFloat(statusData.find(s => s.status === 'completed').count) / totalTransactions
        : 0;
      
      // Calculate failure rate breakdown
      const failureBreakdown = {};
      statusData
        .filter(s => s.status !== 'completed')
        .forEach(s => {
          failureBreakdown[s.status] = parseFloat(s.count) / totalTransactions;
        });
      
      // Final result
      const result = {
        corridor: `${fromCurrency}-${toCurrency}`,
        period,
        volume_data: formattedVolumeData.volumes,
        transaction_count: formattedVolumeData.total_transactions,
        total_volume: formattedVolumeData.total_volume,
        success_rate: successRate,
        failure_breakdown: failureBreakdown,
        average_processing_time: avgTimeData[0]?.avg_processing_time ? parseFloat(avgTimeData[0].avg_processing_time) : 0,
        total_fees: feeData[0]?.total_fees ? parseFloat(feeData[0].total_fees) : 0,
        average_fee: totalTransactions > 0 && feeData[0]?.total_fees ? parseFloat(feeData[0].total_fees) / totalTransactions : 0
      };
      
      return result;
    } catch (error) {
      console.error('Error getting corridor analytics:', error);
      throw error;
    }
  }
  
  /**
   * Get user activity statistics
   * @param {Object} options - Query options (days, user_id)
   * @returns {Promise<Object>} User activity data
   */
  async getUserActivity(options = {}) {
    try {
      const days = options.days || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Query for new users per day
      const newUsersQuery = db('users')
        .select(
          db.raw('DATE(created_at) as date'),
          db.raw('COUNT(*) as count')
        )
        .where('created_at', '>=', startDate)
        .groupBy('date')
        .orderBy('date');
      
      // Query for active users per day
      const activeUsersQuery = db('transactions')
        .select(
          db.raw('DATE(created_at) as date'),
          db.raw('COUNT(DISTINCT sender_id) as count')
        )
        .where('created_at', '>=', startDate)
        .groupBy('date')
        .orderBy('date');
      
      // Query for retention data (users who transacted in last 7, 14, 30 days)
      const retention7DaysQuery = this._getRetentionQuery(7);
      const retention14DaysQuery = this._getRetentionQuery(14);
      const retention30DaysQuery = this._getRetentionQuery(30);
      
      // Execute queries
      const [newUsers, activeUsers, retention7Days, retention14Days, retention30Days] = 
        await Promise.all([
          newUsersQuery,
          activeUsersQuery,
          retention7DaysQuery,
          retention14DaysQuery,
          retention30DaysQuery
        ]);
      
      // Calculate user growth rate
      const userGrowth = this._calculateGrowthRate(newUsers);
      
      // Format results
      return {
        timeframe: `${days} days`,
        new_users: newUsers,
        active_users: activeUsers,
        user_growth_rate: userGrowth,
        retention: {
          '7_days': retention7Days,
          '14_days': retention14Days,
          '30_days': retention30Days
        }
      };
    } catch (error) {
      console.error('Error getting user activity data:', error);
      throw error;
    }
  }
  
  /**
   * Get transaction performance metrics
   * @returns {Promise<Object>} Performance data
   */
  async getPerformanceMetrics() {
    try {
      // Query for average processing times by transaction type
      const processingTimesQuery = db('transactions')
        .select(
          'transaction_type',
          db.raw('AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_time'),
          db.raw('MIN(EXTRACT(EPOCH FROM (completed_at - created_at))) as min_time'),
          db.raw('MAX(EXTRACT(EPOCH FROM (completed_at - created_at))) as max_time'),
          db.raw('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))) as p95_time')
        )
        .whereNotNull('completed_at')
        .groupBy('transaction_type');
      
      // Query for success rates by transaction type
      const successRatesQuery = db.raw(`
        SELECT 
          transaction_type,
          COUNT(*) FILTER (WHERE status = 'completed') as successful,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*) as success_rate
        FROM transactions
        GROUP BY transaction_type
      `);
      
      // Query for error rates by type
      const errorRatesQuery = db.raw(`
        SELECT 
          transaction_type,
          status,
          COUNT(*) as count
        FROM transactions
        WHERE status IN ('failed', 'cancelled')
        GROUP BY transaction_type, status
      `);
      
      // Execute queries
      const [processingTimes, successRates, errorRates] = await Promise.all([
        processingTimesQuery,
        successRatesQuery,
        errorRatesQuery
      ]);
      
      // Format results
      return {
        processing_times: processingTimes,
        success_rates: successRates.rows,
        error_rates: errorRates.rows
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw error;
    }
  }
  
  /**
   * Get real-time system status
   * @returns {Promise<Object>} System status
   */
  async getSystemStatus() {
    try {
      // Time thresholds
      const now = new Date();
      const oneMinuteAgo = new Date(now - 60000);
      const fiveMinutesAgo = new Date(now - 5 * 60000);
      const oneHourAgo = new Date(now - 60 * 60000);
      
      // Query for transaction rates
      const transactionRatesQuery = db.raw(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ?) as last_minute,
          COUNT(*) FILTER (WHERE created_at >= ?) as last_five_minutes,
          COUNT(*) FILTER (WHERE created_at >= ?) as last_hour
        FROM transactions
      `, [oneMinuteAgo, fiveMinutesAgo, oneHourAgo]);
      
      // Query for error rates
      const errorRatesQuery = db.raw(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= ?) as failed_last_hour,
          COUNT(*) FILTER (WHERE created_at >= ?) as total_last_hour
        FROM transactions
      `, [oneHourAgo, oneHourAgo]);
      
      // Query for in-progress transactions
      const inProgressQuery = db('transactions')
        .count('* as count')
        .where('status', 'processing');
      
      // Query for retry queue size
      const retryQueueQuery = db('transaction_retries')
        .count('* as count')
        .where('status', 'pending');
      
      // Execute queries
      const [transactionRates, errorRates, inProgress, retryQueue] = await Promise.all([
        transactionRatesQuery,
        errorRatesQuery,
        inProgressQuery,
        retryQueueQuery
      ]);
      
      // Calculate error rate
      const totalLastHour = parseInt(errorRates.rows[0].total_last_hour);
      const failedLastHour = parseInt(errorRates.rows[0].failed_last_hour);
      const errorRate = totalLastHour > 0 ? failedLastHour / totalLastHour : 0;
      
      // Format results
      return {
        timestamp: now.toISOString(),
        transaction_rates: {
          per_minute: parseInt(transactionRates.rows[0].last_minute),
          per_five_minutes: parseInt(transactionRates.rows[0].last_five_minutes),
          per_hour: parseInt(transactionRates.rows[0].last_hour)
        },
        error_rate: errorRate,
        in_progress_transactions: parseInt(inProgress[0].count),
        retry_queue_size: parseInt(retryQueue[0].count)
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      throw error;
    }
  }
  
  /**
   * Get fraud detection indicators
   * @returns {Promise<Object>} Fraud indicators
   */
  async getFraudIndicators() {
    try {
      // Suspicious activity indicators
      const now = new Date();
      const oneDayAgo = new Date(now - 24 * 60 * 60000);
      
      // Query for high-volume accounts
      const highVolumeQuery = db.raw(`
        SELECT 
          sender_id, 
          SUM(amount) as total_volume,
          COUNT(*) as transaction_count
        FROM transactions
        WHERE created_at >= ?
        GROUP BY sender_id
        HAVING COUNT(*) > 10 AND SUM(amount) > 10000
        ORDER BY total_volume DESC
        LIMIT 20
      `, [oneDayAgo]);
      
      // Query for failed authentication attempts
      const failedAuthQuery = db.raw(`
        SELECT 
          user_id, 
          COUNT(*) as attempts
        FROM authentication_logs
        WHERE created_at >= ? AND success = false
        GROUP BY user_id
        HAVING COUNT(*) > 3
        ORDER BY attempts DESC
        LIMIT 20
      `, [oneDayAgo]);
      
      // Query for unusual transaction patterns
      const unusualPatternQuery = db.raw(`
        SELECT 
          sender_id,
          COUNT(*) as transaction_count,
          COUNT(DISTINCT recipient_id) as unique_recipients
        FROM transactions
        WHERE created_at >= ?
        GROUP BY sender_id
        HAVING COUNT(*) > 5 AND COUNT(DISTINCT recipient_id) > 5
        ORDER BY transaction_count DESC
        LIMIT 20
      `, [oneDayAgo]);
      
      // Execute queries
      // Note: Some queries might fail if tables don't exist, so we handle each one separately
      let highVolume = [], failedAuth = [], unusualPattern = [];
      
      try {
        const highVolumeResult = await highVolumeQuery;
        highVolume = highVolumeResult.rows || [];
      } catch (error) {
        console.error('Error querying high volume accounts:', error);
      }
      
      try {
        const failedAuthResult = await failedAuthQuery;
        failedAuth = failedAuthResult.rows || [];
      } catch (error) {
        console.error('Error querying failed authentication attempts:', error);
      }
      
      try {
        const unusualPatternResult = await unusualPatternQuery;
        unusualPattern = unusualPatternResult.rows || [];
      } catch (error) {
        console.error('Error querying unusual transaction patterns:', error);
      }
      
      // Format results
      return {
        timestamp: now.toISOString(),
        timeframe: '24 hours',
        high_volume_accounts: highVolume,
        failed_authentication: failedAuth,
        unusual_patterns: unusualPattern
      };
    } catch (error) {
      console.error('Error getting fraud indicators:', error);
      throw error;
    }
  }
  
  /**
   * Get business intelligence dashboard data
   * @returns {Promise<Object>} Dashboard data
   */
  async getDashboardData() {
    try {
      // Time ranges
      const now = new Date();
      const yesterday = new Date(now - 24 * 60 * 60000);
      const lastWeekStart = new Date(now - 7 * 24 * 60 * 60000);
      const lastMonthStart = new Date(now - 30 * 24 * 60 * 60000);
      
      // Key metrics for today
      const todayMetricsQuery = db.raw(`
        SELECT
          COUNT(*) as transaction_count,
          SUM(amount) as volume,
          SUM(fee) as fees,
          COUNT(DISTINCT sender_id) as active_users
        FROM transactions
        WHERE created_at >= ? AND status = 'completed'
      `, [yesterday]);
      
      // Transaction volume by currency
      const volumeByCurrencyQuery = db.raw(`
        SELECT
          currency_from,
          SUM(amount) as volume,
          COUNT(*) as transaction_count
        FROM transactions
        WHERE created_at >= ? AND status = 'completed'
        GROUP BY currency_from
        ORDER BY volume DESC
      `, [lastMonthStart]);
      
      // Transaction volume trend (daily for last 30 days)
      const volumeTrendQuery = db.raw(`
        SELECT
          DATE(created_at) as date,
          SUM(amount) as volume,
          COUNT(*) as transaction_count
        FROM transactions
        WHERE created_at >= ? AND status = 'completed'
        GROUP BY date
        ORDER BY date
      `, [lastMonthStart]);
      
      // User growth trend
      const userGrowthQuery = db.raw(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as new_users
        FROM users
        WHERE created_at >= ?
        GROUP BY date
        ORDER BY date
      `, [lastMonthStart]);
      
      // Top corridors
      const topCorridorsQuery = db.raw(`
        SELECT
          currency_from,
          currency_to,
          COUNT(*) as transaction_count,
          SUM(amount) as volume
        FROM transactions
        WHERE created_at >= ? AND status = 'completed'
        GROUP BY currency_from, currency_to
        ORDER BY volume DESC
        LIMIT 10
      `, [lastMonthStart]);
      
      // Execute queries
      const [todayMetrics, volumeByCurrency, volumeTrend, userGrowth, topCorridors] = await Promise.all([
        todayMetricsQuery,
        volumeByCurrencyQuery,
        volumeTrendQuery,
        userGrowthQuery,
        topCorridorsQuery
      ]);
      
      // Format results
      return {
        timestamp: now.toISOString(),
        today_metrics: todayMetrics.rows[0],
        volume_by_currency: volumeByCurrency.rows,
        volume_trend: volumeTrend.rows,
        user_growth: userGrowth.rows,
        top_corridors: topCorridors.rows
      };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      throw error;
    }
  }
  
  /**
   * Get retention query for a specific number of days
   * @private
   */
  _getRetentionQuery(days) {
    const now = new Date();
    const cutoffDate = new Date(now - days * 24 * 60 * 60000);
    
    return db.raw(`
      WITH active_users AS (
        SELECT DISTINCT sender_id
        FROM transactions
        WHERE created_at >= ?
      ),
      total_users AS (
        SELECT COUNT(*) as count
        FROM users
        WHERE created_at < ?
      )
      SELECT 
        (SELECT COUNT(*) FROM active_users) as active_count,
        (SELECT count FROM total_users) as total_count,
        CASE 
          WHEN (SELECT count FROM total_users) > 0
          THEN (SELECT COUNT(*) FROM active_users)::float / (SELECT count FROM total_users)
          ELSE 0
        END as retention_rate
    `, [cutoffDate, cutoffDate]);
  }
  
  /**
   * Calculate growth rate from time series data
   * @private
   */
  _calculateGrowthRate(timeSeries) {
    if (!timeSeries || timeSeries.length < 2) {
      return { daily: 0, weekly: 0, monthly: 0 };
    }
    
    const dataPoints = timeSeries.length;
    const firstValue = parseInt(timeSeries[0].count);
    const lastValue = parseInt(timeSeries[dataPoints - 1].count);
    const totalGrowth = (lastValue - firstValue) / firstValue;
    
    return {
      daily: totalGrowth / dataPoints,
      weekly: (totalGrowth / dataPoints) * 7,
      monthly: (totalGrowth / dataPoints) * 30
    };
  }
  
  /**
   * Get interval configuration based on period
   * @private
   */
  _getIntervalConfig(period, currency = null) {
    let interval, format, cacheKey;
    
    switch (period) {
      case 'hourly':
        interval = 'hour';
        format = 'YYYY-MM-DD HH:00';
        break;
      case 'daily':
        interval = 'day';
        format = 'YYYY-MM-DD';
        cacheKey = currency 
          ? `${this.dailyVolumeCache}:${currency.toLowerCase()}`
          : this.dailyVolumeCache;
        break;
      case 'weekly':
        interval = 'week';
        format = 'YYYY-WW';
        cacheKey = currency 
          ? `${this.weeklyVolumeCache}:${currency.toLowerCase()}`
          : this.weeklyVolumeCache;
        break;
      case 'monthly':
        interval = 'month';
        format = 'YYYY-MM';
        cacheKey = currency 
          ? `${this.monthlyVolumeCache}:${currency.toLowerCase()}`
          : this.monthlyVolumeCache;
        break;
      case 'yearly':
        interval = 'year';
        format = 'YYYY';
        break;
      default:
        interval = 'day';
        format = 'YYYY-MM-DD';
        cacheKey = this.dailyVolumeCache;
    }
    
    return { interval, format, cacheKey };
  }
  
  /**
   * Format volume data
   * @private
   */
  _formatVolumeData(data, period) {
    // Group by currency
    const currencyGroups = {};
    let totalVolume = 0;
    let totalTransactions = 0;
    
    data.forEach(item => {
      const currency = item.currency_from;
      const volume = parseFloat(item.volume);
      const count = parseInt(item.transaction_count);
      
      totalVolume += volume;
      totalTransactions += count;
      
      if (!currencyGroups[currency]) {
        currencyGroups[currency] = [];
      }
      
      currencyGroups[currency].push({
        period: item.time_period,
        volume,
        transaction_count: count
      });
    });
    
    return {
      period,
      volumes: currencyGroups,
      total_volume: totalVolume,
      total_transactions: totalTransactions,
      generated_at: new Date().toISOString()
    };
  }
  
  /**
   * Get cache duration based on period
   * @private
   */
  _getCacheDuration(period) {
    switch (period) {
      case 'hourly':
        return this.shortCacheDuration;
      case 'daily':
        return this.mediumCacheDuration;
      case 'weekly':
      case 'monthly':
      case 'yearly':
        return this.longCacheDuration;
      default:
        return this.mediumCacheDuration;
    }
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

module.exports = analyticsService; 