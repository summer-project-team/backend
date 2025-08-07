/**
 * Enhanced global error handling middleware for production
 */
const { v4: uuidv4 } = require('uuid');
const { db } = require('../utils/database');

/**
 * Error classifications for monitoring and alerting
 */
const ERROR_TYPES = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  PAYMENT: 'payment',
  BLOCKCHAIN: 'blockchain',
  EXTERNAL_API: 'external_api',
  DATABASE: 'database',
  RATE_LIMIT: 'rate_limit',
  SYSTEM: 'system'
};

/**
 * Error severity levels
 */
const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Enhanced error handler with structured logging and monitoring
 */
const errorHandler = async (err, req, res, next) => {
  const errorId = uuidv4();
  const timestamp = new Date().toISOString();
  
  // Determine error type and severity
  const errorType = classifyError(err);
  const severity = determineSeverity(err, errorType);
  const statusCode = err.statusCode || 500;
  
  // Create structured error log
  const errorLog = {
    error_id: errorId,
    timestamp,
    type: errorType,
    severity,
    status_code: statusCode,
    message: err.message,
    stack: err.stack,
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: sanitizeHeaders(req.headers),
      user_id: req.user?.id || null,
      ip: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent')
    }
  };

  // Log to console (structured for production log aggregation)
  console.error(JSON.stringify(errorLog));

  // Store critical errors in database for monitoring
  if (severity === ERROR_SEVERITY.HIGH || severity === ERROR_SEVERITY.CRITICAL) {
    try {
      await logErrorToDatabase(errorLog);
    } catch (logError) {
      console.error('Failed to log error to database:', logError.message);
    }
  }

  // Trigger alerts for critical errors
  if (severity === ERROR_SEVERITY.CRITICAL) {
    await triggerAlert(errorLog);
  }

  // Send sanitized error response
  const errorResponse = {
    success: false,
    error: {
      id: errorId,
      message: getPublicErrorMessage(err, errorType),
      type: errorType,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        details: err.message 
      }),
    },
    timestamp
  };

  res.status(statusCode).json(errorResponse);
};

/**
 * Classify error type for monitoring
 */
function classifyError(err) {
  if (err.name === 'ValidationError' || err.statusCode === 400) {
    return ERROR_TYPES.VALIDATION;
  }
  if (err.name === 'AuthenticationError' || err.statusCode === 401) {
    return ERROR_TYPES.AUTHENTICATION;
  }
  if (err.name === 'AuthorizationError' || err.statusCode === 403) {
    return ERROR_TYPES.AUTHORIZATION;
  }
  if (err.message?.includes('payment') || err.message?.includes('stripe') || err.message?.includes('flutterwave')) {
    return ERROR_TYPES.PAYMENT;
  }
  if (err.message?.includes('CBUSD') || err.message?.includes('blockchain')) {
    return ERROR_TYPES.BLOCKCHAIN;
  }
  if (err.message?.includes('External API') || err.statusCode === 502 || err.statusCode === 503) {
    return ERROR_TYPES.EXTERNAL_API;
  }
  if (err.code?.startsWith('ER_') || err.message?.includes('database')) {
    return ERROR_TYPES.DATABASE;
  }
  if (err.statusCode === 429) {
    return ERROR_TYPES.RATE_LIMIT;
  }
  return ERROR_TYPES.SYSTEM;
}

/**
 * Determine error severity
 */
function determineSeverity(err, errorType) {
  if (err.statusCode >= 500) {
    return ERROR_SEVERITY.CRITICAL;
  }
  if (errorType === ERROR_TYPES.PAYMENT || errorType === ERROR_TYPES.BLOCKCHAIN) {
    return ERROR_SEVERITY.HIGH;
  }
  if (errorType === ERROR_TYPES.DATABASE || errorType === ERROR_TYPES.EXTERNAL_API) {
    return ERROR_SEVERITY.MEDIUM;
  }
  return ERROR_SEVERITY.LOW;
}

/**
 * Get user-friendly error message
 */
function getPublicErrorMessage(err, errorType) {
  const publicMessages = {
    [ERROR_TYPES.VALIDATION]: 'Invalid request data provided',
    [ERROR_TYPES.AUTHENTICATION]: 'Authentication required',
    [ERROR_TYPES.AUTHORIZATION]: 'Access denied',
    [ERROR_TYPES.PAYMENT]: 'Payment processing error. Please try again or contact support',
    [ERROR_TYPES.BLOCKCHAIN]: 'Blockchain transaction error. Please try again',
    [ERROR_TYPES.EXTERNAL_API]: 'External service temporarily unavailable',
    [ERROR_TYPES.DATABASE]: 'Data processing error. Please try again',
    [ERROR_TYPES.RATE_LIMIT]: 'Too many requests. Please wait and try again',
    [ERROR_TYPES.SYSTEM]: 'Internal server error. Please try again'
  };

  return publicMessages[errorType] || 'An unexpected error occurred';
}

/**
 * Sanitize request headers for logging
 */
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  delete sanitized.authorization;
  delete sanitized.cookie;
  delete sanitized['x-api-key'];
  delete sanitized['stripe-signature'];
  
  return sanitized;
}

/**
 * Log error to database for monitoring
 */
async function logErrorToDatabase(errorLog) {
  try {
    await db('error_logs').insert({
      error_id: errorLog.error_id,
      type: errorLog.type,
      severity: errorLog.severity,
      status_code: errorLog.status_code,
      message: errorLog.message,
      stack: errorLog.stack,
      request_data: JSON.stringify(errorLog.request),
      created_at: new Date()
    });
  } catch (error) {
    // Fail silently to avoid recursive errors
    console.error('Database logging failed:', error.message);
  }
}

/**
 * Trigger alert for critical errors
 */
async function triggerAlert(errorLog) {
  try {
    // In production, this would integrate with alerting services like:
    // - Slack webhooks
    // - Email notifications
    // - PagerDuty
    // - SMS alerts
    
    console.error(`🚨 CRITICAL ERROR ALERT: ${errorLog.error_id}`);
    console.error(`Type: ${errorLog.type}, Message: ${errorLog.message}`);
    
    // For now, just log the alert
    await db('alerts').insert({
      alert_id: uuidv4(),
      type: 'critical_error',
      error_id: errorLog.error_id,
      message: `Critical error: ${errorLog.message}`,
      status: 'triggered',
      created_at: new Date()
    });
  } catch (error) {
    console.error('Alert triggering failed:', error.message);
  }
}

/**
 * Enhanced custom error class with additional context
 */
class AppError extends Error {
  constructor(message, statusCode, errorType = null, metadata = {}) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.metadata = metadata;
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Specific error classes for different scenarios
 */
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, ERROR_TYPES.VALIDATION, { field });
  }
}

class PaymentError extends AppError {
  constructor(message, provider = null, transactionId = null) {
    super(message, 402, ERROR_TYPES.PAYMENT, { provider, transactionId });
  }
}

class BlockchainError extends AppError {
  constructor(message, txHash = null, network = null) {
    super(message, 500, ERROR_TYPES.BLOCKCHAIN, { txHash, network });
  }
}

module.exports = { 
  errorHandler, 
  AppError, 
  ValidationError, 
  PaymentError, 
  BlockchainError,
  ERROR_TYPES,
  ERROR_SEVERITY 
}; 