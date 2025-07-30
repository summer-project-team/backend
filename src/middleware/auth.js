const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const { AppError } = require('./errorHandler');
const asyncHandler = require('express-async-handler');
const { db } = require('../utils/database');

// Protect routes
exports.protect = asyncHandler(async (req, res, next) => {
  // Get token from header
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Check if token exists
  if (!token) {
    return next(new AppError('Not authorized to access this route', 401));
  }

  try {
    // Verify token
    const decoded = await promisify(jwt.verify)(
      token,
      process.env.JWT_SECRET
    );

    // Check if user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('User no longer exists', 401));
    }

    // Grant access to protected route
    req.user = user;
    next();
  } catch (error) {
    return next(new AppError('Not authorized to access this route', 401));
  }
});

// Restrict to specific roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    next();
  };
};

// API Key authentication for bank integrations
exports.apiKeyAuth = asyncHandler(async (req, res, next) => {
  // Get API key and secret from headers
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];

  if (!apiKey || !apiSecret) {
    return next(new AppError('API credentials required', 401));
  }

  try {
    // Verify API credentials
    const bank = await db('bank_integrations')
      .where({
        api_key: apiKey,
        api_secret: apiSecret,
        is_active: true
      })
      .first();
    
    if (!bank) {
      return next(new AppError('Invalid API credentials', 401));
    }

    // Attach bank info to request
    req.bank = {
      id: bank.id,
      name: bank.bank_name,
      code: bank.bank_code,
      country_code: bank.country_code
    };

    next();
  } catch (error) {
    return next(new AppError('Authentication failed', 401));
  }
}); 