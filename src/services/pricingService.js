const { db } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const { setCache, getCache } = require('../utils/redis');
const axios = require('axios');
const exchangeRateConfig = require('../config/exchangeRateConfig');

/**
 * Pricing service for exchange rate calculations
 */
const pricingService = {
  /**
   * Generate a quote for currency exchange
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} amount - Amount to exchange
   * @returns {Object} Quote information
   */
  generateQuote: async (fromCurrency, toCurrency, amount) => {
    try {
      // Get latest exchange rate
      const rate = await pricingService.getExchangeRate(fromCurrency, toCurrency);

      // Calculate fee (0.5% for demo)
      const feePercentage = 0.005;
      const feeAmount = amount * feePercentage;

      // Calculate exchange amount
      const exchangeAmount = (amount - feeAmount) * rate.rate;

      // Generate quote ID
      const quoteId = uuidv4();

      // Store quote in Redis with 15 minute expiry
      const quoteData = {
        quote_id: quoteId,
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        amount: amount,
        exchange_rate: rate.rate,
        fee_percentage: feePercentage,
        fee_amount: feeAmount,
        exchange_amount: exchangeAmount,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      // Use the helper function instead of direct Redis call
      await setCache(`quote:${quoteId}`, quoteData, 15 * 60);

      return quoteData;
    } catch (error) {
      console.error('Error generating quote:', error);
      throw error;
    }
  },

  /**
   * Get a stored quote by ID
   * @param {string} quoteId - Quote ID
   * @returns {Object|null} Quote information or null if expired
   */
  getQuote: async (quoteId) => {
    try {
      // Use the helper function instead of direct Redis call
      const quote = await getCache(`quote:${quoteId}`);
      return quote; // getCache already handles JSON parsing
    } catch (error) {
      console.error('Error getting quote:', error);
      throw error;
    }
  },

  /**
   * Generate a quote for bank-to-bank transfers (different fee structure)
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} amount - Amount to exchange
   * @param {string} senderCountry - Sender country code
   * @param {string} string recipientCountry - Recipient country code
   * @returns {Object} Quote information
   */
  generateB2BQuote: async (fromCurrency, toCurrency, amount, senderCountry, recipientCountry) => {
    try {
      // Get latest exchange rate
      const rate = await pricingService.getExchangeRate(fromCurrency, toCurrency);

      // Calculate fee (0.6% for B2B transfers)
      const feePercentage = 0.006;
      const feeAmount = amount * feePercentage;

      // Calculate exchange amount
      const exchangeAmount = (amount - feeAmount) * rate.rate;

      // Generate quote ID
      const quoteId = uuidv4();

      // Store quote in Redis with 15 minute expiry
      const quoteData = {
        quote_id: quoteId,
        type: 'b2b',
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        amount: amount,
        exchange_rate: rate.rate,
        fee_percentage: feePercentage,
        fee_amount: feeAmount,
        exchange_amount: exchangeAmount,
        sender_country: senderCountry,
        recipient_country: recipientCountry,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      // Use the helper function instead of direct Redis call
      await setCache(`quote:${quoteId}`, quoteData, 15 * 60);

      return quoteData;
    } catch (error) {
      console.error('Error generating B2B quote:', error);
      throw error;
    }
  },

  /**
   * Get current exchange rate between currencies
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Object} Exchange rate information
   */
  getExchangeRate: async (fromCurrency, toCurrency) => {
    try {
      // Query the database for the latest exchange rate
      const rate = await db('exchange_rates')
        .where({
          from_currency: fromCurrency.toUpperCase(),
          to_currency: toCurrency.toUpperCase(),
        })
        .orderBy('created_at', 'desc')
        .first();

      if (!rate) {
        // Fallback or throw error if rate not found
        // For development, let's provide a default if not found
        console.warn(`Exchange rate not found for ${fromCurrency} to ${toCurrency}. Using default.`);
        return { rate: 1.0, fee_percentage: 0.0 }; // Default fallback rate
      }

      return rate;
    } catch (error) {
      console.error('Error getting exchange rate:', error);
      throw error;
    }
  },

  /**
   * Lock a rate for a specific duration
   * @param {string} quoteId - Quote ID to lock
   * @param {number} durationSeconds - Duration in seconds (max 300)
   * @returns {Object} Lock information
   */
  lockRate: async (quoteId, durationSeconds = 60) => {
    try {
      // Get the quote using helper function
      const quote = await getCache(`quote:${quoteId}`);

      if (!quote) {
        throw new Error('Quote not found or expired');
      }

      // Limit max lock duration to 5 minutes
      const maxDuration = 300; // 5 minutes in seconds
      const lockDuration = Math.min(durationSeconds, maxDuration);

      // Create lock object
      const lockId = uuidv4();
      const lockData = {
        lock_id: lockId,
        quote_id: quoteId,
        from_currency: quote.from_currency,
        to_currency: quote.to_currency,
        amount: quote.amount,
        exchange_rate: quote.exchange_rate,
        fee_amount: quote.fee_amount,
        exchange_amount: quote.exchange_amount,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + lockDuration * 1000).toISOString(),
        duration_seconds: lockDuration
      };

      // Store lock in Redis using helper function
      await setCache(`rate_lock:${lockId}`, lockData, lockDuration);

      return lockData;
    } catch (error) {
      console.error('Error locking rate:', error);
      throw error;
    }
  },

  /**
   * Verify if a rate lock is valid
   * @param {string} lockId - Lock ID
   * @returns {Object|null} Lock information or null if expired
   */
  verifyRateLock: async (lockId) => {
    try {
      // Use helper function instead of direct Redis call
      const lock = await getCache(`rate_lock:${lockId}`);
      return lock; // getCache already handles JSON parsing
    } catch (error) {
      console.error('Error verifying rate lock:', error);
      throw error;
    }
  },

  /**
   * Generate a personalized quote based on user history and payment method
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} amount - Amount to exchange
   * @param {string} userId - User ID for personalization
   * @param {string} recipientId - Optional recipient ID
   * @param {string} paymentMethod - Payment method (app_balance, bank_transfer)
   * @returns {Object} Personalized quote information
   */
  generatePersonalizedQuote: async (fromCurrency, toCurrency, amount, userId, recipientId = null, paymentMethod = 'app_balance') => {
    try {
      // Get latest exchange rate
      const rate = await pricingService.getExchangeRate(fromCurrency, toCurrency);

      // Base fee percentage depends on payment method
      let feePercentage;
      switch(paymentMethod) {
        case 'app_balance':
          feePercentage = 0.003; // 0.3% for app balance transfers
          break;
        case 'bank_transfer':
          feePercentage = 0.004; // 0.4% for bank transfers
          break;
        case 'card_payment':
          feePercentage = 0.015; // 1.5% for card payments
          break;
        default:
          feePercentage = 0.005; // 0.5% default
      }

      // If this is a frequent recipient, reduce the fee (loyalty discount)
      if (recipientId) {
        try {
          const transactionCount = await db('transactions')
            .where({
              sender_id: userId,
              recipient_id: recipientId,
              status: 'completed'
            })
            .count('id as count')
            .first();

          if (transactionCount && transactionCount.count > 5) {
            // 20% discount for frequent recipients (more than 5 transactions)
            feePercentage *= 0.8;
          }
        } catch (error) {
          // If error counting transactions, just use the default fee
          console.error('Error calculating loyalty discount:', error);
        }
      }

      // Calculate fee
      const feeAmount = amount * feePercentage;

      // Calculate exchange amount
      const exchangeAmount = (amount - feeAmount) * rate.rate;

      // Generate quote ID
      const quoteId = uuidv4();

      // Store quote in Redis with 15 minute expiry
      const quoteData = {
        quote_id: quoteId,
        from_currency: fromCurrency.toUpperCase(),
        to_currency: toCurrency.toUpperCase(),
        amount: amount,
        exchange_rate: rate.rate,
        fee_percentage: feePercentage,
        fee_amount: feeAmount,
        exchange_amount: exchangeAmount,
        payment_method: paymentMethod,
        is_personalized: true,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      // Use helper function instead of direct Redis call
      await setCache(`quote:${quoteId}`, quoteData, 15 * 60);

      return quoteData;
    } catch (error) {
      console.error('Error generating personalized quote:', error);
      throw error;
    }
  },

  /**
   * Updates exchange rates in the database.
   * Enhanced with local fallback when API is unavailable.
   * @returns {Object} Status of the update
   */
  updateExchangeRates: async () => {
    try {
      // Check if we should force local mode
      if (exchangeRateConfig.development.forceLocalMode || !exchangeRateConfig.api.enabled) {
        return pricingService.updateLocalExchangeRates();
      }

      // Try to fetch from API first
      const appId = exchangeRateConfig.api.openExchangeRates.appId;
      let updatedCount = 0;
      let source = 'api';

      if (appId) {
        try {
          // Fetch latest rates (base: USD)
          const response = await axios.get(
            `${exchangeRateConfig.api.openExchangeRates.baseUrl}/latest.json?app_id=${appId}`,
            { timeout: exchangeRateConfig.api.openExchangeRates.timeout }
          );
          const rates = response.data.rates;

          // Use configured currencies
          const currencies = exchangeRateConfig.currencies.all;

          // Update all pairs (USD as base, and cross-pairs)
          for (const from of currencies) {
            for (const to of currencies) {
              if (from === to) continue;
              let rate;
              if (from === 'USD') {
                rate = rates[to];
              } else if (to === 'USD') {
                rate = 1 / rates[from];
              } else {
                rate = rates[to] / rates[from];
              }
              if (!rate) continue;

              // Calculate fee using configuration
              const feePercentage = pricingService.calculateFeePercentage(from, to);

              await db('exchange_rates')
                .insert({
                  from_currency: from,
                  to_currency: to,
                  rate,
                  fee_percentage: feePercentage
                })
                .onConflict(['from_currency', 'to_currency'])
                .merge();
              updatedCount++;
            }
          }
          
          console.log(`Exchange rates updated from API: ${updatedCount} pairs`);
          return { updated: updatedCount, source: 'api' };
        } catch (apiError) {
          console.warn('API failed, falling back to local rates:', apiError.message);
        }
      }

      // Fallback to enhanced local rate model
      source = 'local';
      updatedCount = await pricingService.updateLocalExchangeRates();
      
      console.log(`Exchange rates updated from local model: ${updatedCount} pairs`);
      return { updated: updatedCount, source: 'local' };
      
    } catch (error) {
      console.error('Error updating exchange rates:', error);
      throw error;
    }
  },

  /**
   * Enhanced local exchange rate model with realistic fluctuations
   * Based on Central Bank rates and market trends
   * @returns {number} Number of updated rate pairs
   */
  updateLocalExchangeRates: async () => {
    try {
      // Base rates from recent Central Bank data (as of August 2025)
      const baseRates = {
        // USD to major currencies
        'USD_NGN': 1580.25,  // Nigerian Naira
        'USD_GBP': 0.7842,   // British Pound
        'USD_EUR': 0.8567,   // Euro
        'USD_CBUSD': 1.0,    // CBUSD pegged to USD
        
        // Additional pairs for comprehensive coverage
        'GBP_NGN': 2015.80,
        'EUR_NGN': 1845.50,
        'GBP_EUR': 1.0925,
      };

      // Get current time to create realistic fluctuations
      const now = new Date();
      const timeOfDay = now.getHours() + (now.getMinutes() / 60);
      const dayOfWeek = now.getDay();
      
      let updatedCount = 0;
      const currencies = ['USD', 'NGN', 'GBP', 'EUR', 'CBUSD'];

      // Calculate rates for all currency pairs
      for (const from of currencies) {
        for (const to of currencies) {
          if (from === to) continue;

          let baseRate = this.calculateCrossRate(from, to, baseRates);
          
          // Apply realistic market fluctuations
          const fluctuatedRate = this.applyMarketFluctuations(
            baseRate, 
            from, 
            to, 
            timeOfDay, 
            dayOfWeek
          );

          // Store in database
          await db('exchange_rates')
            .insert({
              from_currency: from,
              to_currency: to,
              rate: fluctuatedRate,
              fee_percentage: this.calculateFeePercentage(from, to),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .onConflict(['from_currency', 'to_currency'])
            .merge(['rate', 'updated_at']);

          updatedCount++;
        }
      }

      return updatedCount;
    } catch (error) {
      console.error('Error updating local exchange rates:', error);
      throw error;
    }
  },

  /**
   * Calculate cross-currency rates from base pairs
   * @param {string} from - Source currency
   * @param {string} to - Target currency  
   * @param {Object} baseRates - Base rate pairs
   * @returns {number} Calculated rate
   */
  calculateCrossRate: (from, to, baseRates) => {
    // Direct pair
    const directKey = `${from}_${to}`;
    if (baseRates[directKey]) {
      return baseRates[directKey];
    }

    // Reverse pair
    const reverseKey = `${to}_${from}`;
    if (baseRates[reverseKey]) {
      return 1 / baseRates[reverseKey];
    }

    // Cross rate via USD
    const fromUsdKey = `USD_${from}`;
    const toUsdKey = `USD_${to}`;
    const usdFromKey = `${from}_USD`;
    const usdToKey = `${to}_USD`;

    if (baseRates[fromUsdKey] && baseRates[toUsdKey]) {
      return baseRates[toUsdKey] / baseRates[fromUsdKey];
    }

    if (baseRates[usdFromKey] && baseRates[usdToKey]) {
      return baseRates[usdFromKey] / baseRates[usdToKey];
    }

    if (baseRates[fromUsdKey] && baseRates[usdToKey]) {
      return baseRates[usdToKey] / baseRates[fromUsdKey];
    }

    if (baseRates[usdFromKey] && baseRates[toUsdKey]) {
      return baseRates[toUsdKey] * baseRates[usdFromKey];
    }

    // Default fallback
    console.warn(`No rate calculation possible for ${from} to ${to}, using 1.0`);
    return 1.0;
  },

  /**
   * Apply realistic market fluctuations based on time and market conditions
   * @param {number} baseRate - Base exchange rate
   * @param {string} from - Source currency
   * @param {string} to - Target currency
   * @param {number} timeOfDay - Hour of day (0-24)
   * @param {number} dayOfWeek - Day of week (0-6)
   * @returns {number} Fluctuated rate
   */
  applyMarketFluctuations: (baseRate, from, to, timeOfDay, dayOfWeek) => {
    let fluctuation = 0;

    // Base random fluctuation (±0.5%)
    fluctuation += (Math.random() - 0.5) * 0.01;

    // Time-based fluctuations (market hours)
    if (timeOfDay >= 8 && timeOfDay <= 17) {
      // Higher volatility during business hours
      fluctuation += (Math.random() - 0.5) * 0.008;
    } else {
      // Lower volatility outside business hours
      fluctuation += (Math.random() - 0.5) * 0.003;
    }

    // Weekend effects (lower volatility)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      fluctuation *= 0.5;
    }

    // Currency-specific volatility
    const volatilityMultipliers = {
      'NGN': 1.5,    // Higher volatility for emerging market currencies
      'GBP': 1.0,    // Standard volatility
      'EUR': 0.8,    // Lower volatility for stable currencies
      'USD': 0.7,    // Base currency, lowest volatility
      'CBUSD': 0.1   // Stablecoin, minimal volatility
    };

    const fromMultiplier = volatilityMultipliers[from] || 1.0;
    const toMultiplier = volatilityMultipliers[to] || 1.0;
    const avgMultiplier = (fromMultiplier + toMultiplier) / 2;

    fluctuation *= avgMultiplier;

    // Ensure fluctuation doesn't exceed reasonable bounds (±3%)
    fluctuation = Math.max(-0.03, Math.min(0.03, fluctuation));

    return baseRate * (1 + fluctuation);
  },

  /**
   * Calculate appropriate fee percentage based on currency pair
   * @param {string} from - Source currency
   * @param {string} to - Target currency
   * @returns {number} Fee percentage
   */
  calculateFeePercentage: (from, to) => {
    const config = exchangeRateConfig.local.fees;
    let baseFee = config.baseFee;

    // Apply currency-specific adjustments
    const adjustments = config.currencyAdjustments;
    
    // Check if either currency is a stablecoin
    if (adjustments.stable.currencies.includes(from) || 
        adjustments.stable.currencies.includes(to)) {
      return baseFee * adjustments.stable.multiplier;
    }

    // Check if both currencies are major
    const majorCurrencies = adjustments.major.currencies;
    if (majorCurrencies.includes(from) && majorCurrencies.includes(to)) {
      return baseFee * adjustments.major.multiplier;
    }

    // Check if either currency is exotic
    const exoticCurrencies = adjustments.exotic.currencies;
    if (exoticCurrencies.includes(from) || exoticCurrencies.includes(to)) {
      return baseFee * adjustments.exotic.multiplier;
    }

    return baseFee;
  },

  /**
   * Update exchange rates using local model (fallback when API is unavailable)
   * @returns {Object} Status of the local update
   */
  updateLocalExchangeRates: async () => {
    try {
      const currencies = exchangeRateConfig.currencies.all;
      const baseRates = exchangeRateConfig.local.baseRates;
      let updatedCount = 0;

      // Update all currency pairs
      for (const from of currencies) {
        for (const to of currencies) {
          if (from === to) continue;

          // Calculate rate using base rates and cross-rate logic
          let rate = pricingService.calculateCrossRate(from, to, baseRates);
          
          if (!rate) continue;

          // Apply market fluctuations
          rate = pricingService.applyMarketFluctuations(rate, from, to);

          // Calculate fee percentage
          const feePercentage = pricingService.calculateFeePercentage(from, to);

          await db('exchange_rates')
            .insert({
              from_currency: from,
              to_currency: to,
              rate,
              fee_percentage: feePercentage
            })
            .onConflict(['from_currency', 'to_currency'])
            .merge();
          
          updatedCount++;
        }
      }

      if (exchangeRateConfig.logging.logLocalFallbacks) {
        console.log(`Local exchange rates updated successfully. Updated ${updatedCount} rates.`);
      }

      return {
        success: true,
        source: 'local',
        updated_count: updatedCount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error updating local exchange rates:', error);
      return {
        success: false,
        source: 'local',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
};

module.exports = pricingService;