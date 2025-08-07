const paymentProcessingService = require('../services/paymentProcessingService');
const pricingService = require('../services/pricingService');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Register a new bank integration
 * @route   POST /api/bank-integration/register
 * @access  Admin
 */
const registerBank = asyncHandler(async (req, res, next) => {
  const {
    bank_name,
    bank_code,
    swift_code,
    country_code,
    api_key,
    api_secret,
    integration_settings,
    supports_b2b
  } = req.body;
  
  try {
    // Register bank
    const bank = await paymentProcessingService.registerBank({
      bank_name,
      bank_code,
      swift_code,
      country_code,
      api_key,
      api_secret,
      integration_settings,
      supports_b2b
    });
    
    res.status(201).json({
      success: true,
      message: 'Bank integration registered successfully',
      bank: {
        id: bank.id,
        bank_name: bank.bank_name,
        bank_code: bank.bank_code,
        swift_code: bank.swift_code,
        country_code: bank.country_code,
        supports_b2b: bank.supports_b2b,
        created_at: bank.created_at
      }
    });
  } catch (error) {
    return next(new AppError('Failed to register bank: ' + error.message, 500));
  }
});

/**
 * @desc    Get bank integration details
 * @route   GET /api/bank-integration/:id
 * @access  Admin
 */
const getBankById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  try {
    // Get bank
    const bank = await paymentProcessingService.getBankById(id);
    
    res.status(200).json({
      success: true,
      bank: {
        id: bank.id,
        bank_name: bank.bank_name,
        bank_code: bank.bank_code,
        swift_code: bank.swift_code,
        country_code: bank.country_code,
        supports_b2b: bank.supports_b2b,
        created_at: bank.created_at
      }
    });
  } catch (error) {
    return next(new AppError('Failed to get bank: ' + error.message, 500));
  }
});

/**
 * @desc    List all bank integrations
 * @route   GET /api/bank-integration/list
 * @access  Admin
 */
const listBanks = asyncHandler(async (req, res, next) => {
  try {
    // List banks
    const banks = await paymentProcessingService.listBanks();
    
    res.status(200).json({
      success: true,
      banks
    });
  } catch (error) {
    return next(new AppError('Failed to list banks: ' + error.message, 500));
  }
});

/**
 * @desc    Process bank-to-bank transfer (API for bank integration)
 * @route   POST /api/bank-integration/b2b-transfer
 * @access  Private (API Key)
 */
const processB2BTransfer = asyncHandler(async (req, res, next) => {
  const {
    transaction_reference,
    sender_bank_id,
    recipient_bank_id,
    sender_account,
    recipient_account,
    amount,
    source_currency,
    target_currency,
    purpose,
    memo,
    callback_url,
    rate_lock_duration,
    is_test
  } = req.body;
  
  // Get API credentials from request headers
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  
  if (!apiKey || !apiSecret) {
    return next(new AppError('API credentials required', 401));
  }
  
  try {
    // Process bank-to-bank transfer
    const result = await paymentProcessingService.processBankToBank(
      apiKey,
      apiSecret,
      {
        transaction_reference,
        amount,
        source_currency,
        target_currency,
        sender_account_number: sender_account.account_number,
        recipient_account_number: recipient_account.account_number,
        sender_account_name: sender_account.account_name,
        recipient_account_name: recipient_account.account_name,
        recipient_bank_code: recipient_bank_id,
        sort_code: recipient_account.sort_code,
        purpose,
        memo,
        callback_url,
        rate_lock_duration: rate_lock_duration || 30,
        is_test: is_test || false
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Transfer initiated successfully',
      transfer: result
    });
  } catch (error) {
    return next(new AppError('Transfer failed: ' + error.message, 500));
  }
});

/**
 * @desc    Get B2B quote (API for bank integration)
 * @route   POST /api/bank-integration/b2b-quote
 * @access  Private (API Key)
 */
