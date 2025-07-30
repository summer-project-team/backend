const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');

/**
 * Create a rate limiter middleware with custom configuration
 * @param {number} maxRequests - Maximum number of requests in the window
 * @param {number} windowMinutes - Time window in minutes
 * @param {string} message - Custom error message
 */
const createRateLimiter = (maxRequests = 60, windowMinutes = 15, message = 'Too many requests, please try again later') => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
      next(new AppError(message, 429));
    },
  });
};

// Pre-configured rate limiters for different endpoints
const apiLimiter = createRateLimiter(100, 15, 'Too many API requests, please try again after 15 minutes');
const authLimiter = process.env.NODE_ENV === 'development' 
  ? createRateLimiter(1000, 15, 'Too many authentication attempts, please try again after 15 minutes')
  : createRateLimiter(10, 15, 'Too many authentication attempts, please try again after 15 minutes');
const transactionLimiter = createRateLimiter(30, 15, 'Too many transaction requests, please try again after 15 minutes');
const lookupLimiter = createRateLimiter(20, 15, 'Too many lookup requests, please try again after 15 minutes');
const ussdLimiter = createRateLimiter(50, 15, 'Too many USSD requests, please try again after 15 minutes');

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  transactionLimiter,
  lookupLimiter,
  ussdLimiter,
}; 