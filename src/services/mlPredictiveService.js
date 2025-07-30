/**
 * ML Predictive Service
 * Provides machine learning-based predictions for liquidity, corridor activity, and fee optimization
 */
const { db } = require('../utils/database');
const redis = require('../utils/redis');

class MLPredictiveService {
  constructor() {
    // Cache keys and durations
    this.forecastCache = 'ml:forecasts';
    this.cacheDuration = 30 * 60; // 30 minutes
    
    // Model parameters
    this.confidenceLevel = 0.9; // Default 90% confidence level
    this.lookbackDays = 90; // Default 90 days of historical data
    
    // Corridor info
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
   * Generate liquidity forecast for a specific corridor
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} forecastHours - Hours to forecast ahead
   * @param {number} confidence - Confidence level (0-1)
   * @returns {Promise<Object>} Forecast data
   */
  async generateLiquidityForecast(fromCurrency, toCurrency, forecastHours = 48, confidence = 0.9) {
    try {
      // Normalize currency codes
      fromCurrency = fromCurrency.toUpperCase();
      toCurrency = toCurrency.toUpperCase();
      
      // Create cache key
      const cacheKey = `${this.forecastCache}:liquidity:${fromCurrency}_${toCurrency}:${forecastHours}h`;
      
      // Check cache first
      const cachedForecast = await redis.getCache(cacheKey);
      if (cachedForecast) {
        return cachedForecast;
      }
      
      // Get historical data for prediction
      const historicalData = await this._getHistoricalVolumeData(fromCurrency, toCurrency);
      
      // Apply time series forecasting algorithm
      // In a real implementation, this would use a proper ML model
      const forecast = this._applyTimeSeriesForecast(historicalData, forecastHours, confidence);
      
      // Store in cache
      await redis.setCache(cacheKey, forecast, this.cacheDuration);
      
      return forecast;
    } catch (error) {
      console.error(`Error generating liquidity forecast for ${fromCurrency}-${toCurrency}:`, error);
      
      // Return a reasonable fallback forecast
      return this._generateFallbackForecast(fromCurrency, toCurrency, forecastHours);
    }
  }
  
  /**
   * Predict optimal fee for a transaction
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} amount - Transaction amount
   * @param {Object} userProfile - User transaction history profile
   * @returns {Promise<Object>} Optimized fee structure
   */
  async predictOptimalFee(fromCurrency, toCurrency, amount, userProfile = {}) {
    try {
      // Normalize currency codes and amount
      fromCurrency = fromCurrency.toUpperCase();
      toCurrency = toCurrency.toUpperCase();
      amount = parseFloat(amount);
      
      // Get corridor fee statistics
      const corridorStats = await this._getCorridorFeeStatistics(fromCurrency, toCurrency);
      
      // Get current liquidity status
      const liquidityStatus = await this._getCorridorLiquidityStatus(fromCurrency, toCurrency);
      
      // Calculate base fee percentage based on amount tier
      let baseFeePercentage = 0.01; // 1% default
      
      if (amount > 100000) baseFeePercentage = 0.005; // 0.5% for large amounts
      else if (amount > 10000) baseFeePercentage = 0.0075; // 0.75% for medium amounts
      
      // Adjust for corridor activity (higher demand = higher fee)
      const corridorActivityMultiplier = liquidityStatus.demand_level / 5; // 1-5 scale normalized to 0.2-1
      
      // Adjust for user loyalty (more transactions = lower fee)
      const userLoyaltyDiscount = this._calculateUserLoyaltyDiscount(userProfile);
      
      // Adjust for corridor balance (incentivize flows to balance corridor)
      const balanceIncentive = this._calculateBalanceIncentive(fromCurrency, toCurrency, liquidityStatus);
      
      // Calculate final fee percentage
      const adjustedFeePercentage = baseFeePercentage * corridorActivityMultiplier * (1 - userLoyaltyDiscount) * (1 - balanceIncentive);
      
      // Calculate actual fee
      const feeAmount = amount * adjustedFeePercentage;
      
      // Calculate minimum fee
      const minFee = this._getMinimumFee(fromCurrency);
      
      // Return fee structure
      return {
        base_fee_percentage: baseFeePercentage,
        adjusted_fee_percentage: adjustedFeePercentage,
        fee_amount: Math.max(feeAmount, minFee),
        min_fee: minFee,
        corridor_activity_level: liquidityStatus.demand_level,
        user_loyalty_discount: userLoyaltyDiscount,
        balance_incentive: balanceIncentive,
        optimization_factors: {
          corridor_demand: corridorActivityMultiplier > 1 ? "high" : "normal",
          user_loyalty: userLoyaltyDiscount > 0 ? "applied" : "none",
          balance_incentive: balanceIncentive > 0 ? "applied" : "none"
        }
      };
    } catch (error) {
      console.error(`Error predicting optimal fee for ${fromCurrency}-${toCurrency}:`, error);
      
      // Return a reasonable fallback fee structure
      return {
        base_fee_percentage: 0.01,
        adjusted_fee_percentage: 0.01,
        fee_amount: amount * 0.01,
        min_fee: this._getMinimumFee(fromCurrency),
        error: "Prediction error, using fallback fee"
      };
    }
  }

