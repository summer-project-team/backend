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
   * Get transaction volume summary with inflow/outflow analysis
   * @param {string} period - time period (daily, weekly, monthly, yearly)
   * @param {string} currency - optional currency filter
   * @returns {Promise<Object>} Volume data with flow analysis
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
      
      // Build base query for volume data
      let query = db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(*) as total_transactions'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as successful_transactions'),
          'currency_from'
        );
      
      // Apply currency filter if provided
      if (currency) {
        query = query.where('currency_from', currency.toUpperCase());
      }
      
      // Group and sort
      query = query
        .groupBy('time_period', 'currency_from')
        .orderBy('time_period');
      
      // Build inflow/outflow query
      let flowQuery = db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          'transaction_type',
          'currency_from',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as count')
        )
        .whereIn('transaction_type', ['deposit', 'mint', 'withdrawal', 'burn', 'app_transfer']);
      
      if (currency) {
        flowQuery = flowQuery.where('currency_from', currency.toUpperCase());
      }
      
      flowQuery = flowQuery
        .groupBy('time_period', 'transaction_type', 'currency_from')
        .orderBy('time_period');
      
      // Execute queries
      const [volumeData, flowData] = await Promise.all([query, flowQuery]);
      
      // Process inflow/outflow data
      const processedFlows = this._processInflowOutflow(flowData, period);
      
      // Process volume results
      const result = this._formatVolumeData(volumeData, period);
      
      // Add flow analysis to result
      result.inflow_outflow_analysis = processedFlows;
      
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
        .whereIn('status', ['processing', 'initiated']);
      
      // Query for retry queue size (with error handling)
      let retryQueueSize = 0;
      try {
        const retryQueueQuery = db('transaction_retries')
          .count('* as count')
          .where('status', 'pending');
        const retryQueue = await retryQueueQuery;
        retryQueueSize = parseInt(retryQueue[0].count);
      } catch (error) {
        console.warn('Retry queue table not accessible:', error.message);
      }
      
      // Execute main queries
      const [transactionRates, errorRates, inProgress] = await Promise.all([
        transactionRatesQuery,
        errorRatesQuery,
        inProgressQuery
      ]);
      
      // Calculate error rate
      const totalLastHour = parseInt(errorRates.rows[0].total_last_hour);
      const failedLastHour = parseInt(errorRates.rows[0].failed_last_hour);
      const errorRate = totalLastHour > 0 ? failedLastHour / totalLastHour : 0;
      
      // Calculate system health score
      const tpsLastMinute = parseInt(transactionRates.rows[0].last_minute);
      const healthScore = this._calculateSystemHealth(errorRate, tpsLastMinute, retryQueueSize);
      
      // Format results
      return {
        timestamp: now.toISOString(),
        transaction_rates: {
          per_minute: parseInt(transactionRates.rows[0].last_minute),
          per_five_minutes: parseInt(transactionRates.rows[0].last_five_minutes),
          per_hour: parseInt(transactionRates.rows[0].last_hour)
        },
        error_rate: parseFloat((errorRate * 100).toFixed(2)),
        in_progress_transactions: parseInt(inProgress[0].count),
        retry_queue_size: retryQueueSize,
        overall_health: healthScore
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
   * Get user spending patterns analysis
   * @param {Object} options - Query options (period, user_id, currency)
   * @returns {Promise<Object>} Spending patterns data
   */
  async getSpendingPatterns(options = {}) {
    try {
      const { period = 'monthly', userId, currency, days = 30 } = options;
      const { interval } = this._getIntervalConfig(period);
      
      let query = db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          'transaction_type',
          'currency_from',
          'currency_to',
          db.raw('SUM(amount) as total_amount'),
          db.raw('COUNT(*) as transaction_count'),
          db.raw('AVG(amount) as avg_amount'),
          db.raw('SUM(fee) as total_fees')
        )
        .where('status', 'completed');

      // Apply filters
      if (userId) query = query.where('sender_id', userId);
      if (currency) query = query.where('currency_from', currency.toUpperCase());
      if (days) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        query = query.where('created_at', '>=', startDate);
      }

      const spendingData = await query
        .groupBy('time_period', 'transaction_type', 'currency_from', 'currency_to')
        .orderBy('time_period', 'desc');

      // Get spending by transaction type
      const spendingByType = await db('transactions')
        .select(
          'transaction_type',
          db.raw('SUM(amount) as total_amount'),
          db.raw('COUNT(*) as transaction_count'),
          db.raw('AVG(amount) as avg_amount')
        )
        .where('status', 'completed')
        .modify((queryBuilder) => {
          if (userId) queryBuilder.where('sender_id', userId);
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
          if (days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            queryBuilder.where('created_at', '>=', startDate);
          }
        })
        .groupBy('transaction_type');

      // Get spending by currency
      const spendingByCurrency = await db('transactions')
        .select(
          'currency_from',
          db.raw('SUM(amount) as total_amount'),
          db.raw('COUNT(*) as transaction_count'),
          db.raw('AVG(amount) as avg_amount')
        )
        .where('status', 'completed')
        .modify((queryBuilder) => {
          if (userId) queryBuilder.where('sender_id', userId);
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
          if (days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            queryBuilder.where('created_at', '>=', startDate);
          }
        })
        .groupBy('currency_from');

      // Get top spending hours/days
      const spendingByHour = await db('transactions')
        .select(
          db.raw('EXTRACT(HOUR FROM created_at) as hour'),
          db.raw('SUM(amount) as total_amount'),
          db.raw('COUNT(*) as transaction_count')
        )
        .where('status', 'completed')
        .modify((queryBuilder) => {
          if (userId) queryBuilder.where('sender_id', userId);
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
          if (days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            queryBuilder.where('created_at', '>=', startDate);
          }
        })
        .groupBy('hour')
        .orderBy('hour');

      return {
        period,
        filters: { userId, currency, days },
        spending_timeline: spendingData,
        spending_by_type: spendingByType,
        spending_by_currency: spendingByCurrency,
        spending_by_hour: spendingByHour,
        total_transactions: spendingData.reduce((sum, item) => sum + parseInt(item.transaction_count), 0),
        total_amount: spendingData.reduce((sum, item) => sum + parseFloat(item.total_amount), 0),
        total_fees: spendingData.reduce((sum, item) => sum + parseFloat(item.total_fees || 0), 0)
      };
    } catch (error) {
      console.error('Error getting spending patterns:', error);
      throw error;
    }
  }

  /**
   * Get transaction trends analysis
   * @param {Object} options - Query options (period, currency, transaction_type)
   * @returns {Promise<Object>} Transaction trends data
   */
  async getTransactionTrends(options = {}) {
    try {
      const { period = 'daily', currency, transactionType, days = 30 } = options;
      const { interval } = this._getIntervalConfig(period);
      
      // Base trend query
      let trendQuery = db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          db.raw('COUNT(*) as total_transactions'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as successful_transactions'),
          db.raw('COUNT(CASE WHEN status = \'failed\' THEN 1 END) as failed_transactions'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_volume'),
          db.raw('AVG(CASE WHEN status = \'completed\' THEN amount END) as avg_transaction_amount'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as total_fees')
        );

      // Apply filters
      if (currency) trendQuery = trendQuery.where('currency_from', currency.toUpperCase());
      if (transactionType) trendQuery = trendQuery.where('transaction_type', transactionType);
      if (days) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        trendQuery = trendQuery.where('created_at', '>=', startDate);
      }

      const trends = await trendQuery
        .groupBy('time_period')
        .orderBy('time_period');

      // Calculate growth rates
      const trendsWithGrowth = trends.map((current, index) => {
        if (index === 0) {
          return { ...current, growth_rate: 0 };
        }
        
        const previous = trends[index - 1];
        const growthRate = previous.total_transactions > 0 
          ? ((current.total_transactions - previous.total_transactions) / previous.total_transactions) * 100
          : 0;
        
        return { ...current, growth_rate: parseFloat(growthRate.toFixed(2)) };
      });

      // Get currency distribution in trends
      const currencyTrends = await db('transactions')
        .select(
          'currency_from',
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          db.raw('COUNT(*) as transaction_count'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume')
        )
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
          if (transactionType) queryBuilder.where('transaction_type', transactionType);
          if (days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            queryBuilder.where('created_at', '>=', startDate);
          }
        })
        .groupBy('currency_from', 'time_period')
        .orderBy('time_period');

      // Get transaction type trends
      const typeTrends = await db('transactions')
        .select(
          'transaction_type',
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          db.raw('COUNT(*) as transaction_count'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume')
        )
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
          if (transactionType) queryBuilder.where('transaction_type', transactionType);
          if (days) {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            queryBuilder.where('created_at', '>=', startDate);
          }
        })
        .groupBy('transaction_type', 'time_period')
        .orderBy('time_period');

      return {
        period,
        filters: { currency, transactionType, days },
        overall_trends: trendsWithGrowth,
        currency_trends: currencyTrends,
        transaction_type_trends: typeTrends,
        summary: {
          total_transactions: trendsWithGrowth.reduce((sum, item) => sum + parseInt(item.total_transactions), 0),
          total_volume: trendsWithGrowth.reduce((sum, item) => sum + parseFloat(item.total_volume || 0), 0),
          total_fees: trendsWithGrowth.reduce((sum, item) => sum + parseFloat(item.total_fees || 0), 0),
          average_success_rate: trendsWithGrowth.length > 0 
            ? trendsWithGrowth.reduce((sum, item) => sum + (item.successful_transactions / item.total_transactions), 0) / trendsWithGrowth.length 
            : 0
        }
      };
    } catch (error) {
      console.error('Error getting transaction trends:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive analytics summary
   * @param {Object} options - Query options (period, currency)
   * @returns {Promise<Object>} Analytics summary
   */
  async getSummary(options = {}) {
    try {
      const { period = 'daily', currency, days = 30 } = options;
      
      // Get current period data
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(currentPeriodStart.getDate() - days);
      
      // Get previous period data for comparison
      const previousPeriodStart = new Date();
      previousPeriodStart.setDate(previousPeriodStart.getDate() - (days * 2));
      const previousPeriodEnd = new Date();
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - days);

      // Current period metrics
      const currentMetricsQuery = db('transactions')
        .select(
          db.raw('COUNT(*) as total_transactions'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as successful_transactions'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_volume'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as total_fees'),
          db.raw('AVG(CASE WHEN status = \'completed\' THEN amount END) as avg_transaction_amount'),
          db.raw('COUNT(DISTINCT sender_id) as unique_users')
        )
        .where('created_at', '>=', currentPeriodStart)
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
        });

      // Previous period metrics  
      const previousMetricsQuery = db('transactions')
        .select(
          db.raw('COUNT(*) as total_transactions'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as successful_transactions'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_volume'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as total_fees'),
          db.raw('AVG(CASE WHEN status = \'completed\' THEN amount END) as avg_transaction_amount'),
          db.raw('COUNT(DISTINCT sender_id) as unique_users')
        )
        .whereBetween('created_at', [previousPeriodStart, previousPeriodEnd])
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
        });

      // Execute queries
      const [currentMetrics, previousMetrics] = await Promise.all([
        currentMetricsQuery,
        previousMetricsQuery
      ]);

      const current = currentMetrics[0];
      const previous = previousMetrics[0];

      // Calculate percentage changes
      const calculateChange = (current, previous) => {
        if (!previous || previous === 0) return 0;
        return ((current - previous) / previous) * 100;
      };

      // Get inflow/outflow analysis
      const inflowOutflowQuery = db('transactions')
        .select(
          'transaction_type',
          'currency_from',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as count')
        )
        .where('created_at', '>=', currentPeriodStart)
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
        })
        .groupBy('transaction_type', 'currency_from');

      const inflowOutflow = await inflowOutflowQuery;

      // Categorize inflow vs outflow
      const inflow = inflowOutflow.filter(item => 
        ['deposit', 'mint'].includes(item.transaction_type)
      );
      const outflow = inflowOutflow.filter(item => 
        ['withdrawal', 'burn', 'app_transfer'].includes(item.transaction_type)
      );

      return {
        period: `${days} days`,
        currency: currency || 'all',
        current_period: {
          start_date: currentPeriodStart.toISOString(),
          end_date: new Date().toISOString(),
          metrics: {
            total_transactions: parseInt(current.total_transactions),
            successful_transactions: parseInt(current.successful_transactions),
            success_rate: current.total_transactions > 0 ? (current.successful_transactions / current.total_transactions) * 100 : 0,
            total_volume: parseFloat(current.total_volume || 0),
            total_fees: parseFloat(current.total_fees || 0),
            avg_transaction_amount: parseFloat(current.avg_transaction_amount || 0),
            unique_users: parseInt(current.unique_users)
          }
        },
        previous_period: {
          start_date: previousPeriodStart.toISOString(),
          end_date: previousPeriodEnd.toISOString(),
          metrics: {
            total_transactions: parseInt(previous.total_transactions),
            successful_transactions: parseInt(previous.successful_transactions),
            success_rate: previous.total_transactions > 0 ? (previous.successful_transactions / previous.total_transactions) * 100 : 0,
            total_volume: parseFloat(previous.total_volume || 0),
            total_fees: parseFloat(previous.total_fees || 0),
            avg_transaction_amount: parseFloat(previous.avg_transaction_amount || 0),
            unique_users: parseInt(previous.unique_users)
          }
        },
        period_over_period_change: {
          transactions: calculateChange(current.total_transactions, previous.total_transactions),
          volume: calculateChange(current.total_volume, previous.total_volume),
          fees: calculateChange(current.total_fees, previous.total_fees),
          users: calculateChange(current.unique_users, previous.unique_users)
        },
        inflow_outflow: {
          inflow: {
            total_volume: inflow.reduce((sum, item) => sum + parseFloat(item.volume), 0),
            total_count: inflow.reduce((sum, item) => sum + parseInt(item.count), 0),
            by_currency: inflow
          },
          outflow: {
            total_volume: outflow.reduce((sum, item) => sum + parseFloat(item.volume), 0),
            total_count: outflow.reduce((sum, item) => sum + parseInt(item.count), 0),
            by_currency: outflow
          },
          net_flow: inflow.reduce((sum, item) => sum + parseFloat(item.volume), 0) - 
                    outflow.reduce((sum, item) => sum + parseFloat(item.volume), 0)
        }
      };
    } catch (error) {
      console.error('Error getting analytics summary:', error);
      throw error;
    }
  }

  /**
   * Get monthly comparison analytics
   * @param {Object} options - Query options (months, currency)
   * @returns {Promise<Object>} Monthly comparison data
   */
  async getMonthlyComparison(options = {}) {
    try {
      const { months = 6, currency } = options;
      
      // Get data for the specified number of months
      const monthsData = await db('transactions')
        .select(
          db.raw('DATE_TRUNC(\'month\', created_at) as month'),
          db.raw('COUNT(*) as total_transactions'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as successful_transactions'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_volume'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as total_fees'),
          db.raw('COUNT(DISTINCT sender_id) as unique_users'),
          db.raw('AVG(CASE WHEN status = \'completed\' THEN amount END) as avg_transaction_amount')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${months} months'`))
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
        })
        .groupBy('month')
        .orderBy('month');

      // Calculate month-over-month growth
      const monthlyDataWithGrowth = monthsData.map((current, index) => {
        if (index === 0) {
          return { 
            ...current, 
            transaction_growth: 0,
            volume_growth: 0,
            user_growth: 0,
            fee_growth: 0
          };
        }
        
        const previous = monthsData[index - 1];
        
        return {
          ...current,
          transaction_growth: previous.total_transactions > 0 
            ? ((current.total_transactions - previous.total_transactions) / previous.total_transactions) * 100
            : 0,
          volume_growth: previous.total_volume > 0 
            ? ((current.total_volume - previous.total_volume) / previous.total_volume) * 100
            : 0,
          user_growth: previous.unique_users > 0 
            ? ((current.unique_users - previous.unique_users) / previous.unique_users) * 100
            : 0,
          fee_growth: previous.total_fees > 0 
            ? ((current.total_fees - previous.total_fees) / previous.total_fees) * 100
            : 0
        };
      });

      // Get currency breakdown by month
      const currencyBreakdown = await db('transactions')
        .select(
          db.raw('DATE_TRUNC(\'month\', created_at) as month'),
          'currency_from',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as count')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${months} months'`))
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
        })
        .groupBy('month', 'currency_from')
        .orderBy('month');

      // Get transaction type breakdown by month
      const typeBreakdown = await db('transactions')
        .select(
          db.raw('DATE_TRUNC(\'month\', created_at) as month'),
          'transaction_type',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as count')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${months} months'`))
        .modify((queryBuilder) => {
          if (currency) queryBuilder.where('currency_from', currency.toUpperCase());
        })
        .groupBy('month', 'transaction_type')
        .orderBy('month');

      return {
        period: `${months} months`,
        currency: currency || 'all',
        monthly_data: monthlyDataWithGrowth,
        currency_breakdown: currencyBreakdown,
        transaction_type_breakdown: typeBreakdown,
        summary: {
          total_months: monthsData.length,
          avg_monthly_transactions: monthsData.length > 0 
            ? monthsData.reduce((sum, item) => sum + parseInt(item.total_transactions), 0) / monthsData.length
            : 0,
          avg_monthly_volume: monthsData.length > 0 
            ? monthsData.reduce((sum, item) => sum + parseFloat(item.total_volume), 0) / monthsData.length
            : 0,
          total_volume: monthsData.reduce((sum, item) => sum + parseFloat(item.total_volume), 0),
          total_fees: monthsData.reduce((sum, item) => sum + parseFloat(item.total_fees), 0)
        }
      };
    } catch (error) {
      console.error('Error getting monthly comparison:', error);
      throw error;
    }
  }

  /**
   * Get currency distribution analytics
   * @param {Object} options - Query options (period, transaction_type)
   * @returns {Promise<Object>} Currency distribution data
   */
  async getCurrencyDistribution(options = {}) {
    try {
      const { period = 'monthly', transactionType, days = 30 } = options;
      const { interval } = this._getIntervalConfig(period);
      
      // Get overall currency distribution
      const currencyDistribution = await db('transactions')
        .select(
          'currency_from',
          'currency_to',
          db.raw('COUNT(*) as transaction_count'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_volume'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as total_fees'),
          db.raw('AVG(CASE WHEN status = \'completed\' THEN amount END) as avg_amount'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as successful_count'),
          db.raw('COUNT(CASE WHEN status = \'failed\' THEN 1 END) as failed_count')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
        .modify((queryBuilder) => {
          if (transactionType) queryBuilder.where('transaction_type', transactionType);
        })
        .groupBy('currency_from', 'currency_to')
        .orderBy('total_volume', 'desc');

      // Get currency distribution over time
      const distributionOverTime = await db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          'currency_from',
          db.raw('COUNT(*) as transaction_count'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
        .modify((queryBuilder) => {
          if (transactionType) queryBuilder.where('transaction_type', transactionType);
        })
        .groupBy('time_period', 'currency_from')
        .orderBy('time_period');

      // Get inflow/outflow by currency
      const currencyFlows = await db('transactions')
        .select(
          'currency_from',
          'transaction_type',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as count')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
        .modify((queryBuilder) => {
          if (transactionType) queryBuilder.where('transaction_type', transactionType);
        })
        .groupBy('currency_from', 'transaction_type');

      // Process flows into inflow/outflow
      const flowsByCurrency = {};
      currencyFlows.forEach(flow => {
        if (!flowsByCurrency[flow.currency_from]) {
          flowsByCurrency[flow.currency_from] = {
            currency: flow.currency_from,
            inflow: { volume: 0, count: 0 },
            outflow: { volume: 0, count: 0 }
          };
        }
        
        if (['deposit', 'mint'].includes(flow.transaction_type)) {
          flowsByCurrency[flow.currency_from].inflow.volume += parseFloat(flow.volume);
          flowsByCurrency[flow.currency_from].inflow.count += parseInt(flow.count);
        } else if (['withdrawal', 'burn', 'app_transfer'].includes(flow.transaction_type)) {
          flowsByCurrency[flow.currency_from].outflow.volume += parseFloat(flow.volume);
          flowsByCurrency[flow.currency_from].outflow.count += parseInt(flow.count);
        }
      });

      // Get currency market share
      const totalVolume = currencyDistribution.reduce((sum, item) => sum + parseFloat(item.total_volume), 0);
      const currencyMarketShare = currencyDistribution.map(currency => ({
        ...currency,
        market_share: totalVolume > 0 ? (parseFloat(currency.total_volume) / totalVolume) * 100 : 0,
        success_rate: currency.transaction_count > 0 
          ? (currency.successful_count / currency.transaction_count) * 100 
          : 0
      }));

      // Get most popular corridors
      const popularCorridors = currencyDistribution
        .filter(item => item.currency_from !== item.currency_to)
        .sort((a, b) => parseFloat(b.total_volume) - parseFloat(a.total_volume))
        .slice(0, 10);

      return {
        period,
        filters: { transactionType, days },
        currency_distribution: currencyMarketShare,
        distribution_over_time: distributionOverTime,
        currency_flows: Object.values(flowsByCurrency),
        popular_corridors: popularCorridors,
        summary: {
          total_currencies: currencyDistribution.length,
          total_volume: totalVolume,
          total_transactions: currencyDistribution.reduce((sum, item) => sum + parseInt(item.transaction_count), 0),
          dominant_currency: currencyMarketShare.length > 0 ? currencyMarketShare[0] : null,
          most_active_corridor: popularCorridors.length > 0 ? popularCorridors[0] : null
        }
      };
    } catch (error) {
      console.error('Error getting currency distribution:', error);
      throw error;
    }
  }
  
  /**
   * Get CBUSD inflow and outflow analytics
   * @param {Object} options - Query options (period, days)
   * @returns {Promise<Object>} CBUSD flow data
   */
  async getCBUSDFlows(options = {}) {
    try {
      const { period = 'daily', days = 30 } = options;
      const { interval } = this._getIntervalConfig(period);
      
      // Get CBUSD flows over time
      const flowsOverTime = await db('transactions')
        .select(
          db.raw(`DATE_TRUNC('${interval}', created_at) as time_period`),
          'transaction_type',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as count'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as fees')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
        .where(function() {
          this.where('currency_from', 'CBUSD').orWhere('currency_to', 'CBUSD');
        })
        .groupBy('time_period', 'transaction_type')
        .orderBy('time_period');

      // Get current circulation metrics
      const circulationMetrics = await db('wallets')
        .select(
          db.raw('SUM(cbusd_balance) as total_circulation'),
          db.raw('COUNT(CASE WHEN cbusd_balance > 0 THEN 1 END) as holders_count'),
          db.raw('AVG(cbusd_balance) as avg_balance'),
          db.raw('MAX(cbusd_balance) as max_balance')
        );

      // Get mint/burn summary
      const mintBurnSummary = await db('transactions')
        .select(
          'transaction_type',
          'currency_from',
          'currency_to',
          db.raw('SUM(CASE WHEN status = \'completed\' THEN amount ELSE 0 END) as total_volume'),
          db.raw('COUNT(CASE WHEN status = \'completed\' THEN 1 END) as transaction_count'),
          db.raw('SUM(CASE WHEN status = \'completed\' THEN fee ELSE 0 END) as total_fees')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
        .where(function() {
          this.where('currency_from', 'CBUSD').orWhere('currency_to', 'CBUSD');
        })
        .where('status', 'completed')
        .groupBy('transaction_type', 'currency_from', 'currency_to');

      // Get backing currency breakdown
      const backingBreakdown = await db('transactions')
        .select(
          'currency_from',
          db.raw('SUM(CASE WHEN status = \'completed\' AND currency_to = \'CBUSD\' THEN amount ELSE 0 END) as minted_from'),
          db.raw('COUNT(CASE WHEN status = \'completed\' AND currency_to = \'CBUSD\' THEN 1 END) as mint_count')
        )
        .where('created_at', '>=', db.raw(`CURRENT_DATE - INTERVAL '${days} days'`))
        .where('currency_to', 'CBUSD')
        .whereNot('currency_from', 'CBUSD')
        .groupBy('currency_from')
        .orderBy('minted_from', 'desc');

      // Process flows into inflow/outflow
      const processedFlows = {};
      let totalInflow = 0;
      let totalOutflow = 0;
      let totalInflowCount = 0;
      let totalOutflowCount = 0;

      flowsOverTime.forEach(flow => {
        const period = flow.time_period;
        if (!processedFlows[period]) {
          processedFlows[period] = {
            time_period: period,
            inflow: { volume: 0, count: 0, fees: 0 },
            outflow: { volume: 0, count: 0, fees: 0 },
            net_flow: 0
          };
        }

        // Categorize inflow vs outflow for CBUSD
        const isInflow = this._isCBUSDInflow(flow.transaction_type);
        const volume = parseFloat(flow.volume);
        const count = parseInt(flow.count);
        const fees = parseFloat(flow.fees || 0);

        if (isInflow) {
          processedFlows[period].inflow.volume += volume;
          processedFlows[period].inflow.count += count;
          processedFlows[period].inflow.fees += fees;
          totalInflow += volume;
          totalInflowCount += count;
        } else {
          processedFlows[period].outflow.volume += volume;
          processedFlows[period].outflow.count += count;
          processedFlows[period].outflow.fees += fees;
          totalOutflow += volume;
          totalOutflowCount += count;
        }

        processedFlows[period].net_flow = 
          processedFlows[period].inflow.volume - processedFlows[period].outflow.volume;
      });

      // Get velocity metrics (how fast CBUSD circulates)
      const velocityMetrics = await this._calculateCBUSDVelocity(days);

      // Get reserve ratios and backing
      const reserveMetrics = await this._calculateReserveMetrics();

      return {
        period,
        days,
        summary: {
          total_inflow: totalInflow,
          total_outflow: totalOutflow,
          net_flow: totalInflow - totalOutflow,
          inflow_count: totalInflowCount,
          outflow_count: totalOutflowCount,
          total_transactions: totalInflowCount + totalOutflowCount
        },
        circulation: {
          total_supply: parseFloat(circulationMetrics[0]?.total_circulation || 0),
          holders_count: parseInt(circulationMetrics[0]?.holders_count || 0),
          avg_balance: parseFloat(circulationMetrics[0]?.avg_balance || 0),
          max_balance: parseFloat(circulationMetrics[0]?.max_balance || 0)
        },
        flows_over_time: Object.values(processedFlows).sort((a, b) => new Date(a.time_period) - new Date(b.time_period)),
        mint_burn_breakdown: mintBurnSummary,
        backing_currencies: backingBreakdown,
        velocity_metrics: velocityMetrics,
        reserve_metrics: reserveMetrics,
        health_indicators: {
          circulation_growth_rate: this._calculateCirculationGrowth(Object.values(processedFlows)),
          velocity: velocityMetrics.velocity,
          reserve_ratio: reserveMetrics.reserve_ratio,
          backing_diversity: backingBreakdown.length,
          flow_stability: this._calculateFlowStability(Object.values(processedFlows))
        }
      };
    } catch (error) {
      console.error('Error getting CBUSD flows:', error);
      throw error;
    }
  }

  /**
   * Get CBUSD circulation analytics
   * @param {Object} options - Query options (period, days)
   * @returns {Promise<Object>} CBUSD circulation data
   */
  async getCBUSDCirculation(options = {}) {
    try {
      const { period = 'daily', days = 30 } = options;
      const { interval } = this._getIntervalConfig(period);

      // Get circulation over time
      const circulationHistory = await db.raw(`
        WITH daily_balances AS (
          SELECT 
            DATE_TRUNC('${interval}', t.created_at) as time_period,
            SUM(CASE 
              WHEN t.currency_to = 'CBUSD' AND t.status = 'completed' THEN t.amount
              WHEN t.currency_from = 'CBUSD' AND t.status = 'completed' THEN -t.amount
              ELSE 0
            END) as net_change
          FROM transactions t
          WHERE t.created_at >= CURRENT_DATE - INTERVAL '${days} days'
            AND (t.currency_from = 'CBUSD' OR t.currency_to = 'CBUSD')
          GROUP BY time_period
          ORDER BY time_period
        ),
        running_circulation AS (
          SELECT 
            time_period,
            net_change,
            SUM(net_change) OVER (ORDER BY time_period) as circulation_change
          FROM daily_balances
        )
        SELECT * FROM running_circulation
      `);

      // Get holder analytics
      const holderAnalytics = await db('wallets')
        .select(
          db.raw('COUNT(CASE WHEN cbusd_balance > 0 THEN 1 END) as active_holders'),
          db.raw('COUNT(CASE WHEN cbusd_balance >= 100 THEN 1 END) as holders_100_plus'),
          db.raw('COUNT(CASE WHEN cbusd_balance >= 1000 THEN 1 END) as holders_1000_plus'),
          db.raw('COUNT(CASE WHEN cbusd_balance >= 10000 THEN 1 END) as holders_10000_plus'),
          db.raw('SUM(cbusd_balance) as total_supply'),
          db.raw('AVG(cbusd_balance) as avg_balance'),
          db.raw('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cbusd_balance) as median_balance')
        );

      // Get geographical distribution (based on user locations)
      const geographicalDist = await db('wallets')
        .select(
          'u.country_code',
          db.raw('COUNT(*) as holder_count'),
          db.raw('SUM(w.cbusd_balance) as total_balance'),
          db.raw('AVG(w.cbusd_balance) as avg_balance')
        )
        .join('users as u', 'w.user_id', 'u.id')
        .where('w.cbusd_balance', '>', 0)
        .groupBy('u.country_code')
        .orderBy('total_balance', 'desc');

      return {
        period,
        days,
        current_metrics: holderAnalytics[0],
        circulation_history: circulationHistory.rows,
        holder_distribution: {
          total_holders: parseInt(holderAnalytics[0]?.active_holders || 0),
          by_balance_tier: {
            '100_plus': parseInt(holderAnalytics[0]?.holders_100_plus || 0),
            '1000_plus': parseInt(holderAnalytics[0]?.holders_1000_plus || 0),
            '10000_plus': parseInt(holderAnalytics[0]?.holders_10000_plus || 0)
          }
        },
        geographical_distribution: geographicalDist,
        concentration_metrics: {
          total_supply: parseFloat(holderAnalytics[0]?.total_supply || 0),
          avg_balance: parseFloat(holderAnalytics[0]?.avg_balance || 0),
          median_balance: parseFloat(holderAnalytics[0]?.median_balance || 0),
          gini_coefficient: await this._calculateGiniCoefficient()
        }
      };
    } catch (error) {
      console.error('Error getting CBUSD circulation:', error);
      throw error;
    }
  }

  /**
   * Check if transaction type represents CBUSD inflow
   * @private
   */
  _isCBUSDInflow(transactionType) {
    // Inflow: New CBUSD entering circulation
    return ['mint', 'deposit'].includes(transactionType);
  }

  /**
   * Calculate CBUSD velocity metrics
   * @private
   */
  async _calculateCBUSDVelocity(days) {
    try {
      const velocityQuery = await db.raw(`
        WITH transfer_volume AS (
          SELECT SUM(amount) as total_transfers
          FROM transactions 
          WHERE currency_from = 'CBUSD' 
            AND transaction_type = 'app_transfer'
            AND status = 'completed'
            AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
        ),
        avg_supply AS (
          SELECT AVG(cbusd_balance) as avg_circulation
          FROM wallets
          WHERE cbusd_balance > 0
        )
        SELECT 
          CASE 
            WHEN avg_circulation > 0 THEN total_transfers / avg_circulation 
            ELSE 0 
          END as velocity
        FROM transfer_volume, avg_supply
      `);

      return {
        velocity: parseFloat(velocityQuery.rows[0]?.velocity || 0),
        period_days: days
      };
    } catch (error) {
      console.error('Error calculating CBUSD velocity:', error);
      return { velocity: 0, period_days: days };
    }
  }

  /**
   * Calculate reserve metrics
   * @private
   */
  async _calculateReserveMetrics() {
    try {
      // This would connect to your reserve management system
      // For now, we'll calculate based on backing transactions
      const backingQuery = await db('transactions')
        .select(
          'currency_from',
          db.raw('SUM(CASE WHEN status = \'completed\' AND currency_to = \'CBUSD\' THEN amount ELSE 0 END) as backing_amount')
        )
        .where('currency_to', 'CBUSD')
        .whereNot('currency_from', 'CBUSD')
        .groupBy('currency_from');

      const totalBacking = backingQuery.reduce((sum, item) => sum + parseFloat(item.backing_amount), 0);
      const totalSupply = await db('wallets').sum('cbusd_balance as total');
      const supply = parseFloat(totalSupply[0]?.total || 0);

      return {
        total_backing_value: totalBacking, // This should be in USD equivalent
        total_supply: supply,
        reserve_ratio: supply > 0 ? (totalBacking / supply) * 100 : 0,
        backing_currencies: backingQuery
      };
    } catch (error) {
      console.error('Error calculating reserve metrics:', error);
      return { total_backing_value: 0, total_supply: 0, reserve_ratio: 0, backing_currencies: [] };
    }
  }

  /**
   * Calculate circulation growth rate
   * @private
   */
  _calculateCirculationGrowth(flows) {
    if (flows.length < 2) return 0;
    
    const recent = flows[flows.length - 1];
    const previous = flows[flows.length - 2];
    
    if (previous.net_flow === 0) return 0;
    return ((recent.net_flow - previous.net_flow) / Math.abs(previous.net_flow)) * 100;
  }

  /**
   * Calculate flow stability (standard deviation of net flows)
   * @private
   */
  _calculateFlowStability(flows) {
    if (flows.length < 2) return 0;
    
    const netFlows = flows.map(f => f.net_flow);
    const mean = netFlows.reduce((sum, val) => sum + val, 0) / netFlows.length;
    const variance = netFlows.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / netFlows.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate Gini coefficient for CBUSD distribution
   * @private
   */
  async _calculateGiniCoefficient() {
    try {
      // Simplified Gini calculation - in production you'd want a more sophisticated approach
      const balances = await db('wallets')
        .select('cbusd_balance')
        .where('cbusd_balance', '>', 0)
        .orderBy('cbusd_balance');

      if (balances.length < 2) return 0;

      const n = balances.length;
      const sortedBalances = balances.map(w => parseFloat(w.cbusd_balance));
      const totalWealth = sortedBalances.reduce((sum, val) => sum + val, 0);

      if (totalWealth === 0) return 0;

      let numerator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (2 * (i + 1) - n - 1) * sortedBalances[i];
      }

      return numerator / (n * totalWealth);
    } catch (error) {
      console.error('Error calculating Gini coefficient:', error);
      return 0;
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
    let totalSuccessful = 0;
    
    data.forEach(item => {
      const currency = item.currency_from;
      const volume = parseFloat(item.volume || 0);
      const count = parseInt(item.total_transactions || 0);
      const successful = parseInt(item.successful_transactions || 0);
      
      totalVolume += volume;
      totalTransactions += count;
      totalSuccessful += successful;
      
      if (!currencyGroups[currency]) {
        currencyGroups[currency] = [];
      }
      
      currencyGroups[currency].push({
        period: item.time_period,
        volume,
        total_transactions: count,
        successful_transactions: successful,
        success_rate: count > 0 ? (successful / count) * 100 : 0
      });
    });
    
    return {
      period,
      volumes: currencyGroups,
      total_volume: totalVolume,
      total_transactions: totalTransactions,
      total_successful: totalSuccessful,
      overall_success_rate: totalTransactions > 0 ? (totalSuccessful / totalTransactions) * 100 : 0,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Process inflow/outflow data
   * @private
   */
  _processInflowOutflow(flowData, period) {
    const timeGroups = {};
    
    flowData.forEach(item => {
      const timePeriod = item.time_period;
      const currency = item.currency_from;
      const transactionType = item.transaction_type;
      const volume = parseFloat(item.volume || 0);
      const count = parseInt(item.count || 0);
      
      if (!timeGroups[timePeriod]) {
        timeGroups[timePeriod] = {};
      }
      
      if (!timeGroups[timePeriod][currency]) {
        timeGroups[timePeriod][currency] = {
          currency,
          inflow: { volume: 0, count: 0 },
          outflow: { volume: 0, count: 0 }
        };
      }
      
      // Categorize as inflow or outflow
      if (['deposit', 'mint'].includes(transactionType)) {
        timeGroups[timePeriod][currency].inflow.volume += volume;
        timeGroups[timePeriod][currency].inflow.count += count;
      } else if (['withdrawal', 'burn', 'app_transfer'].includes(transactionType)) {
        timeGroups[timePeriod][currency].outflow.volume += volume;
        timeGroups[timePeriod][currency].outflow.count += count;
      }
    });
    
    // Convert to array format and calculate net flows
    const processedData = Object.keys(timeGroups).map(timePeriod => {
      const currencies = Object.values(timeGroups[timePeriod]).map(currencyData => ({
        ...currencyData,
        net_flow: currencyData.inflow.volume - currencyData.outflow.volume,
        net_count: currencyData.inflow.count - currencyData.outflow.count
      }));
      
      return {
        time_period: timePeriod,
        currencies
      };
    });
    
    return processedData.sort((a, b) => new Date(a.time_period) - new Date(b.time_period));
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

  /**
   * Calculate system health score
   * @private
   */
  _calculateSystemHealth(errorRate, tpsLastMinute, retryQueueSize) {
    let score = 100;
    
    // Deduct points for high error rate
    if (errorRate > 0.1) score -= 30; // 10%+ error rate
    else if (errorRate > 0.05) score -= 15; // 5-10% error rate
    else if (errorRate > 0.01) score -= 5; // 1-5% error rate
    
    // Deduct points for low transaction throughput (assuming normal is 5+ TPS)
    if (tpsLastMinute < 1) score -= 20;
    else if (tpsLastMinute < 3) score -= 10;
    
    // Deduct points for large retry queue
    if (retryQueueSize > 100) score -= 20;
    else if (retryQueueSize > 50) score -= 10;
    else if (retryQueueSize > 20) score -= 5;
    
    return Math.max(0, Math.min(100, score));
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

module.exports = analyticsService; 