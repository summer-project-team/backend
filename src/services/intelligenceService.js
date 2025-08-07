/**
 * Unified Intelligence Service
 * Consolidates predictive analytics, ML forecasting, and demand prediction
 * Replaces: predictiveService.js + mlPredictiveService.js
 */
const { db } = require('../utils/database');
const { getCache, setCache } = require('../utils/redis');

class IntelligenceService {
  constructor() {
    // Cache configuration
    this.forecastCache = 'intelligence:forecasts';
    this.cacheDuration = 30 * 60; // 30 minutes
    
    // Model parameters
    this.confidenceLevel = 0.9;
    this.lookbackDays = 90;
    
    // Historical patterns for demand prediction
    this.historicalPatterns = {
      hourlyPatterns: {
        'NGN-GBP': [0.5, 0.3, 0.2, 0.1, 0.1, 0.2, 0.4, 0.7, 1.0, 1.2, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.1, 1.3, 1.4, 1.2, 1.0, 0.8, 0.6],
        'NGN-USD': [0.4, 0.2, 0.1, 0.1, 0.1, 0.3, 0.5, 0.8, 1.1, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.2, 1.4, 1.5, 1.3, 1.1, 0.9, 0.6],
        'GBP-NGN': [0.6, 0.4, 0.3, 0.2, 0.1, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.8, 0.9, 0.7],
        'USD-NGN': [0.5, 0.3, 0.2, 0.1, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5],
      },
      dailyPatterns: {
        'NGN-GBP': [0.7, 1.1, 1.2, 1.3, 1.2, 1.0, 0.8],
        'NGN-USD': [0.6, 1.2, 1.3, 1.2, 1.1, 1.0, 0.7],
        'GBP-NGN': [0.8, 1.0, 1.1, 1.2, 1.3, 1.1, 0.9],
        'USD-NGN': [0.7, 1.1, 1.2, 1.3, 1.2, 1.0, 0.8],
      },
      monthlyPatterns: {
        'NGN-GBP': [0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.1, 1.5],
        'NGN-USD': [0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.1, 1.4],
        'GBP-NGN': [1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.2, 1.3, 1.1, 1.0, 1.0, 1.2],
        'USD-NGN': [1.0, 0.9, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.1, 1.3],
      }
    };
    
    // Supported corridors
    this.corridors = [
      { from: 'NGN', to: 'USD' },
      { from: 'NGN', to: 'GBP' },
      { from: 'USD', to: 'NGN' },
      { from: 'GBP', to: 'NGN' },
      { from: 'USD', to: 'GBP' },
      { from: 'GBP', to: 'USD' }
    ];
  }

