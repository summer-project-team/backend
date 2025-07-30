/**
 * Payment Fallback Service
 * Provides alternative payment routes when primary routes fail
 */
const { db } = require('../utils/database');
const redis = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class FallbackService {
  constructor() {
    this.routeCache = 'payment_routes:cache';
    this.routePerformance = 'payment_routes:performance';
    
    // Define payment route providers
    this.providers = {
      // Primary providers
      'primary': [
        'default_bank_provider',
        'bank_transfer_api',
        'internal_wallet'
      ],
      // Secondary providers for fallbacks
      'secondary': [
        'alternative_bank_api',
        'p2p_network',
        'agent_network'
      ],
      // Last resort providers
      'fallback': [
        'manual_processing',
        'partner_network',
        'crypto_bridge'
      ]
    };
    
    // Route priority (lower is better)
    this.routePriority = {
      'default_bank_provider': 10,
      'bank_transfer_api': 20,
      'internal_wallet': 30,
      'alternative_bank_api': 100,
      'p2p_network': 200,
      'agent_network': 300,
      'manual_processing': 800,
      'partner_network': 900,
      'crypto_bridge': 1000
    };
    
    // Initial route success rates
    this.defaultSuccessRates = {
      'default_bank_provider': 0.98,
      'bank_transfer_api': 0.95,
      'internal_wallet': 0.99,
      'alternative_bank_api': 0.90,
      'p2p_network': 0.85,
      'agent_network': 0.80,
      'manual_processing': 0.99,
      'partner_network': 0.75,
      'crypto_bridge': 0.98
    };
    
    // Route speed in seconds (lower is better)
    this.routeSpeed = {
      'default_bank_provider': 60,
      'bank_transfer_api': 30,
      'internal_wallet': 5,
      'alternative_bank_api': 120,
      'p2p_network': 10,
      'agent_network': 300,
      'manual_processing': 3600,
      'partner_network': 900,
      'crypto_bridge': 60
    };
    
    // Route cost factor (lower is better)
    this.routeCost = {
      'default_bank_provider': 1.0,
      'bank_transfer_api': 1.2,
      'internal_wallet': 0.1,
      'alternative_bank_api': 1.5,
      'p2p_network': 0.8,
      'agent_network': 2.0,
      'manual_processing': 5.0,
      'partner_network': 1.8,
      'crypto_bridge': 0.5
    };
  }

  /**
   * Get optimal payment route based on corridor and amount
   * @param {string} sourceCurrency - Source currency code
   * @param {string} targetCurrency - Target currency code
   * @param {number} amount - Transaction amount
   * @param {string} countryFrom - Source country code
   * @param {string} countryTo - Target country code
   * @param {Object} options - Additional options (speed_priority, cost_priority)
   * @returns {Promise<Object>} Selected route with fallbacks
   */
  async getOptimalRoute(sourceCurrency, targetCurrency, amount, countryFrom, countryTo, options = {}) {
    try {
      const corridorKey = `${sourceCurrency}_${targetCurrency}_${countryFrom}_${countryTo}`;
      
      // Check cache first
      const cachedRoute = await redis.getCache(`${this.routeCache}:${corridorKey}`);
      if (cachedRoute && !options.bypass_cache) {
        return cachedRoute;
      }
      
      // Get route performance data
      const performanceData = await this._getRoutePerformance(corridorKey);
      
      // Score all available routes
      const routeScores = await this._scoreRoutes(
        performanceData,
        amount,
        options
      );
      
      // Select top routes for primary, secondary, and fallback
      const selectedRoutes = {
        primary: this._selectTopRoute(routeScores, this.providers.primary),
        secondary: this._selectTopRoute(routeScores, this.providers.secondary),
        fallback: this._selectTopRoute(routeScores, this.providers.fallback)
      };
      
      // Add metadata
      const routeInfo = {
        corridor: {
          from_currency: sourceCurrency,
          to_currency: targetCurrency,
          from_country: countryFrom,
          to_country: countryTo,
          amount: amount
        },
        routes: selectedRoutes,
        generated_at: new Date().toISOString(),
        route_id: uuidv4()
      };
      
      // Cache the result for 5 minutes
      await redis.setCache(`${this.routeCache}:${corridorKey}`, routeInfo, 300);
      
      return routeInfo;
    } catch (error) {
      console.error('Error getting optimal route:', error);
      
      // Return a default route if there's an error
      return {
        corridor: {
          from_currency: sourceCurrency,
          to_currency: targetCurrency,
          from_country: countryFrom,
          to_country: countryTo,
          amount: amount
        },
        routes: {
          primary: {
            provider: 'internal_wallet',
            score: 100,
            estimated_time: this.routeSpeed['internal_wallet'],
            cost_factor: this.routeCost['internal_wallet']
          },
          secondary: {
            provider: 'default_bank_provider',
            score: 90,
            estimated_time: this.routeSpeed['default_bank_provider'],
            cost_factor: this.routeCost['default_bank_provider']
          },
          fallback: {
            provider: 'crypto_bridge',
            score: 80,
            estimated_time: this.routeSpeed['crypto_bridge'],
            cost_factor: this.routeCost['crypto_bridge']
          }
        },
        generated_at: new Date().toISOString(),
        route_id: uuidv4(),
        is_fallback_route: true
      };
    }
  }
  
  /**
   * Get route based on transaction details
   * @param {Object} transaction - Transaction object
   * @param {boolean} useFallback - Whether to use fallback route
   * @returns {Promise<Object>} Route information
   */
  async getRouteForTransaction(transaction, useFallback = false) {
    try {
      const sourceCurrency = transaction.currency_from;
      const targetCurrency = transaction.currency_to;
      
      // Extract country codes from metadata if available
      const metadata = JSON.parse(transaction.metadata || '{}');
      const countryFrom = metadata.sender_country || 'US';
      const countryTo = metadata.recipient_country || 'US';
      
      // Get optimal route
      const routeInfo = await this.getOptimalRoute(
        sourceCurrency, 
        targetCurrency, 
        transaction.amount,
        countryFrom,
        countryTo
      );
      
      // Determine which route to use based on useFallback
      let selectedRoute;
      if (useFallback) {
        // If primary failed, use secondary
        if (metadata.failed_providers && metadata.failed_providers.includes(routeInfo.routes.primary.provider)) {
          // If secondary also failed, use fallback
          if (metadata.failed_providers.includes(routeInfo.routes.secondary.provider)) {
            selectedRoute = routeInfo.routes.fallback;
          } else {
            selectedRoute = routeInfo.routes.secondary;
          }
        } else {
          // Primary route hasn't failed yet, use it
          selectedRoute = routeInfo.routes.primary;
        }
      } else {
        // No fallback requested, use primary route
        selectedRoute = routeInfo.routes.primary;
      }
      
      return {
        ...routeInfo,
        selected_route: selectedRoute
      };
    } catch (error) {
      console.error('Error getting route for transaction:', error);
      
      // Return default route
      return {
        corridor: {
          from_currency: transaction.currency_from,
          to_currency: transaction.currency_to,
          amount: transaction.amount
        },
        selected_route: {
          provider: 'internal_wallet',
          score: 100,
          estimated_time: 5,
          cost_factor: 0.1
        },
        is_default_route: true,
        generated_at: new Date().toISOString(),
        route_id: uuidv4()
      };
    }
  }
  
  /**
   * Report route success or failure for performance tracking
   * @param {string} routeId - Route ID
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether the route was successful
   * @param {number} durationMs - Processing duration in milliseconds
   * @param {string} failureReason - Failure reason if applicable
   */
  async reportRoutePerformance(routeId, provider, success, durationMs, failureReason = null) {
    try {
      // Get route info
      const routeKey = `route:${routeId}`;
      const route = await redis.getCache(routeKey);
      
      if (!route) {
        // Route not found, still log performance but with less info
        await this._updateProviderStats(provider, success, durationMs);
        return;
      }
      
      // Extract corridor info
      const { from_currency, to_currency, from_country, to_country } = route.corridor;
      const corridorKey = `${from_currency}_${to_currency}_${from_country}_${to_country}`;
      
      // Update corridor-specific performance
      await this._updateCorridorStats(corridorKey, provider, success, durationMs);
      
      // Update overall provider stats
      await this._updateProviderStats(provider, success, durationMs);
      
      // Record event in DB for analytics
      await db('payment_route_events').insert({
        route_id: routeId,
        provider,
        corridor_key: corridorKey,
        success,
        duration_ms: durationMs,
        failure_reason: failureReason,
        created_at: new Date()
      });
      
    } catch (error) {
      console.error('Error reporting route performance:', error);
    }
  }
  
  /**
   * Update provider performance statistics
   * @private
   */
  async _updateProviderStats(provider, success, durationMs) {
    try {
      const key = `provider:${provider}`;
      const stats = await redis.getCache(key) || {
        total_count: 0,
        success_count: 0,
        failure_count: 0,
        total_duration_ms: 0,
        avg_duration_ms: 0,
        last_updated: null
      };
      
      // Update stats
      stats.total_count++;
      if (success) {
        stats.success_count++;
      } else {
        stats.failure_count++;
      }
      stats.total_duration_ms += durationMs;
      stats.avg_duration_ms = Math.round(stats.total_duration_ms / stats.total_count);
      stats.last_updated = new Date().toISOString();
      
      // Store updated stats for 7 days
      await redis.setCache(key, stats, 7 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error updating provider stats:', error);
    }
  }
  
  /**
   * Update corridor-specific performance statistics
   * @private
   */
  async _updateCorridorStats(corridorKey, provider, success, durationMs) {
    try {
      const key = `${this.routePerformance}:${corridorKey}:${provider}`;
      const stats = await redis.getCache(key) || {
        total_count: 0,
        success_count: 0,
        failure_count: 0,
        total_duration_ms: 0,
        avg_duration_ms: 0,
        success_rate: this.defaultSuccessRates[provider] || 0.9,
        last_updated: null
      };
      
      // Update stats
      stats.total_count++;
      if (success) {
        stats.success_count++;
      } else {
        stats.failure_count++;
      }
      stats.total_duration_ms += durationMs;
      stats.avg_duration_ms = Math.round(stats.total_duration_ms / stats.total_count);
      stats.success_rate = stats.success_count / stats.total_count;
      stats.last_updated = new Date().toISOString();
      
      // Store updated stats for 30 days
      await redis.setCache(key, stats, 30 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error updating corridor stats:', error);
    }
  }
  
  /**
   * Get performance data for all providers in a corridor
   * @private
   */
  async _getRoutePerformance(corridorKey) {
    const results = {};
    const allProviders = [
      ...this.providers.primary,
      ...this.providers.secondary,
      ...this.providers.fallback
    ];
    
    // Get performance data for each provider
    for (const provider of allProviders) {
      const key = `${this.routePerformance}:${corridorKey}:${provider}`;
      const stats = await redis.getCache(key);
      
      if (stats) {
        results[provider] = stats;
      } else {
        // Use default values if no stats exist
        results[provider] = {
          success_rate: this.defaultSuccessRates[provider] || 0.9,
          avg_duration_ms: this.routeSpeed[provider] * 1000 || 10000,
          cost_factor: this.routeCost[provider] || 1.0
        };
      }
    }
    
    return results;
  }
  
  /**
   * Score all available routes based on performance and preferences
   * @private
   */
  async _scoreRoutes(performanceData, amount, options) {
    const scores = {};
    const speedWeight = options.speed_priority ? 2 : 1;
    const costWeight = options.cost_priority ? 2 : 1;
    const successWeight = 3; // Success rate is always important
    
    // Adjust weights based on amount
    const isHighValue = amount > 10000;
    const successBoost = isHighValue ? 2 : 1;
    
    // Score each provider
    for (const provider in performanceData) {
      const data = performanceData[provider];
      const priority = this.routePriority[provider] || 500;
      
      // Calculate weighted score (higher is better)
      const successScore = (data.success_rate || 0.5) * 100 * successWeight * successBoost;
      const speedScore = (1 / (data.avg_duration_ms || 10000)) * 10000 * speedWeight;
      const costScore = (1 / (data.cost_factor || 1)) * 100 * costWeight;
      const priorityScore = (1000 - priority) / 10; // Convert priority to score
      
      // Combine scores
      scores[provider] = {
        provider,
        score: Math.round(successScore + speedScore + costScore + priorityScore),
        success_rate: data.success_rate || this.defaultSuccessRates[provider] || 0.9,
        avg_duration_ms: data.avg_duration_ms || this.routeSpeed[provider] * 1000,
        cost_factor: data.cost_factor || this.routeCost[provider],
        priority
      };
    }
    
    return scores;
  }
  
  /**
   * Select top route from a set of providers
   * @private
   */
  _selectTopRoute(scores, providers) {
    // Filter to only the provided set of providers
    const filteredScores = providers.map(provider => scores[provider]);
    
    // Sort by score (highest first)
    filteredScores.sort((a, b) => b.score - a.score);
    
    // Return the best route
    const bestRoute = filteredScores[0];
    
    return {
      provider: bestRoute.provider,
      score: bestRoute.score,
      estimated_time: Math.round(bestRoute.avg_duration_ms / 1000),
      cost_factor: bestRoute.cost_factor,
      success_rate: bestRoute.success_rate
    };
  }
  
  /**
   * Process transaction using selected route
   * @param {Object} transaction - Transaction object
   * @param {Object} route - Route object
   * @returns {Promise<Object>} Processing result
   */
  async processTransactionWithRoute(transaction, route) {
    const startTime = Date.now();
    let success = false;
    let result;
    let failureReason = null;
    
    try {
      console.log(`Processing transaction ${transaction.id} with provider: ${route.provider}`);
      
      // Different processing based on provider
      switch (route.provider) {
        case 'internal_wallet':
          result = await this._processInternalWallet(transaction);
          break;
          
        case 'default_bank_provider':
          result = await this._processBankProvider(transaction);
          break;
          
        case 'bank_transfer_api':
          result = await this._processBankTransferApi(transaction);
          break;
          
        case 'crypto_bridge':
          result = await this._processCryptoBridge(transaction);
          break;
          
        default:
          // For demo, assume other providers succeed
          result = {
            success: true,
            provider: route.provider,
            transaction_id: transaction.id,
            processed_at: new Date().toISOString()
          };
      }
      
      success = result.success;
      
      if (!success) {
        failureReason = result.error || 'Unknown failure';
      }
      
    } catch (error) {
      console.error(`Error processing transaction with ${route.provider}:`, error);
      failureReason = error.message;
      result = {
        success: false,
        error: error.message,
        provider: route.provider,
        transaction_id: transaction.id
      };
    } finally {
      // Record performance regardless of outcome
      const duration = Date.now() - startTime;
      await this.reportRoutePerformance(
        route.route_id,
        route.provider,
        success,
        duration,
        failureReason
      );
    }
    
    return result;
  }
  
  /**
   * Process transaction through internal wallet
   * @private
   */
  async _processInternalWallet(transaction) {
    // In a real implementation, this would handle internal wallet transfers
    return {
      success: true,
      provider: 'internal_wallet',
      transaction_id: transaction.id,
      processed_at: new Date().toISOString()
    };
  }
  
  /**
   * Process transaction through bank provider
   * @private
   */
  async _processBankProvider(transaction) {
    // In a real implementation, this would call the bank provider API
    return {
      success: true,
      provider: 'default_bank_provider',
      transaction_id: transaction.id,
      processed_at: new Date().toISOString()
    };
  }
  
  /**
   * Process transaction through bank transfer API
   * @private
   */
  async _processBankTransferApi(transaction) {
    // In a real implementation, this would call a different bank API
    return {
      success: true,
      provider: 'bank_transfer_api',
      transaction_id: transaction.id,
      processed_at: new Date().toISOString()
    };
  }
  
  /**
   * Process transaction through crypto bridge
   * @private
   */
  async _processCryptoBridge(transaction) {
    // In a real implementation, this would handle crypto conversion and bridge
    return {
      success: true,
      provider: 'crypto_bridge',
      transaction_id: transaction.id,
      processed_at: new Date().toISOString()
    };
  }
}

// Create singleton instance
const fallbackService = new FallbackService();

module.exports = fallbackService; 