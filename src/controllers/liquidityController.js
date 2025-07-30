const { AppError } = require('../middleware/errorHandler');
const liquidityService = require('../services/liquidityService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get liquidity pool status
 * @route   GET /api/liquidity/pools/:currency
 * @access  Private/Admin
 */
const getPoolStatus = asyncHandler(async (req, res, next) => {
  const { currency } = req.params;
  
  try {
    const poolStatus = await liquidityService.getPoolStatus(currency);
    
    res.status(200).json({
      success: true,
      pool: poolStatus
    });
  } catch (error) {
    return next(new AppError(`Failed to get liquidity pool status: ${error.message}`, 500));
  }
});

/**
 * @desc    Get all liquidity pools status
 * @route   GET /api/liquidity/pools
 * @access  Private/Admin
 */
const getAllPools = asyncHandler(async (req, res, next) => {
  try {
    const poolsStatus = await liquidityService.getAllPools();
    
    res.status(200).json({
      success: true,
      ...poolsStatus
    });
  } catch (error) {
    return next(new AppError(`Failed to get liquidity pools: ${error.message}`, 500));
  }
});

/**
 * @desc    Update pool balance
 * @route   POST /api/liquidity/pools/:currency/update
 * @access  Private/Admin
 */
const updatePool = asyncHandler(async (req, res, next) => {
  const { currency } = req.params;
  const { amount, reason } = req.body;
  
  if (!amount) {
    return next(new AppError('Amount is required', 400));
  }
  
  try {
    const updatedPool = await liquidityService.updatePoolBalance(
      currency,
      parseFloat(amount),
      reason || 'Manual update',
      null
    );
    
    res.status(200).json({
      success: true,
      message: `Pool ${currency} updated successfully`,
      pool: updatedPool
    });
  } catch (error) {
    return next(new AppError(`Failed to update liquidity pool: ${error.message}`, 500));
  }
});

/**
 * @desc    Get active liquidity alerts
 * @route   GET /api/liquidity/alerts
 * @access  Private/Admin
 */
const getAlerts = asyncHandler(async (req, res, next) => {
  const { currency, include_resolved } = req.query;
  
  try {
    const alerts = await liquidityService.getAlerts(
      currency,
      include_resolved === 'true'
    );
    
    res.status(200).json({
      success: true,
      ...alerts
    });
  } catch (error) {
    return next(new AppError(`Failed to get liquidity alerts: ${error.message}`, 500));
  }
});

/**
 * @desc    Resolve a liquidity alert
 * @route   POST /api/liquidity/alerts/:id/resolve
 * @access  Private/Admin
 */
const resolveAlert = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { resolution } = req.body;
  
  if (!resolution) {
    return next(new AppError('Resolution message is required', 400));
  }
  
  try {
    const resolvedAlert = await liquidityService.resolveAlert(
      id,
      resolution,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      message: 'Alert resolved successfully',
      alert: resolvedAlert
    });
  } catch (error) {
    return next(new AppError(`Failed to resolve alert: ${error.message}`, 500));
  }
});

/**
 * @desc    Get rebalance recommendations
 * @route   GET /api/liquidity/rebalance/recommendations
 * @access  Private/Admin
 */
const getRebalanceRecommendations = asyncHandler(async (req, res, next) => {
  try {
    const recommendations = await liquidityService.getRebalanceRecommendations();
    
    res.status(200).json({
      success: true,
      ...recommendations
    });
  } catch (error) {
    return next(new AppError(`Failed to get rebalance recommendations: ${error.message}`, 500));
  }
});

/**
 * @desc    Execute a rebalance action
 * @route   POST /api/liquidity/rebalance/execute
 * @access  Private/Admin
 */
const executeRebalance = asyncHandler(async (req, res, next) => {
  const { action } = req.body;
  
  if (!action || !action.action) {
    return next(new AppError('Valid rebalance action is required', 400));
  }
  
  try {
    const result = await liquidityService.executeRebalance(
      action,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      message: 'Rebalance action executed successfully',
      result
    });
  } catch (error) {
    return next(new AppError(`Failed to execute rebalance: ${error.message}`, 500));
  }
});

module.exports = {
  getPoolStatus,
  getAllPools,
  updatePool,
  getAlerts,
  resolveAlert,
  getRebalanceRecommendations,
  executeRebalance
}; 