  /**
   * Predict demand for a specific corridor
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} forecastHours - Hours to forecast ahead
   * @returns {Object} Demand prediction
   */
  async predictDemand(fromCurrency, toCurrency, forecastHours = 24) {
    try {
      const corridor = `${fromCurrency}-${toCurrency}`;
      const now = new Date();
      
      // Get current time factors
      const hour = now.getUTCHours();
      const day = now.getUTCDay();
      const month = now.getUTCMonth();
      
      // Get pattern multipliers
      const hourMultiplier = this.historicalPatterns.hourlyPatterns[corridor]?.[hour] || 1.0;
      const dayMultiplier = this.historicalPatterns.dailyPatterns[corridor]?.[day] || 1.0;
      const monthMultiplier = this.historicalPatterns.monthlyPatterns[corridor]?.[month] || 1.0;
      
      // Calculate base demand from historical data
      const baselineQuery = await db('transactions')
        .where({
          source_currency: fromCurrency,
          target_currency: toCurrency,
          status: 'completed'
        })
        .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .avg('amount as avg_amount')
        .count('* as count')
        .first();
      
      const baseline = {
        avgAmount: parseFloat(baselineQuery.avg_amount) || 100,
        avgCount: parseInt(baselineQuery.count) || 10
      };
      
      // Calculate predicted demand
      const combinedMultiplier = (hourMultiplier + dayMultiplier + monthMultiplier) / 3;
      const predictedVolume = baseline.avgAmount * baseline.avgCount * combinedMultiplier;
      const predictedCount = Math.ceil(baseline.avgCount * combinedMultiplier);
      
      // Generate confidence intervals
      const variance = 0.15; // 15% variance
      const confidence = {
        high: predictedVolume * (1 + variance),
        low: predictedVolume * (1 - variance)
      };
      
      return {
        corridor,
        forecast_period_hours: forecastHours,
        predicted_volume: Math.round(predictedVolume * 100) / 100,
        predicted_transactions: predictedCount,
        confidence_interval: confidence,
        factors: {
          hour_multiplier: hourMultiplier,
          day_multiplier: dayMultiplier,
          month_multiplier: monthMultiplier,
          combined_multiplier: combinedMultiplier
        },
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error predicting demand:', error);
      throw error;
    }
  }

  /**
   * Generate liquidity forecast for multiple time horizons
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} forecastHours - Hours to forecast ahead
   * @returns {Object} Liquidity forecast
   */
  async generateLiquidityForecast(fromCurrency, toCurrency, forecastHours = 48) {
    try {
      const cacheKey = `${this.forecastCache}:liquidity:${fromCurrency}_${toCurrency}:${forecastHours}h`;
      
      // Check cache
      const cachedForecast = await getCache(cacheKey);
      if (cachedForecast) {
        return JSON.parse(cachedForecast);
      }
      
      // Get historical liquidity data
      const liquidityData = await this.getHistoricalLiquidityData(fromCurrency, toCurrency);
      
      // Generate forecast using trend analysis
      const forecast = await this.calculateLiquidityTrend(liquidityData, forecastHours);
      
      // Cache the result
      await setCache(cacheKey, JSON.stringify(forecast), this.cacheDuration);
      
      return forecast;
    } catch (error) {
      console.error('Error generating liquidity forecast:', error);
      throw error;
    }
  }

  /**
   * Get historical liquidity data
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Array} Historical data points
   */
  async getHistoricalLiquidityData(fromCurrency, toCurrency) {
    try {
      // Get transaction volume data for the last 90 days
      const volumeData = await db('transactions')
        .select(
          db.raw('DATE(created_at) as date'),
          db.raw('SUM(amount) as total_volume'),
          db.raw('COUNT(*) as transaction_count')
        )
        .where({
          source_currency: fromCurrency,
          target_currency: toCurrency,
          status: 'completed'
        })
        .where('created_at', '>=', new Date(Date.now() - this.lookbackDays * 24 * 60 * 60 * 1000))
        .groupBy(db.raw('DATE(created_at)'))
        .orderBy('date', 'asc');
      
      return volumeData.map(row => ({
        date: row.date,
        volume: parseFloat(row.total_volume),
        count: parseInt(row.transaction_count),
        liquidity_score: this.calculateLiquidityScore(parseFloat(row.total_volume), parseInt(row.transaction_count))
      }));
    } catch (error) {
      console.error('Error getting historical liquidity data:', error);
      return [];
    }
  }

  /**
   * Calculate liquidity score based on volume and frequency
   * @param {number} volume - Transaction volume
   * @param {number} count - Transaction count
   * @returns {number} Liquidity score (0-100)
   */
  calculateLiquidityScore(volume, count) {
    // Simple scoring: combine volume and frequency with weights
    const volumeWeight = 0.7;
    const countWeight = 0.3;
    
    // Normalize values (using reasonable maxes for scaling)
    const normalizedVolume = Math.min(volume / 100000, 1); // Max 100k for full score
    const normalizedCount = Math.min(count / 100, 1); // Max 100 transactions for full score
    
    return Math.round((normalizedVolume * volumeWeight + normalizedCount * countWeight) * 100);
  }

  /**
   * Calculate liquidity trend and forecast
   * @param {Array} liquidityData - Historical liquidity data
   * @param {number} forecastHours - Hours to forecast
   * @returns {Object} Forecast result
   */
  async calculateLiquidityTrend(liquidityData, forecastHours) {
    if (liquidityData.length < 7) {
      // Not enough data for meaningful analysis
      return this.generateFallbackForecast(forecastHours);
    }

    // Calculate trend using simple linear regression
    const trend = this.calculateLinearTrend(liquidityData);
    
    // Generate forecast points
    const forecastPoints = [];
    const hoursPerPoint = Math.max(1, Math.floor(forecastHours / 24)); // Max 24 points
    
    for (let i = 1; i <= Math.min(24, forecastHours); i += hoursPerPoint) {
      const forecastValue = trend.intercept + (trend.slope * (liquidityData.length + i / 24));
      const confidence = Math.max(0.5, 1 - (i / forecastHours) * 0.3); // Decreasing confidence
      
      forecastPoints.push({
        hours_ahead: i,
        predicted_liquidity_score: Math.max(0, Math.min(100, Math.round(forecastValue))),
        confidence_level: Math.round(confidence * 100) / 100
      });
    }

    return {
      forecast_horizon_hours: forecastHours,
      current_trend: trend.slope > 0 ? 'increasing' : trend.slope < 0 ? 'decreasing' : 'stable',
      trend_strength: Math.abs(trend.slope),
      r_squared: trend.rSquared,
      forecast_points: forecastPoints,
      recommendations: this.generateLiquidityRecommendations(trend, forecastPoints),
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Calculate linear trend from data points
   * @param {Array} data - Data points with liquidity_score
   * @returns {Object} Trend analysis
   */
  calculateLinearTrend(data) {
    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, point) => sum + point.liquidity_score, 0);
    const sumXY = data.reduce((sum, point, i) => sum + (i * point.liquidity_score), 0);
    const sumXX = data.reduce((sum, _, i) => sum + (i * i), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const yMean = sumY / n;
    const totalSumSquares = data.reduce((sum, point) => sum + Math.pow(point.liquidity_score - yMean, 2), 0);
    const residualSumSquares = data.reduce((sum, point, i) => {
      const predicted = intercept + slope * i;
      return sum + Math.pow(point.liquidity_score - predicted, 2);
    }, 0);
    
    const rSquared = 1 - (residualSumSquares / totalSumSquares);
    
    return { slope, intercept, rSquared: Math.max(0, rSquared) };
  }

  /**
   * Generate fallback forecast when insufficient data
   * @param {number} forecastHours - Hours to forecast
   * @returns {Object} Fallback forecast
   */
  generateFallbackForecast(forecastHours) {
    const baseScore = 60; // Moderate liquidity assumption
    const forecastPoints = [];
    
    for (let i = 1; i <= Math.min(24, forecastHours); i++) {
      forecastPoints.push({
        hours_ahead: i,
        predicted_liquidity_score: baseScore + Math.round((Math.random() - 0.5) * 20),
        confidence_level: 0.4 // Low confidence due to insufficient data
      });
    }

    return {
      forecast_horizon_hours: forecastHours,
      current_trend: 'insufficient_data',
      trend_strength: 0,
      r_squared: 0,
      forecast_points: forecastPoints,
      recommendations: ['Insufficient historical data for accurate forecasting', 'Collect more transaction data'],
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Generate liquidity recommendations
   * @param {Object} trend - Trend analysis
   * @param {Array} forecastPoints - Forecast points
   * @returns {Array} Recommendations
   */
  generateLiquidityRecommendations(trend, forecastPoints) {
    const recommendations = [];
    const avgScore = forecastPoints.reduce((sum, p) => sum + p.predicted_liquidity_score, 0) / forecastPoints.length;
    
    if (trend.slope > 0.5) {
      recommendations.push('Liquidity is improving - consider reducing fees to capture more volume');
    } else if (trend.slope < -0.5) {
      recommendations.push('Liquidity is declining - consider incentivizing liquidity providers');
    }
    
    if (avgScore < 40) {
      recommendations.push('Low liquidity predicted - increase reserves or partner liquidity');
    } else if (avgScore > 80) {
      recommendations.push('High liquidity predicted - opportunity for competitive pricing');
    }
    
    if (trend.rSquared < 0.3) {
      recommendations.push('High volatility detected - implement dynamic pricing');
    }
    
    return recommendations.length > 0 ? recommendations : ['Monitor liquidity levels closely'];
  }

  /**
   * Predict optimal fee for maximum revenue
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} amount - Transaction amount
   * @returns {Object} Fee optimization result
   */
  async predictOptimalFee(fromCurrency, toCurrency, amount) {
    try {
      // Get historical fee performance data
      const feeData = await db('transactions')
        .select('fee', 'amount')
        .where({
          source_currency: fromCurrency,
          target_currency: toCurrency,
          status: 'completed'
        })
        .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .where('amount', '>=', amount * 0.5)
        .where('amount', '<=', amount * 2.0);
      
      if (feeData.length < 10) {
        return this.getDefaultFeeRecommendation(amount);
      }
      
      // Calculate fee percentages and success rates
      const feeAnalysis = feeData.map(row => ({
        feePercentage: (row.fee / row.amount) * 100,
        amount: row.amount
      }));
      
      // Find optimal fee using revenue maximization
      const optimalFeePercentage = this.calculateOptimalFeePercentage(feeAnalysis);
      const recommendedFee = (amount * optimalFeePercentage) / 100;
      
      return {
        recommended_fee: Math.round(recommendedFee * 100) / 100,
        fee_percentage: Math.round(optimalFeePercentage * 100) / 100,
        analysis: {
          historical_samples: feeData.length,
          avg_fee_percentage: feeAnalysis.reduce((sum, f) => sum + f.feePercentage, 0) / feeAnalysis.length,
          confidence: feeData.length > 50 ? 'high' : feeData.length > 20 ? 'medium' : 'low'
        },
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error predicting optimal fee:', error);
      return this.getDefaultFeeRecommendation(amount);
    }
  }

  /**
   * Calculate optimal fee percentage
   * @param {Array} feeAnalysis - Fee analysis data
   * @returns {number} Optimal fee percentage
   */
  calculateOptimalFeePercentage(feeAnalysis) {
    // Simple optimization: find the fee percentage that maximizes revenue
    // In a real implementation, this would use more sophisticated algorithms
    
    const feeGroups = {};
    
    // Group by fee percentage ranges
    feeAnalysis.forEach(fee => {
      const range = Math.floor(fee.feePercentage * 2) / 2; // 0.5% increments
      if (!feeGroups[range]) {
        feeGroups[range] = { count: 0, totalAmount: 0 };
      }
      feeGroups[range].count++;
      feeGroups[range].totalAmount += fee.amount;
    });
    
    // Find the range with highest revenue potential
    let optimalFee = 1.0; // Default 1%
    let maxRevenue = 0;
    
    Object.keys(feeGroups).forEach(feePercentage => {
      const fee = parseFloat(feePercentage);
      const group = feeGroups[feePercentage];
      const avgAmount = group.totalAmount / group.count;
      const estimatedRevenue = fee * avgAmount * group.count;
      
      if (estimatedRevenue > maxRevenue) {
        maxRevenue = estimatedRevenue;
        optimalFee = fee;
      }
    });
    
    return Math.max(0.5, Math.min(3.0, optimalFee)); // Cap between 0.5% and 3%
  }

  /**
   * Get default fee recommendation
   * @param {number} amount - Transaction amount
   * @returns {Object} Default fee recommendation
   */
  getDefaultFeeRecommendation(amount) {
    const defaultFeePercentage = 1.0; // 1%
    const recommendedFee = (amount * defaultFeePercentage) / 100;
    
    return {
      recommended_fee: Math.round(recommendedFee * 100) / 100,
      fee_percentage: defaultFeePercentage,
      analysis: {
        historical_samples: 0,
        avg_fee_percentage: defaultFeePercentage,
        confidence: 'default'
      },
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Get supported corridors
   * @returns {Array} Supported corridors
   */
  getSupportedCorridors() {
    return this.corridors;
  }

  /**
   * Validate corridor
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {boolean} Whether corridor is supported
   */
  isCorridorSupported(fromCurrency, toCurrency) {
    return this.corridors.some(c => 
      c.from === fromCurrency.toUpperCase() && c.to === toCurrency.toUpperCase()
    );
  }
}

module.exports = new IntelligenceService();
