/**
 * Simplified predictive service for demand forecasting
 * Note: This is a mock implementation for the prototype
 * In a real implementation, this would use actual ML models
 */

// Mock historical data patterns
const historicalPatterns = {
  // Hour of day patterns (0-23)
  hourlyPatterns: {
    'NGN-GBP': [0.5, 0.3, 0.2, 0.1, 0.1, 0.2, 0.4, 0.7, 1.0, 1.2, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.1, 1.3, 1.4, 1.2, 1.0, 0.8, 0.6],
    'NGN-USD': [0.4, 0.2, 0.1, 0.1, 0.1, 0.3, 0.5, 0.8, 1.1, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.2, 1.4, 1.5, 1.3, 1.1, 0.9, 0.6],
    'GBP-NGN': [0.6, 0.4, 0.3, 0.2, 0.1, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.8, 0.9, 0.7],
    'USD-NGN': [0.5, 0.3, 0.2, 0.1, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5],
  },
  
  // Day of week patterns (0-6, Sunday-Saturday)
  dailyPatterns: {
    'NGN-GBP': [0.7, 1.1, 1.2, 1.3, 1.2, 1.0, 0.8],
    'NGN-USD': [0.6, 1.2, 1.3, 1.2, 1.1, 1.0, 0.7],
    'GBP-NGN': [0.8, 1.0, 1.1, 1.2, 1.3, 1.1, 0.9],
    'USD-NGN': [0.7, 1.1, 1.2, 1.3, 1.2, 1.0, 0.8],
  },
  
  // Month patterns (0-11, January-December)
  monthlyPatterns: {
    'NGN-GBP': [0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.1, 1.5], // December peak for holidays
    'NGN-USD': [0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.1, 1.4],
    'GBP-NGN': [1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.2, 1.3, 1.1, 1.0, 1.0, 1.2],
    'USD-NGN': [1.0, 0.9, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.1, 1.3],
  },
};

/**
 * Predict demand for a specific corridor
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @returns {Object} Demand prediction
 */
const predictDemand = (fromCurrency, toCurrency) => {
  const corridor = `${fromCurrency}-${toCurrency}`;
  const now = new Date();
  
  // Get current time factors
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const month = now.getUTCMonth();
  
  // Get pattern multipliers (default to 1.0 if pattern not found)
  const hourMultiplier = historicalPatterns.hourlyPatterns[corridor]?.[hour] || 1.0;
  const dayMultiplier = historicalPatterns.dailyPatterns[corridor]?.[day] || 1.0;
  const monthMultiplier = historicalPatterns.monthlyPatterns[corridor]?.[month] || 1.0;
  
  // Calculate combined demand factor
  const demandFactor = hourMultiplier * dayMultiplier * monthMultiplier;
  
  // Generate prediction
  return {
    corridor,
    timestamp: now.toISOString(),
    predicted_demand_factor: demandFactor,
    prediction_factors: {
      hour_factor: hourMultiplier,
      day_factor: dayMultiplier,
      month_factor: monthMultiplier,
    },
    demand_level: getDemandLevel(demandFactor),
    recommended_actions: getRecommendedActions(demandFactor),
  };
};

/**
 * Get demand level based on factor
 * @param {number} factor - Demand factor
 * @returns {string} Demand level
 */
const getDemandLevel = (factor) => {
  if (factor < 0.7) return 'low';
  if (factor < 1.0) return 'moderate';
  if (factor < 1.3) return 'high';
  return 'very_high';
};

/**
 * Get recommended actions based on demand factor
 * @param {number} factor - Demand factor
 * @returns {Array} Recommended actions
 */
const getRecommendedActions = (factor) => {
  const actions = [];
  
  if (factor > 1.5) {
    actions.push('increase_liquidity');
    actions.push('optimize_for_speed');
    actions.push('prepare_backup_routes');
  } else if (factor > 1.2) {
    actions.push('monitor_liquidity');
    actions.push('standard_routing');
  } else if (factor < 0.7) {
    actions.push('reduce_liquidity');
    actions.push('optimize_for_cost');
    actions.push('offer_promotional_rates');
  }
  
  return actions;
};

/**
 * Predict optimal fee for a corridor based on demand
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {number} amount - Transaction amount
 * @returns {Object} Fee prediction
 */
const predictOptimalFee = (fromCurrency, toCurrency, amount) => {
  // Get demand prediction
  const demand = predictDemand(fromCurrency, toCurrency);
  
  // Base fee percentage
  const baseFee = 0.3; // 0.3%
  
  // Adjust fee based on demand
  let demandMultiplier = 1.0;
  switch (demand.demand_level) {
    case 'low':
      demandMultiplier = 0.8; // Reduce fee to encourage transactions
      break;
    case 'moderate':
      demandMultiplier = 1.0; // Standard fee
      break;
    case 'high':
      demandMultiplier = 1.1; // Slightly higher fee
      break;
    case 'very_high':
      demandMultiplier = 1.2; // Higher fee during peak demand
      break;
  }
  
  // Adjust fee based on amount (volume discount)
  let volumeMultiplier = 1.0;
  if (amount > 10000) {
    volumeMultiplier = 0.7; // 30% discount for large amounts
  } else if (amount > 1000) {
    volumeMultiplier = 0.85; // 15% discount for medium amounts
  }
  
  // Calculate final fee percentage
  const feePercentage = baseFee * demandMultiplier * volumeMultiplier;
  
  // Calculate fee amount
  const feeAmount = amount * (feePercentage / 100);
  
  return {
    corridor: `${fromCurrency}-${toCurrency}`,
    amount,
    base_fee_percentage: baseFee,
    demand_multiplier: demandMultiplier,
    volume_multiplier: volumeMultiplier,
    optimal_fee_percentage: feePercentage,
    fee_amount: feeAmount,
    demand_level: demand.demand_level,
  };
};

module.exports = {
  predictDemand,
  predictOptimalFee,
}; 