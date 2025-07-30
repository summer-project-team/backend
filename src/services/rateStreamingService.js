/**
 * Rate Streaming Service
 * Provides real-time exchange rate updates via WebSocket
 */
const redis = require('../utils/redis');
const { db } = require('../utils/database');
const ExchangeRate = require('../models/ExchangeRate');
const pricingService = require('./pricingService');

class RateStreamingService {
  constructor() {
    this.websocketServer = null;
    this.clients = new Map(); // Map to track clients and their subscriptions
    this.streamingInterval = 5000; // Update every 5 seconds
    this.updateTimer = null;
    this.supportedCurrencies = ['NGN', 'USD', 'GBP', 'EUR', 'CBUSD'];
    
    // Rate cache keys
    this.rateStreamCache = 'rate_stream:';
    this.rateCacheDuration = 60; // 60 seconds
    
    // Historical data (to avoid redundant streaming of same rates)
    this.lastRates = {};
  }

  /**
   * Initialize the rate streaming service with WebSocket server
   * @param {Object} wss - WebSocket server instance
   * @param {Object} server - HTTP server instance
   */
  initialize(wss, server) {
    console.log('Initializing rate streaming service');
    
    this.websocketServer = wss;
    
    // Set up WebSocket connection handler
    wss.on('connection', (ws) => {
      const clientId = this._generateClientId();
      console.log(`Rate streaming client connected: ${clientId}`);
      
      // Initialize client data
      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(),
        authenticated: false,
        userId: null,
        lastActivity: Date.now()
      });
      
      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleClientMessage(clientId, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          this._sendErrorMessage(clientId, 'Invalid message format');
        }
      });
      
      // Handle client disconnection
      ws.on('close', () => {
        console.log(`Rate streaming client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });
      
      // Send welcome message
      this._sendToClient(clientId, {
        type: 'welcome',
        message: 'Connected to CrossBridge rate streaming service',
        supported_currencies: this.supportedCurrencies,
        supported_pairs: this._getSupportedPairs()
      });
    });
    
    // Start the rate streaming
    this._startRateStreaming();
  }
  
  /**
   * Start streaming rates at regular intervals
   * @private
   */
  _startRateStreaming() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    console.log(`Starting rate streaming (${this.streamingInterval}ms interval)`);
    
    this.updateTimer = setInterval(async () => {
      try {
        await this._broadcastRateUpdates();
      } catch (error) {
        console.error('Error broadcasting rate updates:', error);
      }
    }, this.streamingInterval);
  }
  
  /**
   * Stop rate streaming
   */
  stop() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }
  
  /**
   * Handle client message
   * @param {string} clientId - Client identifier
   * @param {Object} message - Message data
   * @private
   */
  _handleClientMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Update last activity timestamp
    client.lastActivity = Date.now();
    
    switch (message.type) {
      case 'auth':
        this._handleAuth(clientId, message);
        break;
        
      case 'subscribe':
        this._handleSubscribe(clientId, message);
        break;
        
      case 'unsubscribe':
        this._handleUnsubscribe(clientId, message);
        break;
        
      case 'ping':
        this._sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
        break;
        
      default:
        this._sendErrorMessage(clientId, `Unknown message type: ${message.type}`);
    }
  }
  
  /**
   * Handle authentication message
   * @param {string} clientId - Client identifier
   * @param {Object} message - Authentication message
   * @private
   */
  async _handleAuth(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // In a real implementation, verify the token against the auth service
    // For now, we'll simulate authentication success
    client.authenticated = true;
    client.userId = message.userId || 'anonymous';
    
    this._sendToClient(clientId, {
      type: 'auth_result',
      success: true,
      message: 'Authentication successful'
    });
  }
  
  /**
   * Handle subscribe message
   * @param {string} clientId - Client identifier
   * @param {Object} message - Subscribe message
   * @private
   */
  _handleSubscribe(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const { pairs } = message;
    
    if (!pairs || !Array.isArray(pairs)) {
      return this._sendErrorMessage(clientId, 'Invalid subscription request');
    }
    
    // Validate and subscribe to each pair
    const validPairs = pairs.filter(pair => this._isValidPair(pair));
    const invalidPairs = pairs.filter(pair => !this._isValidPair(pair));
    
    validPairs.forEach(pair => client.subscriptions.add(pair));
    
    this._sendToClient(clientId, {
      type: 'subscription_result',
      success: true,
      subscribed: Array.from(client.subscriptions),
      invalid_pairs: invalidPairs
    });
    
    // Send current rates for the subscribed pairs
    this._sendCurrentRates(clientId);
  }
  
  /**
   * Handle unsubscribe message
   * @param {string} clientId - Client identifier
   * @param {Object} message - Unsubscribe message
   * @private
   */
  _handleUnsubscribe(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const { pairs } = message;
    
    if (!pairs || !Array.isArray(pairs)) {
      return this._sendErrorMessage(clientId, 'Invalid unsubscription request');
    }
    
    // Unsubscribe from each pair
    pairs.forEach(pair => client.subscriptions.delete(pair));
    
    this._sendToClient(clientId, {
      type: 'unsubscription_result',
      success: true,
      subscribed: Array.from(client.subscriptions)
    });
  }
  
  /**
   * Broadcast rate updates to all subscribed clients
   * @private
   */
  async _broadcastRateUpdates() {
    // Check if there are any clients
    if (this.clients.size === 0) return;
    
    try {
      // Get current rates for all currency pairs
      const currentRates = await this._getCurrentRates();
      
      // Store rates in cache for quick access
      this._cacheRates(currentRates);
      
      // Send updates to each client based on their subscriptions
      for (const [clientId, client] of this.clients.entries()) {
        // Skip clients with no subscriptions
        if (client.subscriptions.size === 0) continue;
        
        // Filter rates based on client subscriptions
        const clientRates = {};
        
        for (const pair of client.subscriptions) {
          if (currentRates[pair]) {
            // Only send if rate has changed since last update
            const lastRate = this.lastRates[pair];
            const currentRate = currentRates[pair];
            
            if (!lastRate || 
                lastRate.rate !== currentRate.rate || 
                lastRate.change_24h !== currentRate.change_24h) {
              clientRates[pair] = currentRate;
            }
          }
        }
        
        // Only send if there are rates to update
        if (Object.keys(clientRates).length > 0) {
          this._sendToClient(clientId, {
            type: 'rate_update',
            timestamp: Date.now(),
            rates: clientRates
          });
        }
      }
      
      // Update last rates
      this.lastRates = { ...currentRates };
      
    } catch (error) {
      console.error('Error fetching current rates:', error);
    }
  }
  
  /**
   * Cache rates in Redis
   * @param {Object} rates - Current exchange rates
   * @private
   */
  async _cacheRates(rates) {
    try {
      // Store each rate individually with short TTL
      for (const [pair, rateData] of Object.entries(rates)) {
        await redis.setCache(
          `${this.rateStreamCache}${pair}`,
          rateData,
          this.rateCacheDuration
        );
      }
      
      // Store all rates together
      await redis.setCache(
        `${this.rateStreamCache}all`,
        rates,
        this.rateCacheDuration
      );
    } catch (error) {
      console.error('Error caching rates:', error);
    }
  }
  
  /**
   * Get current exchange rates for all pairs
   * @returns {Promise<Object>} Current rates
   * @private
   */
  async _getCurrentRates() {
    try {
      // Try to get from cache first
      const cachedRates = await redis.getCache(`${this.rateStreamCache}all`);
      if (cachedRates) {
        return cachedRates;
      }
      
      // Get from database if not in cache
      const rates = {};
      const pairs = this._getSupportedPairs();
      
      for (const pair of pairs) {
        const [fromCurrency, toCurrency] = pair.split('_');
        
        // Get rate from pricing service
        const quote = await pricingService.generateQuote(fromCurrency, toCurrency, 1000);
        
        // Get historical rate for 24h change
        const yesterdayRate = await this._getHistoricalRate(fromCurrency, toCurrency, 24);
        
        // Calculate change percentage
        const change24h = yesterdayRate 
          ? ((quote.exchange_rate - yesterdayRate) / yesterdayRate) * 100 
          : 0;
        
        rates[pair] = {
          from: fromCurrency,
          to: toCurrency,
          rate: quote.exchange_rate,
          change_24h: parseFloat(change24h.toFixed(2)),
          timestamp: Date.now()
        };
      }
      
      return rates;
    } catch (error) {
      console.error('Error getting current rates:', error);
      return {};
    }
  }
  
  /**
   * Get historical rate from X hours ago
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} hoursAgo - Hours ago
   * @returns {Promise<number|null>} Historical rate or null if not found
   * @private
   */
  async _getHistoricalRate(fromCurrency, toCurrency, hoursAgo = 24) {
    try {
      const pastTime = new Date();
      pastTime.setHours(pastTime.getHours() - hoursAgo);
      
      // Get rate closest to the target time
      const historicalRate = await db('exchange_rates')
        .select('rate')
        .where({
          from_currency: fromCurrency,
          to_currency: toCurrency
        })
        .where('created_at', '<', pastTime)
        .orderBy('created_at', 'desc')
        .first();
      
      return historicalRate ? parseFloat(historicalRate.rate) : null;
    } catch (error) {
      console.error(`Error getting historical rate for ${fromCurrency}/${toCurrency}:`, error);
      return null;
    }
  }
  
  /**
   * Send current rates to a client
   * @param {string} clientId - Client identifier
   * @private
   */
  async _sendCurrentRates(clientId) {
    const client = this.clients.get(clientId);
    if (!client || client.subscriptions.size === 0) return;
    
    try {
      const currentRates = await this._getCurrentRates();
      
      // Filter rates based on client subscriptions
      const clientRates = {};
      for (const pair of client.subscriptions) {
        if (currentRates[pair]) {
          clientRates[pair] = currentRates[pair];
        }
      }
      
      // Send current rates
      this._sendToClient(clientId, {
        type: 'current_rates',
        timestamp: Date.now(),
        rates: clientRates
      });
      
      // Update last rates for this client
      for (const pair of client.subscriptions) {
        if (currentRates[pair]) {
          this.lastRates[pair] = { ...currentRates[pair] };
        }
      }
    } catch (error) {
      console.error('Error sending current rates:', error);
    }
  }
  
  /**
   * Send a message to a specific client
   * @param {string} clientId - Client identifier
   * @param {Object} message - Message to send
   * @private
   */
  _sendToClient(clientId, message) {
    try {
      const client = this.clients.get(clientId);
      if (!client || client.ws.readyState !== 1) return; // 1 = OPEN
      
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
    }
  }
  
  /**
   * Send an error message to a client
   * @param {string} clientId - Client identifier
   * @param {string} errorMessage - Error message
   * @private
   */
  _sendErrorMessage(clientId, errorMessage) {
    this._sendToClient(clientId, {
      type: 'error',
      message: errorMessage
    });
  }
  
  /**
   * Generate a unique client identifier
   * @returns {string} Client ID
   * @private
   */
  _generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Check if a currency pair is valid
   * @param {string} pair - Currency pair (e.g., 'USD_NGN')
   * @returns {boolean} Whether the pair is valid
   * @private
   */
  _isValidPair(pair) {
    if (!pair || typeof pair !== 'string') return false;
    
    const [fromCurrency, toCurrency] = pair.split('_');
    
    return (
      this.supportedCurrencies.includes(fromCurrency) &&
      this.supportedCurrencies.includes(toCurrency) &&
      fromCurrency !== toCurrency
    );
  }
  
  /**
   * Get all supported currency pairs
   * @returns {Array<string>} Supported pairs
   * @private
   */
  _getSupportedPairs() {
    const pairs = [];
    
    for (let i = 0; i < this.supportedCurrencies.length; i++) {
      for (let j = 0; j < this.supportedCurrencies.length; j++) {
        if (i !== j) {
          pairs.push(`${this.supportedCurrencies[i]}_${this.supportedCurrencies[j]}`);
        }
      }
    }
    
    return pairs;
  }
}

// Create singleton instance
const rateStreamingService = new RateStreamingService();

module.exports = rateStreamingService; 