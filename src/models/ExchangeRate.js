const { db } = require('../utils/database');

/**
 * ExchangeRate model
 */
class ExchangeRate {
  /**
   * Get current exchange rate
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Object|null} Exchange rate or null
   */
  static async getRate(fromCurrency, toCurrency) {
    const rate = await db('exchange_rates')
      .where({
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
      })
      .orderBy('created_at', 'desc')
      .first();
    
    return rate || null;
  }
  
  /**
   * Update or create exchange rate
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} rate - Exchange rate
   * @param {number} feePercentage - Fee percentage
   * @returns {Object} Updated or created exchange rate
   */
  static async updateRate(fromCurrency, toCurrency, rate, feePercentage = null) {
    // Check if rate exists
    const existingRate = await this.getRate(fromCurrency, toCurrency);
    
    // If rate exists, update it
    if (existingRate) {
      const [updatedRate] = await db('exchange_rates')
        .where({ id: existingRate.id })
        .update({
          rate,
          fee_percentage: feePercentage || existingRate.fee_percentage,
          created_at: db.fn.now(),
        })
        .returning('*');
      
      return updatedRate;
    }
    
    // Otherwise, create new rate
    const [newRate] = await db('exchange_rates')
      .insert({
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        rate,
        fee_percentage: feePercentage || parseFloat(process.env.BASE_FEE_PERCENTAGE) || 0.3,
      })
      .returning('*');
    
    return newRate;
  }
  
  /**
   * Get all current exchange rates
   * @returns {Array} Exchange rates
   */
  static async getAllRates() {
    const rates = await db('exchange_rates')
      .orderBy('from_currency')
      .orderBy('to_currency');
    
    return rates;
  }
  
  /**
   * Calculate exchange amount with fees
   * @param {number} amount - Amount to exchange
   * @param {Object} rate - Exchange rate object
   * @returns {Object} Calculation result
   */
  static calculateExchange(amount, rate) {
    const feeAmount = amount * (rate.fee_percentage / 100);
    const exchangeAmount = (amount - feeAmount) * rate.rate;
    
    return {
      originalAmount: amount,
      feePercentage: rate.fee_percentage,
      feeAmount: feeAmount,
      exchangeRate: rate.rate,
      exchangeAmount: exchangeAmount,
      totalAmount: exchangeAmount,
    };
  }
  
  /**
   * Calculate dynamic fee based on various factors
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} amount - Amount to exchange
   * @returns {number} Dynamic fee percentage
   */
  static calculateDynamicFee(fromCurrency, toCurrency, amount) {
    // Base fee from environment or default to 0.3%
    const baseFee = parseFloat(process.env.BASE_FEE_PERCENTAGE) || 0.3;
    
    // Mock liquidity multiplier based on currency pair
    let liquidityMultiplier = 1.0;
    if (
      (fromCurrency === 'NGN' && toCurrency === 'USD') ||
      (fromCurrency === 'USD' && toCurrency === 'NGN')
    ) {
      liquidityMultiplier = 1.0; // High liquidity corridor
    } else if (
      (fromCurrency === 'NGN' && toCurrency === 'GBP') ||
      (fromCurrency === 'GBP' && toCurrency === 'NGN')
    ) {
      liquidityMultiplier = 1.2; // Medium liquidity corridor
    } else {
      liquidityMultiplier = 0.9; // Low liquidity corridor (USD-GBP)
    }
    
    // Mock demand multiplier based on time of day (simplified)
    const hour = new Date().getUTCHours();
    let demandMultiplier = 1.0;
    
    // Higher demand during business hours
    if (hour >= 8 && hour <= 17) {
      demandMultiplier = 1.1;
    } else {
      demandMultiplier = 0.9;
    }
    
    // Amount-based tier (lower fee for larger amounts)
    let amountMultiplier = 1.0;
    if (amount > 10000) {
      amountMultiplier = 0.7; // 30% discount for large amounts
    } else if (amount > 1000) {
      amountMultiplier = 0.85; // 15% discount for medium amounts
    }
    
    // Calculate final fee
    const dynamicFee = baseFee * liquidityMultiplier * demandMultiplier * amountMultiplier;
    
    // Ensure fee is within reasonable bounds
    return Math.max(0.1, Math.min(dynamicFee, 1.0));
  }

  /**
   * Get recent exchange rates for a currency pair
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} hours - Number of hours to look back
   * @returns {Promise<Array>} Recent exchange rates
   */
  static async getRecentRates(fromCurrency, toCurrency, hours = 24) {
    try {
      const lookbackTime = new Date();
      lookbackTime.setHours(lookbackTime.getHours() - hours);
      
      const rates = await db('exchange_rates')
        .select('rate', 'created_at')
        .where({
          from_currency: fromCurrency,
          to_currency: toCurrency
        })
        .where('created_at', '>=', lookbackTime)
        .orderBy('created_at', 'desc');
      
      return rates;
    } catch (error) {
      console.error(`Error getting recent rates for ${fromCurrency}/${toCurrency}:`, error);
      return [];
    }
  }
}

module.exports = ExchangeRate; 