const getB2BQuote = asyncHandler(async (req, res, next) => {
  const {
    amount,
    source_currency,
    target_currency,
  } = req.body;
  
  // Get API credentials from request headers
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  
  if (!apiKey || !apiSecret) {
    return next(new AppError('API credentials required', 401));
  }
  
  try {
    // Verify bank credentials
    const bankInfo = await paymentProcessingService.verifyBankCredentials(apiKey, apiSecret);
    
    // Get recipient bank (just for the country code)
    const recipientBankCode = req.body.recipient_bank_code;
    let recipientBank;
    
    try {
      recipientBank = await paymentProcessingService.getBankByCode(recipientBankCode);
    } catch (error) {
      // Default to a generic country code if bank not found
      recipientBank = { country_code: 'US' };
    }
    
    // Generate B2B quote
    const quote = await pricingService.generateB2BQuote(
      source_currency,
      target_currency,
      parseFloat(amount),
      bankInfo.country_code,
      recipientBank.country_code
    );
    
    res.status(200).json({
      success: true,
      quote
    });
  } catch (error) {
    return next(new AppError('Failed to generate quote: ' + error.message, 500));
  }
});

/**
 * @desc    Get transfer status (API for bank integration)
 * @route   GET /api/bank-integration/transfer-status/:id
 * @access  Private (API Key)
 */
const getTransferStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  // Get API credentials from request headers
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  
  if (!apiKey || !apiSecret) {
    return next(new AppError('API credentials required', 401));
  }
  
  try {
    // Get transfer status
    const status = await paymentProcessingService.getTransferStatus(apiKey, apiSecret, id);
    
    res.status(200).json({
      success: true,
      transfer: status
    });
  } catch (error) {
    return next(new AppError('Failed to get transfer status: ' + error.message, 500));
  }
});

/**
 * @desc    Verify webhook signature and process webhook event
 * @route   POST /api/bank-integration/webhook-verify
 * @access  Public (verified by signature)
 */
const verifyWebhook = asyncHandler(async (req, res, next) => {
  // Get webhook signature from header
  const signature = req.headers['x-webhook-signature'];
  
  if (!signature) {
    return next(new AppError('Webhook signature required', 401));
  }
  
  try {
    // Verify signature (implementation depends on how you generate signatures)
    const isValid = paymentProcessingService.verifyWebhookSignature(
      signature,
      JSON.stringify(req.body)
    );
    
    if (!isValid) {
      return next(new AppError('Invalid webhook signature', 401));
    }
    
    // Process webhook payload
    const { transaction_id, status, timestamp, metadata } = req.body;
    
    if (!transaction_id || !status) {
      return next(new AppError('Missing required webhook fields', 400));
    }
    
    // Update transaction status based on webhook
    const result = await paymentProcessingService.processWebhookEvent(
      transaction_id,
      status,
      metadata || {}
    );
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      reference: result.reference
    });
  } catch (error) {
    // Still return 200 to webhook sender to prevent retries
    console.error('Webhook processing error:', error);
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
});

/**
 * @desc    Process batch of bank-to-bank transfers
 * @route   POST /api/bank-integration/batch-transfer
 * @access  Private (API Key)
 */
const processBatchTransfer = asyncHandler(async (req, res, next) => {
  const {
    batch_id,
    transfers
  } = req.body;
  
  // Get API credentials from request headers
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  
  if (!apiKey || !apiSecret) {
    return next(new AppError('API credentials required', 401));
  }
  
  // Validate batch
  if (!Array.isArray(transfers) || transfers.length === 0) {
    return next(new AppError('Transfers array is required and cannot be empty', 400));
  }
  
  // Enforce batch size limits
  const MAX_BATCH_SIZE = 50;
  if (transfers.length > MAX_BATCH_SIZE) {
    return next(new AppError(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} transfers`, 400));
  }
  
  try {
    // Process batch of transfers
    const results = await paymentProcessingService.processBatchTransfer(
      apiKey,
      apiSecret,
      batch_id,
      transfers
    );
    
    res.status(200).json({
      success: true,
      message: 'Batch transfer initiated successfully',
      batch_id: results.batch_id,
      transfers: results.transfers,
      status: 'processing',
      accepted_count: results.accepted_count,
      rejected_count: results.rejected_count
    });
  } catch (error) {
    return next(new AppError('Batch transfer failed: ' + error.message, 500));
  }
});

module.exports = {
  registerBank,
  getBankById,
  listBanks,
  processB2BTransfer,
  getB2BQuote,
  getTransferStatus,
  verifyWebhook,
  processBatchTransfer
}; 