  /**
   * Forecast transaction volume for a specific corridor
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} days - Days to forecast ahead
   * @returns {Promise<Object>} Volume forecast
   */
  async forecastTransactionVolume(fromCurrency, toCurrency, days = 7) {
    try {
      // Normalize currency codes
      fromCurrency = fromCurrency.toUpperCase();
      toCurrency = toCurrency.toUpperCase();
      
      // Create cache key
      const cacheKey = `${this.forecastCache}:volume:${fromCurrency}_${toCurrency}:${days}d`;
      
      // Check cache first
      const cachedForecast = await redis.getCache(cacheKey);
      if (cachedForecast) {
        return cachedForecast;
      }
      
      // Get historical volume data
      const historicalData = await this._getHistoricalVolumeData(fromCurrency, toCurrency);
      
      // Get day-of-week and month patterns
      const patterns = await this._extractVolumePatterns(historicalData);
      
      // Generate forecast for each day
      const forecast = [];
      const now = new Date();
      
      for (let i = 1; i <= days; i++) {
        const forecastDate = new Date(now);
        forecastDate.setDate(forecastDate.getDate() + i);
        
        const dayOfWeek = forecastDate.getDay();
        const dayOfMonth = forecastDate.getDate();
        
        // Calculate forecasted volume based on patterns
        // In a real implementation, this would use a proper ML model
        const dayFactor = patterns.dayOfWeek[dayOfWeek] || 1;
        const monthFactor = patterns.dayOfMonth[dayOfMonth] || 1;
        const baseVolume = patterns.averageVolume;
        
        forecast.push({
          date: forecastDate.toISOString().split('T')[0],
          predicted_volume: baseVolume * dayFactor * monthFactor,
          predicted_count: Math.round(patterns.averageCount * dayFactor),
          confidence_level: 0.9,
          factors: {
            day_of_week_factor: dayFactor,
            day_of_month_factor: monthFactor,
            seasonality: dayFactor > 1.2 ? "high" : (dayFactor < 0.8 ? "low" : "normal")
          }
        });
      }
      
      const result = {
        corridor: `${fromCurrency}-${toCurrency}`,
        forecast_period: `${days} days`,
        generated_at: new Date().toISOString(),
        daily_forecast: forecast,
        total_predicted_volume: forecast.reduce((sum, day) => sum + day.predicted_volume, 0),
        avg_daily_volume: forecast.reduce((sum, day) => sum + day.predicted_volume, 0) / days
      };
      
      // Store in cache
      await redis.setCache(cacheKey, result, this.cacheDuration);
      
      return result;
    } catch (error) {
      console.error(`Error forecasting transaction volume for ${fromCurrency}-${toCurrency}:`, error);
      
      // Return a fallback forecast
      return this._generateFallbackVolumeForecast(fromCurrency, toCurrency, days);
    }
  }
  
  /**
   * Get historical transaction volume data
   * @private
   */
  async _getHistoricalVolumeData(fromCurrency, toCurrency) {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - this.lookbackDays);
    
