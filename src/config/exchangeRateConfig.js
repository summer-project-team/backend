/**
 * Exchange Rate Configuration
 * Central configuration for exchange rate system
 */

const exchangeRateConfig = {
  // API Configuration
  api: {
    // Set to false to force local mode
    enabled: process.env.EXCHANGE_RATE_API_ENABLED !== 'false',
    
    // Open Exchange Rates API
    openExchangeRates: {
      appId: process.env.OPENEXCHANGERATES_APP_ID,
      baseUrl: 'https://openexchangerates.org/api',
      timeout: 5000,
      retryAttempts: 2
    },
    
    // Alternative APIs (for future use)
    alternatives: {
      // Fixer.io
      fixer: {
        apiKey: process.env.FIXER_API_KEY,
        baseUrl: 'http://data.fixer.io/api',
        enabled: false
      },
      
      // CurrencyAPI
      currencyApi: {
        apiKey: process.env.CURRENCYAPI_KEY,
        baseUrl: 'https://api.currencyapi.com/v3',
        enabled: false
      }
    }
  },

  // Local Rate Model Configuration
  local: {
    // Base rates (updated August 2025)
    baseRates: {
      // Major currency pairs (USD base)
      'USD_NGN': 1580.25,  // Nigerian Naira
      'USD_GBP': 0.7842,   // British Pound
      'USD_EUR': 0.8567,   // Euro
      'USD_CBUSD': 1.0,    // CBUSD stablecoin
      
      // Cross pairs for better accuracy
      'GBP_NGN': 2015.80,
      'EUR_NGN': 1845.50,
      'GBP_EUR': 1.0925,
      
      // Additional emerging market rates
      'USD_KES': 128.40,   // Kenyan Shilling
      'USD_GHS': 12.85,    // Ghanaian Cedi
      'USD_ZAR': 18.75     // South African Rand
    },

    // Volatility settings for realistic fluctuations
    volatility: {
      // Base fluctuation range (±%)
      baseFluctuation: 0.005, // ±0.5%
      
      // Currency-specific multipliers
      currencyMultipliers: {
        'NGN': 1.5,    // Higher volatility for emerging markets
        'KES': 1.4,
        'GHS': 1.3,
        'ZAR': 1.2,
        'GBP': 1.0,    // Standard volatility
        'EUR': 0.8,    // Lower volatility for stable currencies
        'USD': 0.7,    // Base currency
        'CBUSD': 0.1   // Stablecoin, minimal volatility
      },

      // Time-based multipliers
      marketHours: {
        businessHours: 1.5,    // 9 AM - 5 PM UTC
        afterHours: 0.6,       // Outside business hours
        weekend: 0.3           // Saturday/Sunday
      },

      // Maximum deviation from base rates
      maxDeviation: 0.10 // ±10%
    },

    // Fee structure
    fees: {
      // Base fee percentage
      baseFee: 0.005, // 0.5%
      
      // Currency-specific adjustments
      currencyAdjustments: {
        // Major pairs (lower fees)
        major: {
          currencies: ['USD', 'EUR', 'GBP'],
          multiplier: 0.8 // 20% lower
        },
        
        // Exotic pairs (higher fees)
        exotic: {
          currencies: ['NGN', 'KES', 'GHS', 'ZAR'],
          multiplier: 1.2 // 20% higher
        },
        
        // Stablecoin pairs (lowest fees)
        stable: {
          currencies: ['CBUSD'],
          multiplier: 0.5 // 50% lower
        }
      }
    }
  },

  // Update intervals and caching
  timing: {
    // How often to update rates (milliseconds)
    updateInterval: 30000, // 30 seconds
    
    // Cache duration for quotes
    quoteCacheDuration: 900, // 15 minutes
    
    // Rate lock maximum duration
    maxLockDuration: 300, // 5 minutes
    
    // API retry delays
    retryDelays: [1000, 3000, 5000] // 1s, 3s, 5s
  },

  // Supported currencies
  currencies: {
    // Primary supported currencies
    primary: ['USD', 'NGN', 'GBP', 'EUR', 'CBUSD'],
    
    // Secondary supported currencies
    secondary: ['KES', 'GHS', 'ZAR'],
    
    // All supported currencies
    all: ['USD', 'NGN', 'GBP', 'EUR', 'CBUSD', 'KES', 'GHS', 'ZAR'],
    
    // Currency metadata
    metadata: {
      'USD': { name: 'US Dollar', symbol: '$', decimals: 2 },
      'NGN': { name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
      'GBP': { name: 'British Pound', symbol: '£', decimals: 4 },
      'EUR': { name: 'Euro', symbol: '€', decimals: 4 },
      'CBUSD': { name: 'CrossBridge USD', symbol: '$', decimals: 2 },
      'KES': { name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },
      'GHS': { name: 'Ghanaian Cedi', symbol: '₵', decimals: 2 },
      'ZAR': { name: 'South African Rand', symbol: 'R', decimals: 2 }
    }
  },

  // Market hours and status
  market: {
    // Market operating hours (UTC)
    hours: {
      open: 9,  // 9 AM UTC
      close: 17 // 5 PM UTC
    },
    
    // Days market is open (0 = Sunday, 6 = Saturday)
    operatingDays: [1, 2, 3, 4, 5], // Monday to Friday
    
    // Holiday calendar (dates when market is closed)
    holidays: [
      '2025-01-01', // New Year's Day
      '2025-07-04', // Independence Day
      '2025-12-25'  // Christmas Day
      // Add more holidays as needed
    ]
  },

  // Logging and monitoring
  logging: {
    // Log level for exchange rate operations
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    
    // Log rate updates
    logUpdates: true,
    
    // Log API failures
    logApiFailures: true,
    
    // Log local fallbacks
    logLocalFallbacks: true
  },

  // Development and testing
  development: {
    // Force local mode for development
    forceLocalMode: process.env.NODE_ENV === 'development' && 
                   process.env.FORCE_LOCAL_RATES === 'true',
    
    // Accelerated updates for testing
    fastUpdates: process.env.FAST_RATE_UPDATES === 'true',
    
    // Mock API responses
    mockApi: process.env.MOCK_EXCHANGE_API === 'true'
  }
};

module.exports = exchangeRateConfig;
