const ExchangeRate = require('../models/ExchangeRate');
const pricingService = require('./pricingService');

/**
 * Service to periodically refresh exchange rates
 */
class RateRefreshService {
  constructor() {
    this.refreshInterval = parseInt(process.env.RATE_REFRESH_INTERVAL) || 30000; // Default 30 seconds
    this.isRunning = false;
    this.intervalId = null;
  }
  
  /**
   * Start the rate refresh service
   */
  start() {
    if (this.isRunning) {
      console.log('Rate refresh service already running');
      return;
    }
    
    console.log(`Starting rate refresh service with interval: ${this.refreshInterval}ms`);
    
    // Initial refresh
    this.refreshRates();
    
    // Set up interval for periodic refreshes
    this.intervalId = setInterval(() => {
      this.refreshRates();
    }, this.refreshInterval);
    
    this.isRunning = true;
  }
  
  /**
   * Stop the rate refresh service
   */
  stop() {
    if (!this.isRunning) {
      console.log('Rate refresh service not running');
      return;
    }
    
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    
    console.log('Rate refresh service stopped');
  }
  
  /**
   * Refresh exchange rates
   */
  async refreshRates() {
    try {
      console.log('Refreshing exchange rates...');
      
      const result = await pricingService.updateExchangeRates();
      
      console.log(`Exchange rates refreshed: ${result.updated} pairs updated`);
    } catch (error) {
      console.error('Error refreshing exchange rates:', error);
    }
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      refreshInterval: this.refreshInterval,
      lastRefresh: this.lastRefresh,
    };
  }
}

// Create singleton instance
const rateRefreshService = new RateRefreshService();

module.exports = rateRefreshService; 