    // Query database for historical volume data
    const volumeData = await db('transactions')
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('SUM(amount) as volume'),
        db.raw('COUNT(*) as count')
      )
      .where({
        'currency_from': fromCurrency,
        'currency_to': toCurrency,
        'status': 'completed'
      })
      .where('created_at', '>=', lookbackDate)
      .groupBy('date')
      .orderBy('date');
    
    return volumeData;
  }
  
  /**
   * Apply time series forecasting to historical data
   * @private
   */
  _applyTimeSeriesForecast(historicalData, forecastHours, confidence) {
    // In a real implementation, this would use an ARIMA, LSTM, or similar model
    // For this prototype, we'll use a simplified approach
    
    // Calculate average hourly volume
    const totalVolume = historicalData.reduce((sum, day) => sum + parseFloat(day.volume), 0);
    const averageVolume = totalVolume / historicalData.length / 24;
    
    // Generate hourly forecast
    const hourlyForecast = [];
    const now = new Date();
    
    for (let i = 1; i <= forecastHours; i++) {
      const forecastTime = new Date(now);
      forecastTime.setHours(forecastTime.getHours() + i);
      
      // Apply time-of-day factor
      const hourOfDay = forecastTime.getHours();
      const hourFactor = this._getHourFactor(hourOfDay);
      
      // Apply day-of-week factor
      const dayOfWeek = forecastTime.getDay();
      const dayFactor = this._getDayFactor(dayOfWeek);
      
      // Forecast for this hour
      const forecastedVolume = averageVolume * hourFactor * dayFactor;
      const lowerBound = forecastedVolume * (1 - (1 - confidence));
      const upperBound = forecastedVolume * (1 + (1 - confidence));
      
      hourlyForecast.push({
        timestamp: forecastTime.toISOString(),
        predicted_volume: forecastedVolume,
        lower_bound: lowerBound,
        upper_bound: upperBound,
        hour_factor: hourFactor,
        day_factor: dayFactor
      });
    }
    
    return {
      forecast_hours: forecastHours,
      confidence_level: confidence,
      generated_at: new Date().toISOString(),
      hourly_forecast: hourlyForecast,
      total_predicted_volume: hourlyForecast.reduce((sum, hour) => sum + hour.predicted_volume, 0),
      avg_hourly_volume: averageVolume
    };
  }
  
  /**
   * Generate fallback forecast when data is insufficient
   * @private
   */
  _generateFallbackForecast(fromCurrency, toCurrency, forecastHours) {
    // Create a simple fallback forecast based on currency pair
    const baseHourlyVolume = this._getBaseVolumeForCorridor(fromCurrency, toCurrency);
    
    const hourlyForecast = [];
    const now = new Date();
    
    for (let i = 1; i <= forecastHours; i++) {
      const forecastTime = new Date(now);
      forecastTime.setHours(forecastTime.getHours() + i);
      
      // Apply time-of-day factor
      const hourOfDay = forecastTime.getHours();
      const hourFactor = this._getHourFactor(hourOfDay);
      
      // Apply day-of-week factor
      const dayOfWeek = forecastTime.getDay();
      const dayFactor = this._getDayFactor(dayOfWeek);
      
      // Forecast for this hour
      const forecastedVolume = baseHourlyVolume * hourFactor * dayFactor;
      
      hourlyForecast.push({
        timestamp: forecastTime.toISOString(),
        predicted_volume: forecastedVolume,
        lower_bound: forecastedVolume * 0.7,
        upper_bound: forecastedVolume * 1.3,
        is_fallback: true
      });
    }
    
    return {
      forecast_hours: forecastHours,
      confidence_level: 0.7, // Lower confidence for fallback
      generated_at: new Date().toISOString(),
      hourly_forecast: hourlyForecast,
      total_predicted_volume: hourlyForecast.reduce((sum, hour) => sum + hour.predicted_volume, 0),
      avg_hourly_volume: baseHourlyVolume,
      is_fallback: true
    };
  }
  
  /**
   * Generate fallback volume forecast
   * @private
   */
  _generateFallbackVolumeForecast(fromCurrency, toCurrency, days) {
    // Create a simple fallback forecast based on currency pair
    const baseDailyVolume = this._getBaseVolumeForCorridor(fromCurrency, toCurrency) * 24;
    
    const dailyForecast = [];
    const now = new Date();
    
    for (let i = 1; i <= days; i++) {
      const forecastDate = new Date(now);
      forecastDate.setDate(forecastDate.getDate() + i);
      
      const dayOfWeek = forecastDate.getDay();
      const dayFactor = this._getDayFactor(dayOfWeek);
      
      dailyForecast.push({
        date: forecastDate.toISOString().split('T')[0],
        predicted_volume: baseDailyVolume * dayFactor,
        predicted_count: Math.round(baseDailyVolume * dayFactor / 1000), // Rough estimate
        is_fallback: true
      });
    }
    
    return {
      corridor: `${fromCurrency}-${toCurrency}`,
      forecast_period: `${days} days`,
      generated_at: new Date().toISOString(),
      daily_forecast: dailyForecast,
      total_predicted_volume: dailyForecast.reduce((sum, day) => sum + day.predicted_volume, 0),
      avg_daily_volume: dailyForecast.reduce((sum, day) => sum + day.predicted_volume, 0) / days,
      is_fallback: true
    };
  }
  
  /**
   * Extract volume patterns from historical data
   * @private
   */
  async _extractVolumePatterns(historicalData) {
    // Calculate overall averages
    let totalVolume = 0;
    let totalCount = 0;
    
    // Initialize day-of-week and day-of-month patterns
    const dayOfWeekPatterns = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    
    const dayOfMonthPatterns = {};
    for (let i = 1; i <= 31; i++) {
      dayOfMonthPatterns[i] = { total: 0, count: 0 };
    }
    
    // Process each day's data
    for (const day of historicalData) {
      const volume = parseFloat(day.volume);
      const count = parseInt(day.count);
      
      totalVolume += volume;
      totalCount += count;
      
      // Extract date components
      const date = new Date(day.date);
      const dayOfWeek = date.getDay();
      const dayOfMonth = date.getDate();
      
      // Update day-of-week patterns
      dayOfWeekPatterns[dayOfWeek] += volume;
      dayOfWeekCounts[dayOfWeek]++;
      
      // Update day-of-month patterns
      if (!dayOfMonthPatterns[dayOfMonth]) {
        dayOfMonthPatterns[dayOfMonth] = { total: 0, count: 0 };
      }
      
      dayOfMonthPatterns[dayOfMonth].total += volume;
      dayOfMonthPatterns[dayOfMonth].count++;
    }
    
    // Calculate averages
    const averageVolume = totalVolume / historicalData.length;
    const averageCount = totalCount / historicalData.length;
    
    // Normalize day-of-week patterns
    const normalizedDayOfWeek = {};
    for (let i = 0; i < 7; i++) {
      if (dayOfWeekCounts[i] > 0) {
        const dayAvg = dayOfWeekPatterns[i] / dayOfWeekCounts[i];
        normalizedDayOfWeek[i] = dayAvg / averageVolume;
      } else {
        normalizedDayOfWeek[i] = 1; // Default if no data
      }
    }
    
    // Normalize day-of-month patterns
    const normalizedDayOfMonth = {};
    for (let i = 1; i <= 31; i++) {
      if (dayOfMonthPatterns[i] && dayOfMonthPatterns[i].count > 0) {
        const dayAvg = dayOfMonthPatterns[i].total / dayOfMonthPatterns[i].count;
        normalizedDayOfMonth[i] = dayAvg / averageVolume;
      } else {
        normalizedDayOfMonth[i] = 1; // Default if no data
      }
    }
    
    return {
      averageVolume,
      averageCount,
      dayOfWeek: normalizedDayOfWeek,
      dayOfMonth: normalizedDayOfMonth
    };
  }
  
  /**
   * Get corridor fee statistics
   * @private
   */
  async _getCorridorFeeStatistics(fromCurrency, toCurrency) {
    // In a real implementation, this would query actual fee data
    // For this prototype, we'll return mock statistics
    
    return {
      avg_fee_percentage: 0.01,
      min_fee_percentage: 0.005,
      max_fee_percentage: 0.02,
      optimal_fee_range: {
        low: 0.008,
        high: 0.012
      }
    };
  }
  
  /**
   * Get current liquidity status for a corridor
   * @private
   */
  async _getCorridorLiquidityStatus(fromCurrency, toCurrency) {
    try {
      // In a real implementation, this would check actual liquidity pools
      // For this prototype, we'll use mock data
      
      // Check if we have actual data from the liquidity service
      try {
        const fromCurrencyPool = await db('liquidity_pools')
          .where({ currency: fromCurrency })
          .first();
        
        const toCurrencyPool = await db('liquidity_pools')
          .where({ currency: toCurrency })
          .first();
        
        if (fromCurrencyPool && toCurrencyPool) {
          const fromRatio = fromCurrencyPool.current_balance / fromCurrencyPool.target_balance;
          const toRatio = toCurrencyPool.current_balance / toCurrencyPool.target_balance;
          
          return {
            from_currency_liquidity: fromRatio,
            to_currency_liquidity: toRatio,
            balance_ratio: fromRatio / toRatio,
            from_status: this._getLiquidityStatus(fromRatio),
            to_status: this._getLiquidityStatus(toRatio),
            demand_level: this._calculateDemandLevel(fromRatio, toRatio)
          };
        }
      } catch (err) {
        console.error("Error fetching actual liquidity data:", err);
        // Continue to fallback
      }
      
      // Fallback mock data
      return {
        from_currency_liquidity: 0.9, // 90% of target
        to_currency_liquidity: 1.1, // 110% of target
        balance_ratio: 0.82,
        from_status: "adequate",
        to_status: "excess",
        demand_level: 3 // Medium demand (1-5 scale)
      };
    } catch (error) {
      console.error(`Error getting corridor liquidity status:`, error);
      return {
        from_currency_liquidity: 1,
        to_currency_liquidity: 1,
        balance_ratio: 1,
        from_status: "unknown",
        to_status: "unknown",
        demand_level: 3
      };
    }
  }
  
  /**
   * Calculate user loyalty discount
   * @private
   */
  _calculateUserLoyaltyDiscount(userProfile) {
    if (!userProfile || !userProfile.transaction_count) {
      return 0;
    }
    
    // Simple loyalty model based on transaction count
    const transactionCount = userProfile.transaction_count;
    
    if (transactionCount > 100) return 0.15; // 15% discount
    if (transactionCount > 50) return 0.1; // 10% discount
    if (transactionCount > 20) return 0.05; // 5% discount
    if (transactionCount > 10) return 0.025; // 2.5% discount
    if (transactionCount > 5) return 0.01; // 1% discount
    
    return 0;
  }
  
  /**
   * Calculate balance incentive for corridor balancing
   * @private
   */
  _calculateBalanceIncentive(fromCurrency, toCurrency, liquidityStatus) {
    // If corridor is imbalanced, provide incentive to balance it
    if (liquidityStatus.balance_ratio < 0.7) {
      // Source currency is low compared to target, incentivize flows from target to source
      return 0.1; // 10% incentive
    }
    
    if (liquidityStatus.balance_ratio > 1.3) {
      // Source currency is high compared to target, incentivize flows from source to target
      return 0.05; // 5% incentive
    }
    
    return 0; // No incentive needed, corridor is balanced
  }
  
  /**
   * Get minimum fee for a currency
   * @private
   */
  _getMinimumFee(currency) {
    // Minimum fees by currency
    const minFees = {
      'NGN': 500,
      'USD': 5,
      'GBP': 3,
      'EUR': 4,
      'CBUSD': 1
    };
    
    return minFees[currency] || 5; // Default to $5 if currency not found
  }
  
  /**
   * Get base volume for a corridor (for fallback)
   * @private
   */
  _getBaseVolumeForCorridor(fromCurrency, toCurrency) {
    // Estimate base hourly volume based on currency corridor
    // These are rough estimates for the fallback scenario
    const corridorVolumes = {
      'NGN_USD': 25000,
      'NGN_GBP': 20000,
      'USD_NGN': 15000,
      'GBP_NGN': 18000,
      'USD_GBP': 30000,
      'GBP_USD': 35000
    };
    
    const key = `${fromCurrency}_${toCurrency}`;
    return corridorVolumes[key] || 10000; // Default if corridor not found
  }
  
  /**
   * Get time-of-day factor for volume prediction
   * @private
   */
  _getHourFactor(hour) {
    // Factors based on time of day (0-23 hours)
    const hourFactors = [
      0.4, 0.3, 0.2, 0.2, 0.2, 0.3, // 0-5: Night (low activity)
      0.5, 0.8, 1.2, 1.5, 1.6, 1.8, // 6-11: Morning (increasing activity)
      1.7, 1.6, 1.5, 1.6, 1.7, 1.8, // 12-17: Afternoon (sustained activity)
      2.0, 1.8, 1.5, 1.2, 0.8, 0.5  // 18-23: Evening (decreasing activity)
    ];
    
    return hourFactors[hour] || 1;
  }
  
  /**
   * Get day-of-week factor for volume prediction
   * @private
   */
  _getDayFactor(day) {
    // Factors based on day of week (0=Sunday, 6=Saturday)
    const dayFactors = [
      0.7, // Sunday
      1.2, // Monday
      1.3, // Tuesday
      1.4, // Wednesday
      1.4, // Thursday
      1.5, // Friday
      0.9  // Saturday
    ];
    
    return dayFactors[day] || 1;
  }
  
  /**
   * Get liquidity status label based on ratio
   * @private
   */
  _getLiquidityStatus(ratio) {
    if (ratio < 0.2) return "critical";
    if (ratio < 0.5) return "low";
    if (ratio < 0.8) return "adequate";
    if (ratio < 1.2) return "optimal";
    if (ratio < 1.5) return "excess";
    return "high_excess";
  }
  
  /**
   * Calculate demand level on a 1-5 scale
   * @private
   */
  _calculateDemandLevel(fromRatio, toRatio) {
    // Low source liquidity and high target liquidity indicates high demand
    if (fromRatio < 0.5 && toRatio > 1.2) return 5; // Very high demand
    if (fromRatio < 0.7 && toRatio > 1.0) return 4; // High demand
    if (fromRatio < 0.9 && toRatio > 0.9) return 3; // Medium demand
    if (fromRatio < 1.1) return 2; // Low demand
    return 1; // Very low demand
  }
}

const mlPredictiveService = new MLPredictiveService();
module.exports = mlPredictiveService; 