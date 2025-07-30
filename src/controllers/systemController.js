const { db } = require('../utils/database');
const { redisClient } = require('../utils/redis');
const rateRefreshService = require('../services/rateRefreshService');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get system status
 * @route   GET /api/system/status
 * @access  Public
 */
const getSystemStatus = asyncHandler(async (req, res, next) => {
  try {
    // Check database connection
    const dbStatus = await checkDatabaseStatus();
    
    // Check Redis connection
    const redisStatus = await checkRedisStatus();
    
    // Get rate refresh service status
    const rateRefreshStatus = rateRefreshService.getStatus();
    
    // Get system info
    const systemInfo = {
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    
    res.status(200).json({
      success: true,
      status: {
        system: systemInfo,
        database: dbStatus,
        redis: redisStatus,
        rateRefresh: rateRefreshStatus,
      },
    });
  } catch (error) {
    return next(new AppError('Error getting system status: ' + error.message, 500));
  }
});

/**
 * Check database status
 */
const checkDatabaseStatus = async () => {
  try {
    const startTime = Date.now();
    await db.raw('SELECT 1');
    const responseTime = Date.now() - startTime;
    
    return {
      connected: true,
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
};

/**
 * Check Redis status
 */
const checkRedisStatus = async () => {
  try {
    const startTime = Date.now();
    await redisClient.ping();
    const responseTime = Date.now() - startTime;
    
    return {
      connected: true,
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
};

/**
 * @desc    Trigger manual rate refresh
 * @route   POST /api/system/refresh-rates
 * @access  Private/Admin
 */
const refreshRates = asyncHandler(async (req, res, next) => {
  try {
    await rateRefreshService.refreshRates();
    
    res.status(200).json({
      success: true,
      message: 'Exchange rates refreshed successfully',
    });
  } catch (error) {
    return next(new AppError('Error refreshing rates: ' + error.message, 500));
  }
});

/**
 * @desc    System health check
 * @route   GET /api/system/health
 * @access  Public
 */
const healthCheck = asyncHandler(async (req, res, next) => {
  try {
    // Check database connection
    const dbStatus = await checkDatabaseConnection();
    
    // Check Redis connection
    const redisStatus = await checkRedisConnection();
    
    // Get system info
    const systemInfo = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: process.env.npm_package_version || '1.0.0',
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Calculate overall health status
    const healthy = dbStatus.connected && redisStatus.connected;
    
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus
      },
      system: systemInfo
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @desc    System metrics
 * @route   GET /api/system/metrics
 * @access  Private (Admin)
 */
const getMetrics = asyncHandler(async (req, res, next) => {
  try {
    // Get transaction counts
    const transactionMetrics = await getTransactionMetrics();
    
    // Get user metrics
    const userMetrics = await getUserMetrics();
    
    // Get system resource usage
    const resourceUsage = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    };
    
    // Get rate metrics
    const rateMetrics = await getRateMetrics();
    
    res.status(200).json({
      success: true,
      metrics: {
        transactions: transactionMetrics,
        users: userMetrics,
        resources: resourceUsage,
        rates: rateMetrics
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return next(new AppError('Failed to get metrics: ' + error.message, 500));
  }
});

/**
 * Check database connection
 */
const checkDatabaseConnection = async () => {
  try {
    // Try to run a simple query
    await db.raw('SELECT 1+1 as result');
    
    return {
      connected: true,
      latency: await measureDbLatency(),
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
};

/**
 * Check Redis connection
 */
const checkRedisConnection = async () => {
  try {
    // Try to ping Redis
    const startTime = Date.now();
    await redisClient.ping();
    const latency = Date.now() - startTime;
    
    return {
      connected: true,
      latency: latency
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
};

/**
 * Measure database latency
 */
const measureDbLatency = async () => {
  const startTime = Date.now();
  await db.raw('SELECT 1+1 as result');
  return Date.now() - startTime;
};

/**
 * Get transaction metrics
 */
const getTransactionMetrics = async () => {
  // Get transaction counts by status
  const statusCounts = await db('transactions')
    .select('status')
    .count('id as count')
    .groupBy('status');
  
  // Get transaction counts by type
  const typeCounts = await db('transactions')
    .select('transaction_type')
    .count('id as count')
    .groupBy('transaction_type');
  
  // Get 24-hour volume
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const dailyVolume = await db('transactions')
    .where('status', 'completed')
    .where('created_at', '>=', oneDayAgo)
    .sum('amount as total');
  
  return {
    total: await db('transactions').count('id as count').first(),
    by_status: statusCounts,
    by_type: typeCounts,
    daily_volume: dailyVolume[0].total || 0,
    daily_count: await db('transactions')
      .where('created_at', '>=', oneDayAgo)
      .count('id as count')
      .first()
  };
};

/**
 * Get user metrics
 */
const getUserMetrics = async () => {
  // Get total user count
  const totalUsers = await db('users').count('id as count').first();
  
  // Get new users in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newUsers = await db('users')
    .where('created_at', '>=', oneDayAgo)
    .count('id as count')
    .first();
  
  // Get active users in the last 24 hours
  const activeUsers = await db('transactions')
    .where('created_at', '>=', oneDayAgo)
    .countDistinct('sender_id as count')
    .first();
  
  return {
    total: totalUsers.count,
    new_24h: newUsers.count,
    active_24h: activeUsers.count,
    wallets: await db('wallets').count('id as count').first()
  };
};

/**
 * Get rate metrics
 */
const getRateMetrics = async () => {
  // Get latest exchange rates
  const rates = await db('exchange_rates')
    .select('from_currency', 'to_currency', 'rate')
    .orderBy([
      { column: 'from_currency' },
      { column: 'to_currency' },
      { column: 'created_at', order: 'desc' }
    ])
    .distinctOn('from_currency', 'to_currency');
  
  // Get rate update frequency
  const updateFrequency = await db('exchange_rates')
    .select(db.raw('AVG(created_at - lag(created_at) OVER (ORDER BY created_at)) as avg_interval'))
    .first();
  
  return {
    rates,
    update_frequency: updateFrequency.avg_interval
  };
};

module.exports = {
  getSystemStatus,
  refreshRates,
  healthCheck,
  getMetrics,
}; 