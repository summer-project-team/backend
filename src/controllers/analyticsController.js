const { AppError } = require('../middleware/errorHandler');
const analyticsService = require('../services/analyticsService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get transaction volume data
 * @route   GET /api/analytics/volume
 * @access  Private/Admin
 */
const getVolumeData = asyncHandler(async (req, res, next) => {
  const { period, currency } = req.query;
  
  try {
    const volumeData = await analyticsService.getVolumeData(period, currency);
    
    res.status(200).json({
      success: true,
      data: volumeData
    });
  } catch (error) {
    return next(new AppError(`Failed to get volume data: ${error.message}`, 500));
  }
});

/**
 * @desc    Get corridor analytics
 * @route   GET /api/analytics/corridor/:fromCurrency/:toCurrency
 * @access  Private/Admin
 */
const getCorridorAnalytics = asyncHandler(async (req, res, next) => {
  const { fromCurrency, toCurrency } = req.params;
  const { period } = req.query;
  
  if (!fromCurrency || !toCurrency) {
    return next(new AppError('Source and target currencies are required', 400));
  }
  
  try {
    const analytics = await analyticsService.getCorridorAnalytics(fromCurrency, toCurrency, period);
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    return next(new AppError(`Failed to get corridor analytics: ${error.message}`, 500));
  }
});

/**
 * @desc    Get user activity statistics
 * @route   GET /api/analytics/user-activity
 * @access  Private/Admin
 */
const getUserActivity = asyncHandler(async (req, res, next) => {
  const { days } = req.query;
  
  try {
    const options = {
      days: days ? parseInt(days) : 30
    };
    
    const activityData = await analyticsService.getUserActivity(options);
    
    res.status(200).json({
      success: true,
      data: activityData
    });
  } catch (error) {
    return next(new AppError(`Failed to get user activity data: ${error.message}`, 500));
  }
});

/**
 * @desc    Get transaction performance metrics
 * @route   GET /api/analytics/performance
 * @access  Private/Admin
 */
const getPerformanceMetrics = asyncHandler(async (req, res, next) => {
  try {
    const metrics = await analyticsService.getPerformanceMetrics();
    
    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    return next(new AppError(`Failed to get performance metrics: ${error.message}`, 500));
  }
});

/**
 * @desc    Get system status
 * @route   GET /api/analytics/system-status
 * @access  Private/Admin
 */
const getSystemStatus = asyncHandler(async (req, res, next) => {
  try {
    const status = await analyticsService.getSystemStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    return next(new AppError(`Failed to get system status: ${error.message}`, 500));
  }
});

/**
 * @desc    Get fraud detection indicators
 * @route   GET /api/analytics/fraud-indicators
 * @access  Private/Admin
 */
const getFraudIndicators = asyncHandler(async (req, res, next) => {
  try {
    const indicators = await analyticsService.getFraudIndicators();
    
    res.status(200).json({
      success: true,
      data: indicators
    });
  } catch (error) {
    return next(new AppError(`Failed to get fraud indicators: ${error.message}`, 500));
  }
});

/**
 * @desc    Get business intelligence dashboard data
 * @route   GET /api/analytics/dashboard
 * @access  Private/Admin
 */
const getDashboardData = asyncHandler(async (req, res, next) => {
  try {
    const dashboardData = await analyticsService.getDashboardData();
    
    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    return next(new AppError(`Failed to get dashboard data: ${error.message}`, 500));
  }
});

/**
 * @desc    Get user spending patterns
 * @route   GET /api/analytics/spending-patterns
 * @access  Private
 */
const getSpendingPatterns = asyncHandler(async (req, res, next) => {
  const { period, currency, days, userId } = req.query;
  
  try {
    const options = {
      period,
      currency,
      days: days ? parseInt(days) : 30,
      userId: userId || req.user?.id // Allow filtering by current user or specified user
    };
    
    const spendingPatterns = await analyticsService.getSpendingPatterns(options);
    
    res.status(200).json({
      success: true,
      data: spendingPatterns
    });
  } catch (error) {
    return next(new AppError(`Failed to get spending patterns: ${error.message}`, 500));
  }
});

/**
 * @desc    Get transaction trends
 * @route   GET /api/analytics/transaction-trends
 * @access  Private
 */
const getTransactionTrends = asyncHandler(async (req, res, next) => {
  const { period, currency, transactionType, days } = req.query;
  
  try {
    const options = {
      period,
      currency,
      transactionType,
      days: days ? parseInt(days) : 30
    };
    
    const trends = await analyticsService.getTransactionTrends(options);
    
    res.status(200).json({
      success: true,
      data: trends
    });
  } catch (error) {
    return next(new AppError(`Failed to get transaction trends: ${error.message}`, 500));
  }
});

/**
 * @desc    Get analytics summary
 * @route   GET /api/analytics/summary
 * @access  Private
 */
const getSummary = asyncHandler(async (req, res, next) => {
  const { period, currency, days } = req.query;
  
  try {
    const options = {
      period,
      currency,
      days: days ? parseInt(days) : 30
    };
    
    const summary = await analyticsService.getSummary(options);
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    return next(new AppError(`Failed to get analytics summary: ${error.message}`, 500));
  }
});

/**
 * @desc    Get monthly comparison analytics
 * @route   GET /api/analytics/monthly-comparison
 * @access  Private
 */
const getMonthlyComparison = asyncHandler(async (req, res, next) => {
  const { months, currency } = req.query;
  
  try {
    const options = {
      months: months ? parseInt(months) : 6,
      currency
    };
    
    const comparison = await analyticsService.getMonthlyComparison(options);
    
    res.status(200).json({
      success: true,
      data: comparison
    });
  } catch (error) {
    return next(new AppError(`Failed to get monthly comparison: ${error.message}`, 500));
  }
});

/**
 * @desc    Get currency distribution analytics
 * @route   GET /api/analytics/currency-distribution
 * @access  Private
 */
const getCurrencyDistribution = asyncHandler(async (req, res, next) => {
  const { period, transactionType, days } = req.query;
  
  try {
    const options = {
      period,
      transactionType,
      days: days ? parseInt(days) : 30
    };
    
    const distribution = await analyticsService.getCurrencyDistribution(options);
    
    res.status(200).json({
      success: true,
      data: distribution
    });
  } catch (error) {
    return next(new AppError(`Failed to get currency distribution: ${error.message}`, 500));
  }
});

/**
 * @desc    Get CBUSD inflow and outflow analytics
 * @route   GET /api/analytics/cbusd-flows
 * @access  Private
 */
const getCBUSDFlows = asyncHandler(async (req, res, next) => {
  const { period, days } = req.query;
  
  try {
    const options = {
      period,
      days: days ? parseInt(days) : 30
    };
    
    const flows = await analyticsService.getCBUSDFlows(options);
    
    res.status(200).json({
      success: true,
      data: flows
    });
  } catch (error) {
    return next(new AppError(`Failed to get CBUSD flows: ${error.message}`, 500));
  }
});

/**
 * @desc    Get CBUSD circulation analytics
 * @route   GET /api/analytics/cbusd-circulation
 * @access  Private
 */
const getCBUSDCirculation = asyncHandler(async (req, res, next) => {
  const { period, days } = req.query;
  
  try {
    const options = {
      period,
      days: days ? parseInt(days) : 30
    };
    
    const circulation = await analyticsService.getCBUSDCirculation(options);
    
    res.status(200).json({
      success: true,
      data: circulation
    });
  } catch (error) {
    return next(new AppError(`Failed to get CBUSD circulation: ${error.message}`, 500));
  }
});

module.exports = {
  getVolumeData,
  getCorridorAnalytics,
  getUserActivity,
  getPerformanceMetrics,
  getSystemStatus,
  getFraudIndicators,
  getDashboardData,
  getSpendingPatterns,
  getTransactionTrends,
  getSummary,
  getMonthlyComparison,
  getCurrencyDistribution,
  getCBUSDFlows,
  getCBUSDCirculation
}; 