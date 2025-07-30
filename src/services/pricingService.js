const { db } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const { setCache, getCache } = require('../utils/redis');
const axios = require('axios');

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
   * This is a mock implementation. In a real app, you'd fetch from an API.
   * @returns {Object} Status of the update
   */
  updateExchangeRates: async () => {
    try {
      const appId = process.env.OPENEXCHANGERATES_APP_ID;
      if (!appId) throw new Error('Missing Open Exchange Rates APP_ID');

      // Fetch latest rates (base: USD)
      const response = await axios.get(
        `https://openexchangerates.org/api/latest.json?app_id=${appId}`
      );
      const rates = response.data.rates;

      // Define the currencies you care about
      const currencies = ['USD', 'NGN', 'GBP', 'EUR'];
      let updatedCount = 0;

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

        await db('exchange_rates')
            .insert({
              from_currency: from,
              to_currency: to,
              rate,
              fee_percentage: 0.005 // or your logic
            })
            .onConflict(['from_currency', 'to_currency'])
            .merge();
        updatedCount++;
        }
      }
      return { updated: updatedCount };
    } catch (error) {
      console.error('Error updating exchange rates from API:', error);
      throw error;
    }
  }
};

module.exports = pricingService;