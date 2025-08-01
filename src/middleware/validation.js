const Joi = require('joi');
const { AppError } = require('./errorHandler');

/**
 * Middleware factory for request validation
 * @param {Object} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    if (!schema) {
      return next(); // Skip validation if no schema provided
    }
    
    const { error } = schema.validate(req[property], { abortEarly: false });
    
    if (!error) {
      return next();
    }
    
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    
    next(new AppError('Validation error', 400, errors));
  };
};

// Common validation schemas
const schemas = {
  // Auth schemas
  register: Joi.object({
    phone_number: Joi.string().required().min(10).max(15),
    country_code: Joi.string().required().min(2).max(4),
    email: Joi.string().email().required(),
    password: Joi.string().required().min(8),
    first_name: Joi.string().required().min(1).max(50), // Add this
    last_name: Joi.string().required().min(1).max(50),  // Add this
  }),
  
  login: Joi.object({
    phone_number: Joi.string().required(),
    country_code: Joi.string().required(),
    password: Joi.string().required(),
  }),
  
  verifyPhone: Joi.object({
    phone_number: Joi.string().required(),
    country_code: Joi.string().required(),
    verification_code: Joi.string().required().length(6),
  }),
  
  // Transaction schemas
  quote: Joi.object({
    amount: Joi.number().required().positive(),
    currency_from: Joi.string().required().valid('NGN', 'GBP', 'USD'),
    currency_to: Joi.string().required().valid('NGN', 'GBP', 'USD'),
    payment_method: Joi.string().valid('app_balance', 'bank_transfer', 'card_payment'),
    recipient_phone: Joi.string(),
    recipient_country_code: Joi.string().when('recipient_phone', {
      is: Joi.exist(),
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }),
  
  lockRate: Joi.object({
    quote_id: Joi.string().uuid().required(),
    duration: Joi.number().integer().min(15).max(300),
  }),
  
  send: Joi.object({
    recipient_phone: Joi.string()
      .required()
      .custom((value, helpers) => {
        // Allow both formats:
        // 1. International format: +2348123456789
        // 2. National format: 8123456789 (to be combined with country_code)
        
        const internationalFormat = /^\+[1-9]\d{10,14}$/;
        const nationalFormat = /^[1-9]\d{7,13}$/;
        
        if (internationalFormat.test(value) || nationalFormat.test(value)) {
          return value;
        }
        
        return helpers.error('string.pattern.base');
      })
      .messages({
        'string.pattern.base': 'Phone number must be in international format (+1234567890) or national format (1234567890)',
        'any.required': 'Recipient phone number is required'
      }),
      
    recipient_country_code: Joi.string()
      .pattern(/^\+[1-9]\d{0,3}$/)
      .required()
      .messages({
        'string.pattern.base': 'Country code must be in format +1, +44, +234, etc.',
        'any.required': 'Recipient country code is required'
      }),
      
    amount: Joi.number()
      .positive()
      .precision(2)
      .min(0.01)
      .max(100000)
      .required()
      .messages({
        'number.base': 'Amount must be a number',
        'number.positive': 'Amount must be positive',
        'number.min': 'Minimum transfer amount is 0.01 CBUSD',
        'number.max': 'Maximum transfer amount is 100,000 CBUSD',
        'any.required': 'Amount is required'
      }),
      
    // Make these optional since CBUSD transfers don't need currency conversion
    currency_from: Joi.string().valid('NGN', 'GBP', 'USD', 'CBUSD').optional(),
    currency_to: Joi.string().valid('NGN', 'GBP', 'USD', 'CBUSD').optional(),
    quote_id: Joi.string().uuid().optional(), // Not needed for CBUSD transfers
    lock_id: Joi.string().uuid().optional(),
    
    narration: Joi.string()
      .max(200)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Narration cannot exceed 200 characters'
      }),
      
    transaction_pin: Joi.string()
      .pattern(/^[0-9]{4}$/)
      .required()
      .messages({
        'string.pattern.base': 'Transaction PIN must be 4 digits',
        'any.required': 'Transaction PIN is required'
      }),
      
    two_factor_code: Joi.string()
      .pattern(/^[0-9]{6}$/)
      .when('amount', {
        is: Joi.number().greater(500),
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.pattern.base': 'Two-factor code must be 6 digits',
        'any.required': 'Two-factor authentication required for transfers above $500 CBUSD'
      }),
      
    biometric_hash: Joi.string().optional(),
  }),

  // NEW: Bank-to-App deposit schema
  bankToApp: Joi.object({
    amount: Joi.number()
      .positive()
      .precision(2)
      .min(10)
      .max(1000000)
      .required()
      .messages({
        'number.base': 'Amount must be a number',
        'number.positive': 'Amount must be positive',
        'number.min': 'Minimum deposit amount is 10',
        'number.max': 'Maximum deposit amount is 1,000,000',
        'any.required': 'Amount is required'
      }),
    
    currency: Joi.string()
      .valid('NGN', 'USD', 'GBP')
      .uppercase()
      .required()
      .messages({
        'any.only': 'Currency must be one of: NGN, USD, GBP',
        'any.required': 'Currency is required'
      })
  }),

  // NEW: App-to-Bank withdrawal schema
  appToBank: Joi.object({
    amount: Joi.number()
      .positive()
      .precision(2)
      .min(10)
      .max(1000000)
      .required()
      .messages({
        'number.base': 'Amount must be a number',
        'number.positive': 'Amount must be positive',
        'number.min': 'Minimum withdrawal amount is 10',
        'number.max': 'Maximum withdrawal amount is 1,000,000',
        'any.required': 'Amount is required'
      }),
    
    currency: Joi.string()
      .valid('NGN', 'USD', 'GBP')
      .uppercase()
      .required()
      .messages({
        'any.only': 'Currency must be one of: NGN, USD, GBP',
        'any.required': 'Currency is required'
      }),
    
    bank_account_number: Joi.string()
      .pattern(/^[0-9]{8,20}$/)
      .required()
      .messages({
        'string.pattern.base': 'Bank account number must be 8-20 digits',
        'any.required': 'Bank account number is required'
      }),
    
    bank_name: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Bank name must be at least 2 characters',
        'string.max': 'Bank name cannot exceed 100 characters',
        'any.required': 'Bank name is required'
      }),
    
    account_holder_name: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s.-]+$/)
      .required()
      .messages({
        'string.min': 'Account holder name must be at least 2 characters',
        'string.max': 'Account holder name cannot exceed 100 characters',
        'string.pattern.base': 'Account holder name can only contain letters, spaces, dots, and hyphens',
        'any.required': 'Account holder name is required'
      }),
    
    transaction_pin: Joi.string()
      .pattern(/^[0-9]{4}$/)
      .required()
      .messages({
        'string.pattern.base': 'Transaction PIN must be 4 digits',
        'any.required': 'Transaction PIN is required'
      }),
    
    two_factor_code: Joi.string()
      .pattern(/^[0-9]{6}$/)
      .when('amount', {
        is: Joi.number().greater(500), // Require 2FA for amounts > $500 equivalent
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.pattern.base': 'Two-factor code must be 6 digits',
        'any.required': 'Two-factor authentication required for high-value withdrawals'
      })
  }),
  
  cancelTransaction: Joi.object({
    reason: Joi.string().max(200),
  }),
  
  // User schemas
  updateProfile: Joi.object({
    email: Joi.string().email(),
    first_name: Joi.string(),
    last_name: Joi.string(),
  }),
  
  validatePhone: Joi.object({
    phone: Joi.string().required(),
    country_code: Joi.string().required(),
  }),
  
  // Banking schemas
  linkAccount: Joi.object({
    account_number: Joi.string().required(),
    bank_code: Joi.string().required(),
    bank_name: Joi.string().required(),
    account_name: Joi.string().required(),
    account_type: Joi.string().required().valid('savings', 'checking', 'current'),
    currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
  }),
  
  // CBUSD schemas
  mint: Joi.object({
    amount: Joi.number().required().positive(),
    currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
  }),
  
  burn: Joi.object({
    amount: Joi.number().required().positive(),
    currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
  }),
  
  transfer: Joi.object({
    recipient_phone: Joi.string().required(),
    recipient_country_code: Joi.string().required(),
    amount: Joi.number().required().positive(),
  }),
  
  // Bank Integration schemas
  registerBank: Joi.object({
    bank_name: Joi.string().required(),
    bank_code: Joi.string().required(),
    swift_code: Joi.string(),
    country_code: Joi.string().required(),
    api_key: Joi.string().required(),
    api_secret: Joi.string().required(),
    integration_settings: Joi.object(),
    supports_b2b: Joi.boolean().default(false),
  }),
  
  b2bTransfer: Joi.object({
    transaction_reference: Joi.string(),
    sender_bank_id: Joi.string().required(),
    recipient_bank_id: Joi.string().required(),
    sender_account: Joi.object({
      account_number: Joi.string().required(),
      account_name: Joi.string().required(),
    }).required(),
    recipient_account: Joi.object({
      account_number: Joi.string().required(),
      account_name: Joi.string().required(),
      sort_code: Joi.string(),
    }).required(),
    amount: Joi.number().required().positive(),
    source_currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
    target_currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
    purpose: Joi.string(),
    memo: Joi.string(),
    callback_url: Joi.string().uri(),
    rate_lock_duration: Joi.number().integer().min(15).max(300),
    is_test: Joi.boolean().default(false),
  }),
  
  b2bQuote: Joi.object({
    amount: Joi.number().required().positive(),
    source_currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
    target_currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
    recipient_bank_code: Joi.string().required(),
  }),
  
  webhookVerify: Joi.object({
    transaction_id: Joi.string().required(),
    status: Joi.string().required().valid('initiated', 'processing', 'completed', 'failed', 'cancelled'),
    timestamp: Joi.date().iso(),
    metadata: Joi.object(),
  }),

  // NEW: Bank deposit webhook schema
  bankDepositWebhook: Joi.object({
    reference_code: Joi.string()
      .pattern(/^CB_DEP_\d{6}_[A-Z0-9]{4}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid reference code format',
        'any.required': 'Reference code is required'
      }),
    
    amount: Joi.number()
      .positive()
      .precision(2)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
        'any.required': 'Amount is required'
      }),
    
    currency: Joi.string()
      .valid('NGN', 'USD', 'GBP')
      .uppercase()
      .required()
      .messages({
        'any.only': 'Currency must be one of: NGN, USD, GBP',
        'any.required': 'Currency is required'
      }),
    
    bank_reference: Joi.string()
      .required()
      .messages({
        'any.required': 'Bank reference is required'
      }),
    
    timestamp: Joi.date()
      .iso()
      .required()
      .messages({
        'date.format': 'Timestamp must be in ISO format',
        'any.required': 'Timestamp is required'
      })
  }),

  b2bBatchTransfer: Joi.object({
    batch_id: Joi.string(),
    transfers: Joi.array().items(
      Joi.object({
        transaction_reference: Joi.string(),
        sender_account: Joi.object({
          account_number: Joi.string().required(),
          account_name: Joi.string().required(),
        }).required(),
        recipient_account: Joi.object({
          account_number: Joi.string().required(),
          account_name: Joi.string().required(),
          sort_code: Joi.string(),
        }).required(),
        amount: Joi.number().required().positive(),
        source_currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
        target_currency: Joi.string().required().valid('NGN', 'GBP', 'USD'),
        purpose: Joi.string(),
        memo: Joi.string(),
        rate_lock_duration: Joi.number().integer().min(15).max(300),
        is_test: Joi.boolean().default(false),
      })
    ).required().min(1).max(50),
  }),

  // Security schemas
  assessTransaction: Joi.object({
    transaction_id: Joi.string().uuid().required(),
    context: Joi.object({
      device_fingerprint: Joi.string().allow('', null),
      location: Joi.string().allow('', null),
      country_code: Joi.string().length(2).allow('', null),
      city: Joi.string().allow('', null)
    }).optional()
  }),

  assessDevice: Joi.object({
    device_fingerprint: Joi.string().required()
  }),

  recordLogin: Joi.object({
    user_id: Joi.string().uuid().required(),
    success: Joi.boolean().required(),
    failure_reason: Joi.string().allow('', null),
    ip_address: Joi.string().allow('', null),
    device_fingerprint: Joi.string().allow('', null),
    country_code: Joi.string().length(2).allow('', null),
    city: Joi.string().allow('', null),
    user_agent: Joi.string().allow('', null)
  }),

  updateFraudAlert: Joi.object({
    status: Joi.string().valid('open', 'investigating', 'resolved', 'false_positive').required(),
    resolution: Joi.string().allow('', null)
  }),
};

module.exports = {
  validate,
  schemas,
};