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

module.exports = {
  getVolumeData,
  getCorridorAnalytics,
  getUserActivity,
  getPerformanceMetrics,
  getSystemStatus,
  getFraudIndicators,
  getDashboardData
}; 