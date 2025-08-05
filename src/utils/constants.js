/**
 * Application Constants
 * Centralized location for shared constants to avoid duplication
 */

// Supported currencies
const SUPPORTED_CURRENCIES = ['NGN', 'GBP', 'USD'];

// Error messages
const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  WALLET_NOT_FOUND: 'Wallet not found',
  INVALID_CURRENCY: 'Invalid currency',
  INVALID_CREDENTIALS: 'Invalid credentials',
  ACCESS_DENIED_ADMIN: 'Access denied. Admin privileges required.',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  INVALID_PIN: 'Invalid PIN',
  PIN_REQUIRED: 'Transaction PIN is required',
  PIN_MISMATCH: 'PIN confirmation does not match',
  PIN_INVALID_LENGTH: 'PIN must be exactly 4 digits',
  UNAUTHORIZED: 'Not authorized to access this route',
  FORBIDDEN: 'You do not have permission to perform this action',
  VALIDATION_ERROR: 'Validation error',
  PHONE_VALIDATION_ERROR: 'Invalid phone number',
  EMAIL_IN_USE: 'Email already in use',
  USER_EXISTS: 'User with this phone number already exists'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// PIN Configuration
const PIN_CONFIG = {
  LENGTH: 4,
  ATTEMPTS_LIMIT: 3,
  LOCKOUT_DURATION: 300000 // 5 minutes in milliseconds
};

// Rate Limiting
const RATE_LIMITS = {
  VERIFICATION_SENDS_PER_HOUR: 5,
  VERIFICATION_ATTEMPTS_PER_HOUR: 3,
  LOGIN_ATTEMPTS_PER_HOUR: 10,
  TRANSACTION_ATTEMPTS_PER_MINUTE: 5
};

// Transaction Limits
const TRANSACTION_LIMITS = {
  MIN_AMOUNT: 0.01,
  MAX_AMOUNT: 1000000,
  DAILY_LIMIT: 100000,
  // Currency-specific high value thresholds
  HIGH_VALUE_THRESHOLDS: {
    NGN: 50000,    // 50,000 NGN ≈ $60 USD
    GBP: 50,       // £50 ≈ $60 USD  
    USD: 60,       // $60 USD
    CBUSD: 60      // 60 CBUSD ≈ $60 USD
  }
};

// Helper function to get high value threshold for a currency
const getHighValueThreshold = (currency) => {
  return TRANSACTION_LIMITS.HIGH_VALUE_THRESHOLDS[currency] || 60; // Default to $60 equivalent
};

// Helper function to get country code from currency
const getCurrencyCountryCode = (currency) => {
  const currencyToCountry = {
    'NGN': '+234',  // Nigeria
    'GBP': '+44',   // United Kingdom  
    'USD': '+1',    // United States
    // CBUSD is borderless, so we return null and let the caller decide
    'CBUSD': null   // Universal token - no specific country
  };
  return currencyToCountry[currency.toUpperCase()];
};

module.exports = {
  SUPPORTED_CURRENCIES,
  ERROR_MESSAGES,
  HTTP_STATUS,
  PIN_CONFIG,
  RATE_LIMITS,
  TRANSACTION_LIMITS,
  getHighValueThreshold,
  getCurrencyCountryCode
};
