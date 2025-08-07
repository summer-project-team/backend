/**
 * ML Controller
 * Provides endpoints for ML-based predictive features
 */
const { AppError } = require('../middleware/errorHandler');
const intelligenceService = require('../services/intelligenceService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get liquidity forecast for a specific corridor
 * @route   GET /api/ml/liquidity-forecast/:fromCurrency/:toCurrency
 * @access  Private/Admin
 */
const getLiquidityForecast = asyncHandler(async (req, res, next) => {
  const { fromCurrency, toCurrency } = req.params;
  const { hours, confidence } = req.query;
  
  try {
    const forecast = await intelligenceService.generateLiquidityForecast(
      fromCurrency,
      toCurrency,
      hours ? parseInt(hours) : 48,
      confidence ? parseFloat(confidence) : 0.9
    );
    
    res.status(200).json({
      success: true,
      data: forecast
    });
  } catch (error) {
    return next(new AppError(`Failed to generate liquidity forecast: ${error.message}`, 500));
  }
});

/**
 * @desc    Predict optimal fee for a transaction
 * @route   POST /api/ml/optimal-fee
 * @access  Private
 */
const predictOptimalFee = asyncHandler(async (req, res, next) => {
  const { from_currency, to_currency, amount } = req.body;
  
  try {
    // Get user profile for personalization
    const userProfile = {
      transaction_count: 0, // Default for new users
      loyalty_level: 'new'
    };
    
    // If authenticated, get actual user profile
    if (req.user) {
      // Count user's completed transactions
      const transactionCount = await db('transactions')
        .count('* as count')
        .where({
          sender_id: req.user.id,
          status: 'completed'
        })
        .first();
      
      if (transactionCount) {
        userProfile.transaction_count = parseInt(transactionCount.count);
        
        if (userProfile.transaction_count > 100) {
          userProfile.loyalty_level = 'platinum';
        } else if (userProfile.transaction_count > 50) {
          userProfile.loyalty_level = 'gold';
        } else if (userProfile.transaction_count > 20) {
          userProfile.loyalty_level = 'silver';
        } else if (userProfile.transaction_count > 5) {
          userProfile.loyalty_level = 'bronze';
        }
      }
    }
    
    const feeStructure = await intelligenceService.predictOptimalFee(
      from_currency,
      to_currency,
      parseFloat(amount),
      userProfile
    );
    
    res.status(200).json({
      success: true,
      data: feeStructure
    });
  } catch (error) {
    return next(new AppError(`Failed to predict optimal fee: ${error.message}`, 500));
  }
});

/**
 * @desc    Forecast transaction volume for a corridor
 * @route   GET /api/ml/volume-forecast/:fromCurrency/:toCurrency
 * @access  Private/Admin
 */
const forecastTransactionVolume = asyncHandler(async (req, res, next) => {
  const { fromCurrency, toCurrency } = req.params;
  const { days } = req.query;
  
  try {
    const forecast = await intelligenceService.forecastTransactionVolume(
      fromCurrency,
      toCurrency,
      days ? parseInt(days) : 7
    );
    
    res.status(200).json({
      success: true,
      data: forecast
    });
  } catch (error) {
    return next(new AppError(`Failed to forecast transaction volume: ${error.message}`, 500));
  }
});

/**
 * @desc    Get liquidity forecasts for all active corridors
 * @route   GET /api/ml/corridor-forecasts
 * @access  Private/Admin
 */
const getCorridorForecasts = asyncHandler(async (req, res, next) => {
  try {
    // Define active corridors
    const corridors = [
      { from: 'NGN', to: 'USD' },
      { from: 'NGN', to: 'GBP' },
      { from: 'USD', to: 'NGN' },
      { from: 'GBP', to: 'NGN' }
    ];
    
    // Get forecasts for each corridor
    const forecasts = await Promise.all(
      corridors.map(async (corridor) => {
        const forecast = await intelligenceService.generateLiquidityForecast(
          corridor.from,
          corridor.to,
          24, // 24-hour forecast
          0.9  // 90% confidence
        );
        
        return {
          corridor: `${corridor.from}-${corridor.to}`,
          forecast
        };
      })
    );
    
    res.status(200).json({
      success: true,
      corridors: forecasts.length,
      generated_at: new Date().toISOString(),
      forecasts
    });
  } catch (error) {
    return next(new AppError(`Failed to get corridor forecasts: ${error.message}`, 500));
  }
});

module.exports = {
  getLiquidityForecast,
  predictOptimalFee,
  forecastTransactionVolume,
  getCorridorForecasts
}; 