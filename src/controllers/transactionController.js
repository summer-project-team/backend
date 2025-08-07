const Transaction = require('../models/Transaction');
const transactionService = require('../services/transaction');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');
const { SUPPORTED_CURRENCIES, ERROR_MESSAGES, HTTP_STATUS, TRANSACTION_LIMITS, getHighValueThreshold, getCurrencyCountryCode } = require('../utils/constants');
const pricingService = require('../services/pricingService');
const phoneManagementService = require('../services/phoneManagementService');
const retryService = require('../services/retryService');
const securityService = require('../services/securityService');
const { notifyTransactionUpdate } = require('../utils/websocket');
const asyncHandler = require('express-async-handler');
const { db } = require('../utils/database');
const stripeService = require('../services/stripeService');
const flutterwaveService = require('../services/flutterwaveService');
const parallelProcessingService = require('../services/parallelProcessingService');
const instantSettlementService = require('../services/instantSettlementService');

/**
 * @desc    Get exchange rate quote
 * @route   POST /api/transactions/quote
 * @access  Private
 */
const getQuote = asyncHandler(async (req, res, next) => {
  const { amount, currency_from, currency_to, payment_method, recipient_phone, recipient_country_code } = req.body;
  
  // If recipient phone is provided, get recipient ID for personalized quote
  let recipientId = null;
  if (recipient_phone && recipient_country_code) {
    const phoneValidation = phoneManagementService.validatePhoneNumber(recipient_phone, recipient_country_code);
    if (phoneValidation.isValid) {
      const recipient = await phoneManagementService.lookupUserByPhone(phoneValidation.e164Format);
      if (recipient) {
        recipientId = recipient.id;
      }
    }
  }
  
  // Generate appropriate quote
  let quote;
  if (payment_method && recipientId) {
    // Generate personalized quote
    quote = await pricingService.generatePersonalizedQuote(
      currency_from,
      currency_to,
      parseFloat(amount),
      req.user.id,
      recipientId,
      payment_method
    );
  } else {
    // Generate regular quote
    quote = await pricingService.generateQuote(
      currency_from,
      currency_to,
      parseFloat(amount)
    );
  }
  
  res.status(200).json({
    success: true,
    quote,
  });
});

/**
 * @desc    Lock exchange rate
 * @route   POST /api/transactions/lock-rate
 * @access  Private
 */
const lockRate = asyncHandler(async (req, res, next) => {
  const { quote_id, duration } = req.body;
  
  if (!quote_id) {
    return next(new AppError('Quote ID is required', 400));
  }
  
  try {
    // Lock the rate
    const lock = await pricingService.lockRate(quote_id, duration || 60);
    
    res.status(200).json({
      success: true,
      message: 'Exchange rate locked successfully',
      lock,
    });
  } catch (error) {
    return next(new AppError(`Failed to lock rate: ${error.message}`, 400));
  }
});

/**
 * @desc    Verify rate lock
 * @route   GET /api/transactions/verify-lock/:lockId
 * @access  Private
 */
const verifyRateLock = asyncHandler(async (req, res, next) => {
  const { lockId } = req.params;
  
  if (!lockId) {
    return next(new AppError('Lock ID is required', 400));
  }
  
  // Verify the rate lock
  const lock = await pricingService.verifyRateLock(lockId);
  
  if (!lock) {
    return next(new AppError('Rate lock not found or expired', 404));
  }
  
  res.status(200).json({
    success: true,
    lock,
    is_valid: true
  });
});

/**
 * @desc    Send CBUSD to another user (Pure CBUSD Transfer)
 * @route   POST /api/transactions/send
 * @access  Private
 */
const sendMoney = asyncHandler(async (req, res, next) => {
  const { 
    recipient_phone, 
    recipient_country_code,
    amount, 
    currency_from,
    currency_to,
    narration,
    two_factor_code,
    transaction_pin,
    pin  // Accept both pin and transaction_pin for flexibility
  } = req.body;
  
  const senderId = req.user.id;
  const senderPhone = req.user.phone_number;
  
  // Validate input
  if (!recipient_phone || !recipient_country_code || !amount) {
    return next(new AppError('Recipient phone, country code, and amount are required', 400));
  }

  // Default to CBUSD if not provided for backward compatibility
  const fromCurrency = currency_from || 'CBUSD';
  const toCurrency = currency_to || 'CBUSD';
  
  // Validate currencies
  if (!SUPPORTED_CURRENCIES.includes(fromCurrency) && fromCurrency !== 'CBUSD') {
    return next(new AppError(`Unsupported currency: ${fromCurrency}`, 400));
  }
  if (!SUPPORTED_CURRENCIES.includes(toCurrency) && toCurrency !== 'CBUSD') {
    return next(new AppError(`Unsupported currency: ${toCurrency}`, 400));
  }
  
  const amountValue = parseFloat(amount);
  if (amountValue <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }
  
  // Use either pin or transaction_pin, for backward compatibility
  const userPin = pin || transaction_pin;
  
  // Validate transaction PIN using security service
  const pinValidation = await securityService.validateTransactionPin(senderId, userPin);
  if (!pinValidation.valid) {
    return next(new AppError(pinValidation.error || ERROR_MESSAGES.INVALID_PIN, HTTP_STATUS.BAD_REQUEST));
  }
  
  // Validate recipient phone number
  const phoneValidation = phoneManagementService.validatePhoneNumber(recipient_phone, recipient_country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, HTTP_STATUS.BAD_REQUEST));
  }
  
  // Check if recipient exists
  const recipient = await phoneManagementService.lookupUserByPhone(phoneValidation.e164Format);
  if (!recipient) {
    return next(new AppError('Recipient not found. They need to create a CrossBridge account first.', HTTP_STATUS.NOT_FOUND));
  }
  
  // Prevent sending to self
  if (recipient.id === senderId) {
    return next(new AppError('Cannot send money to yourself', HTTP_STATUS.BAD_REQUEST));
  }
  
  // Get security requirements for this transfer
  const securityReqs = securityService.getSecurityRequirements(amountValue, 'CBUSD', 'transfer');
  if (securityReqs.requiresTwoFactor && !two_factor_code) {
    return next(new AppError(`Two-factor authentication required for transfers above $${securityReqs.threshold} CBUSD`, HTTP_STATUS.BAD_REQUEST));
  }
  
  // Verify 2FA if provided
  if (two_factor_code) {
    const twoFactorValid = await securityService.verifyTwoFactorCode(senderId, two_factor_code);
    if (!twoFactorValid) {
      return next(new AppError('Invalid two-factor code', HTTP_STATUS.UNAUTHORIZED));
    }
  }
  
  // Get sender wallet
  const senderWallet = await Wallet.findByUserId(senderId);
  if (!senderWallet) {
    return next(new AppError('Sender wallet not found', 404));
  }
  
  // Get recipient wallet
  const recipientWallet = await Wallet.findByUserId(recipient.id);
  if (!recipientWallet) {
    return next(new AppError('Recipient wallet not found', 404));
  }
  
  // Check CBUSD balance (including small fee)
  const FEE_RATE = 0.001; // 0.1% fee for CBUSD transfers
  const feeAmount = amountValue * FEE_RATE;
  const totalRequired = amountValue + feeAmount;
  
  if (senderWallet.cbusd_balance < totalRequired) {
    return next(new AppError(`Insufficient CBUSD balance. Required: ${totalRequired} CBUSD (including ${feeAmount} fee)`, 400));
  }
  
  try {
    // Use database transaction for atomicity
    const result = await db.transaction(async (trx) => {
      // This would remove the + in front of the country code
      const senderCountryCode = (req.user.country_code || 'NG').replace('+', '');
      const recipientCountryCode = recipient_country_code.replace('+', '');

      // Create transaction record
      const [transaction] = await trx('transactions').insert({
        sender_id: senderId,
        recipient_id: recipient.id,
        sender_phone: senderPhone,
        recipient_phone: phoneValidation.e164Format,
        sender_country_code: senderCountryCode,
        recipient_country_code: recipientCountryCode,
        amount: amountValue,
        currency_from: fromCurrency,
        currency_to: toCurrency,
        source_currency: fromCurrency,
        target_currency: toCurrency,
        exchange_rate: 1.0, // No conversion needed
        fee: feeAmount,
        status: 'processing',
        transaction_type: 'app_transfer',
        metadata: JSON.stringify({
          narration: narration || null,
          high_value: amountValue > getHighValueThreshold(fromCurrency),
          two_factor_verified: !!two_factor_code,
          sender_name: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim(),
          recipient_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim(),
          transfer_type: `${fromCurrency.toLowerCase()}_to_${toCurrency.toLowerCase()}`
        }),
        reference_id: generateTransactionReference(),
        created_at: new Date()
      }).returning('*');
      
      // Debit sender's CBUSD balance (amount + fee)
      await trx('wallets')
        .where({ id: senderWallet.id })
        .decrement('cbusd_balance', totalRequired);
      
      // Credit recipient's CBUSD balance (just the amount, no fee)
      await trx('wallets')
        .where({ id: recipientWallet.id })
        .increment('cbusd_balance', amountValue);
      
      // Update transaction status to completed
      await trx('transactions')
        .where({ id: transaction.id })
        .update({ 
          status: 'completed',
          completed_at: new Date()
        });
      
      return transaction;
    });
    
    // Send notifications (async, don't wait)
    sendTransferNotifications(result, req.user, recipient).catch(err => {
      console.error('Notification error:', err);
    });
    
    res.status(200).json({
      success: true,
      message: 'CBUSD transfer completed successfully',
      transaction: {
        id: result.id,
        reference_id: result.reference_id,
        amount: result.amount,
        currency: 'CBUSD',
        fee: result.fee,
        recipient_phone: result.recipient_phone,
        status: 'completed',
        narration: narration || null,
        created_at: result.created_at,
        completed_at: new Date()
      }
    });
    
  } catch (error) {
    console.error('CBUSD transfer error:', error);
    return next(new AppError('Transfer failed: ' + error.message, 500));
  }
});

/**
 * Generate unique transaction reference
 */
const generateTransactionReference = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `CBUSD_${timestamp}_${random}`;
};

/**
 * Send transfer notifications
 */
const sendTransferNotifications = async (transaction, sender, recipient) => {
  try {
    // Send push notification to recipient
    // await pushNotificationService.send(recipient.id, {
    //   title: 'Money Received',
    //   body: `You received ${transaction.amount} CBUSD from ${sender.first_name}`,
    //   data: { transaction_id: transaction.id }
    // });
    
    // Send SMS notifications if enabled
    // await smsService.sendTransferAlert(recipient.phone_number, transaction);
    
    console.log(`Notifications sent for transaction ${transaction.id}`);
  } catch (error) {
    console.error('Failed to send notifications:', error);
  }
};

/**
 * @desc    Get transaction history
 * @route   GET /api/transactions/history
 * @access  Private
 */
const getTransactionHistory = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { limit = 20, offset = 0, status, type, sort_by, sort_order } = req.query;
  
  // Get transactions
  const result = await Transaction.getUserTransactions(userId, {
    limit: parseInt(limit),
    offset: parseInt(offset),
    status,
    type,
    sortBy: sort_by || 'created_at',
    sortOrder: sort_order || 'desc',
  });
  
  res.status(200).json({
    success: true,
    transactions: result.transactions,
    pagination: result.pagination,
  });
});

/**
 * @desc    Get transaction by ID
 * @route   GET /api/transactions/:id
 * @access  Private
 */
const getTransaction = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const transactionId = req.params.id;
  
  // Get transaction
  const transaction = await Transaction.findById(transactionId);
  
  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }
  
  // Check if user is involved in transaction
  if (transaction.sender_id !== userId && transaction.recipient_id !== userId) {
    return next(new AppError('Unauthorized', 403));
  }
  
  res.status(200).json({
    success: true,
    transaction,
  });
});

/**
 * @desc    Enhanced deposit initiation with payment provider integration
 * @route   POST /api/transactions/deposit/create
 * @access  Private
 */
const createDepositIntent = asyncHandler(async (req, res, next) => {
  const { amount, currency, payment_method = 'auto' } = req.body;
  const userId = req.user.id;
  
  // Validate inputs
  if (!amount || amount <= 0) {
    return next(new AppError('Valid amount is required', HTTP_STATUS.BAD_REQUEST));
  }
  
  if (!currency) {
    return next(new AppError('Currency is required', HTTP_STATUS.BAD_REQUEST));
  }
  
  // Validate currency
  if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
    return next(new AppError(ERROR_MESSAGES.INVALID_CURRENCY, HTTP_STATUS.BAD_REQUEST));
  }

  try {
    // Import payment services
    const stripeService = require('../services/stripeService');
    const flutterwaveService = require('../services/flutterwaveService');
    const paymentProcessingService = require('../services/paymentProcessingService');

    // Determine payment provider based on currency and region
    let provider = 'stripe'; // Default
    let paymentResult;

    switch (currency.toUpperCase()) {
      case 'NGN':
        provider = 'flutterwave';
        paymentResult = await flutterwaveService.createPaymentCharge(
          amount,
          currency,
          {
            user_reference: userId,
            customer_email: req.user.email,
            customer_phone: req.user.phone_number,
            customer_name: `${req.user.first_name} ${req.user.last_name}`,
            redirect_url: `${process.env.FRONTEND_URL}/dashboard?deposit=success`
          }
        );
        break;
      
      case 'USD':
      case 'GBP':
      case 'EUR':
        provider = 'stripe';
        paymentResult = await stripeService.createPaymentIntent(
          amount * 100, // Convert to cents
          currency,
          {
            user_reference: userId,
            phone_number: req.user.phone_number,
            customer_email: req.user.email,
            demo: process.env.NODE_ENV === 'development' ? 'true' : 'false'
          }
        );
        break;
      
      default:
        return next(new AppError(`Currency ${currency} not supported for direct deposits`, 400));
    }

    // Extract payment data based on provider response structure
    let paymentData, externalReference, paymentUrl;
    
    if (provider === 'flutterwave') {
      // Flutterwave returns: { success: true, data: { tx_ref, link, ... } }
      paymentData = paymentResult.data;
      externalReference = paymentData.tx_ref;
      paymentUrl = paymentData.link;
    } else {
      // Stripe returns: { success: true, payment_intent: { id, client_secret, ... } }
      paymentData = paymentResult.payment_intent;
      externalReference = paymentData.id;
      paymentUrl = `https://checkout.stripe.com/pay/${paymentData.client_secret}`;
    }

    // Create pending transaction record
    const transactionData = {
      sender_id: null, // External payment
      recipient_id: userId,
      amount: amount,
      source_currency: currency.toUpperCase(),
      target_currency: 'CBUSD',
      transaction_type: 'deposit',
      status: 'pending',
      provider: provider,
      external_reference: externalReference,
      fee: 0, // No fee for deposits
      metadata: JSON.stringify({
        payment_intent: paymentData,
        provider: provider,
        currency: currency.toUpperCase()
      })
    };

    const transaction = await transactionService.createTransaction(transactionData);

    // Return payment instructions
    res.status(201).json({
      success: true,
      message: 'Deposit payment intent created successfully',
      data: {
        transaction_id: transaction.id,
        provider: provider,
        payment_url: paymentUrl,
        amount: amount,
        currency: currency.toUpperCase(),
        reference: externalReference,
        instructions: provider === 'flutterwave' 
          ? 'Complete payment using the Flutterwave checkout link'
          : 'Complete payment using the Stripe payment intent'
      }
    });

  } catch (error) {
    console.error('Enhanced deposit creation error:', error);
    return next(new AppError('Failed to create deposit payment: ' + error.message, 500));
  }
});

/**
 * @desc    Initiate Bank-to-App transfer (Real deposit) with Demo CBUSD Settlement
 * @route   POST /api/transactions/bank-to-app
 * @access  Private
 */
const initiateDeposit = asyncHandler(async (req, res, next) => {
  const { amount, currency, metadata = {} } = req.body;
  const userId = req.user.id;
  
  // Validate inputs
  if (!amount || amount <= 0) {
    return next(new AppError('Valid amount is required', HTTP_STATUS.BAD_REQUEST));
  }
  
  if (!currency) {
    return next(new AppError('Currency is required', HTTP_STATUS.BAD_REQUEST));
  }
  
  // Validate currency
  if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
    return next(new AppError(ERROR_MESSAGES.INVALID_CURRENCY, HTTP_STATUS.BAD_REQUEST));
  }

  try {
    // Check if amount qualifies for instant settlement
    const isInstantEligible = await instantSettlementService.isEligibleForInstantDeposit(
      amount, currency, userId
    );

    let result;
    if (isInstantEligible.eligible) {
      console.log(`💨 Processing instant deposit for user ${userId}, amount: ${amount} ${currency}`);
      result = await instantSettlementService.processInstantDeposit(
        userId, amount, currency, metadata
      );
    } else {
      console.log(`⚡ Processing regular deposit for user ${userId}, amount: ${amount} ${currency}`);
      console.log(`   Reason: ${isInstantEligible.reason}`);
      result = await parallelProcessingService.processDepositWithPreMinting({
        userId, 
        amount, 
        currency, 
        metadata
      });
    }

    res.status(200).json({
      success: true,
      message: result.instant ? 'Instant deposit completed' : 'Deposit initiated with parallel processing',
      data: result
    });
  } catch (error) {
    console.error('Deposit initiation error:', error);
    return next(new AppError('Failed to initiate deposit: ' + error.message, 500));
  }
});

/**
 * Demo function to automatically settle CBUSD when deposit is initiated
 * In production, this would be triggered by bank webhook confirmation
 * @param {string} userId - User ID
 * @param {number} amount - Deposit amount
 * @param {string} currency - Deposit currency
 * @param {string} referenceCode - Deposit reference code
 * @param {Object} user - User object from req.user
 */
const demoSettleCBUSD = async (userId, amount, currency, referenceCode, user = null) => {
  try {
    console.log(`Starting CBUSD settlement for ${amount} ${currency}`);
    
    // Calculate CBUSD equivalent
    const cbusdAmount = await convertToCBUSD(amount, currency);
    console.log(`Calculated CBUSD amount: ${cbusdAmount}`);
    
    // Get or create user's wallet
    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      console.log('Creating new wallet for user');
      // Create wallet if it doesn't exist
      wallet = await Wallet.create({
        user_id: userId,
        cbusd_balance: 0,
        balance_ngn: 0,
        balance_usd: 0,
        balance_gbp: 0
      });
    }

    console.log('Wallet found/created, starting transaction...');

    // Use a timeout wrapper for the database transaction
    const transactionResult = await Promise.race([
      performCBUSDSettlement(userId, amount, currency, cbusdAmount, referenceCode, user, wallet),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction timeout after 10 seconds')), 10000)
      )
    ]);

    console.log('CBUSD settlement transaction completed successfully');
    return transactionResult;

  } catch (error) {
    console.error('Demo CBUSD settlement failed:', error);
    throw error;
  }
};

/**
 * Perform the actual CBUSD settlement transaction
 */
const performCBUSDSettlement = async (userId, amount, currency, cbusdAmount, referenceCode, user, wallet) => {
  console.log('Starting CBUSD settlement process');
  
  // First, create the transaction record (this creates its own transaction)
  console.log('Creating transaction with data:', {
    sender_id: null,
    recipient_id: userId,
    sender_phone: null,
    recipient_phone: user?.phone_number || null,
    sender_country_code: null,
    recipient_country_code: user?.country_code || 'NG',
    amount: amount,
    source_currency: currency,
    target_currency: 'CBUSD',
    exchange_rate: cbusdAmount / amount,
    fee: 0,
    transaction_type: 'deposit'
  });
  
  const settlementTransaction = await transactionService.createTransaction({
    sender_id: null, // Bank deposit has no sender
    recipient_id: userId,
    sender_phone: null,
    recipient_phone: user?.phone_number || null,
    sender_country_code: getCurrencyCountryCode(currency) || null,
    recipient_country_code: user?.country_code || 'NG',
    amount: amount,
    currency_from: currency.toUpperCase(),
    currency_to: 'CBUSD',
    source_currency: currency,
    target_currency: 'CBUSD',
    exchange_rate: cbusdAmount / amount,
    fee: 0,
    transaction_type: 'deposit',
    metadata: {
      deposit_reference: referenceCode,
      settlement_type: 'demo_auto_settlement',
      bank_account_id: `ACC_${userId.substr(-8)}_${currency}`,
      original_amount: amount,
      original_currency: currency,
      cbusd_credited: cbusdAmount,
      demo_mode: true,
      high_value: parseFloat(amount) > getHighValueThreshold(currency.toUpperCase()),
      transfer_type: `${currency.toLowerCase()}_to_cbusd`
    }
  });

  console.log('Transaction created with ID:', settlementTransaction.id);

  // Now handle the wallet update and completion in a separate transaction
  await db.transaction(async (trx) => {
    console.log('Inside database transaction for wallet update');
    
    // Credit CBUSD to user's wallet
    await trx('wallets')
      .where({ user_id: userId })
      .increment('cbusd_balance', cbusdAmount)
      .timeout(5000);

    console.log('Wallet balance updated');

    // Update deposit reference status if table exists
    try {
      await trx('bank_deposit_references')
        .where({ reference_code: referenceCode })
        .update({
          status: 'completed',
          settled_at: new Date(),
          cbusd_amount: cbusdAmount,
          transaction_id: settlementTransaction.id,
          updated_at: new Date()
        })
        .timeout(5000);
      console.log('Deposit reference updated');
    } catch (refUpdateError) {
      console.log('Could not update deposit reference (table may not exist):', refUpdateError.message);
    }
  });

  // Complete the transaction (this also creates its own transaction)
  console.log('Completing transaction...');
  await transactionService.completeTransaction(settlementTransaction.id);
  console.log('Transaction completed');

  console.log(`DEMO SETTLEMENT: Credited ${cbusdAmount} CBUSD to user ${userId} for ${amount} ${currency} deposit`);
  
  return { success: true, transaction: settlementTransaction };
};
/**
 * Convert currency amount to CBUSD equivalent
 * @param {number} amount - Amount to convert
 * @param {string} currency - Source currency
 * @returns {Promise<number>} - CBUSD equivalent
 */
const convertToCBUSD = async (amount, currency) => {
  // Use the same rates as in getCBUSDRate function
  const rates = {
    'USD': 1.0,      // 1 USD = 1 CBUSD
    'NGN': 1/1500,   // 1500 NGN = 1 CBUSD, so 1 NGN = 1/1500 CBUSD
    'GBP': 1.25      // 1 GBP = 1.25 CBUSD
  };
  
  const rate = rates[currency] || 1.0;
  return amount * rate;
};

/**
 * @desc    Enhanced withdrawal with payment provider integration
 * @route   POST /api/transactions/withdrawal/create
 * @access  Private
 */
const createWithdrawalIntent = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { 
    amount, 
    currency, 
    bank_account_number, 
    bank_code,
    bank_name, 
    account_holder_name,
    two_factor_code,
    transaction_pin
  } = req.body;

  // Validate currency
  if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
    return next(new AppError(ERROR_MESSAGES.INVALID_CURRENCY, HTTP_STATUS.BAD_REQUEST));
  }

  try {
    // Enhanced security validation
    const securityAssessment = await securityService.assessTransactionRisk({
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      transaction_type: 'withdrawal',
      sender_id: userId
    }, {
      device_id: req.headers['x-device-id'],
      ip_address: req.ip,
      device_trust_level: 'medium' // This would come from device fingerprinting
    });

    // Validate transaction PIN using security service
    const pinValidation = await securityService.validateTransactionPin(userId, transaction_pin);
    if (!pinValidation.valid) {
      return next(new AppError(pinValidation.error || ERROR_MESSAGES.INVALID_PIN, HTTP_STATUS.BAD_REQUEST));
    }

    // Check if additional security is required
    if (securityAssessment.requiresAdditionalAuth && !two_factor_code) {
      return next(new AppError('Two-factor authentication required for this withdrawal', 400));
    }

    if (two_factor_code) {
      const twoFactorValid = await securityService.verifyTwoFactorCode(userId, two_factor_code);
      if (!twoFactorValid.valid) {
        return next(new AppError('Invalid two-factor authentication code', 400));
      }
    }

    // Get wallet and check balance
    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      return next(new AppError(ERROR_MESSAGES.WALLET_NOT_FOUND, HTTP_STATUS.NOT_FOUND));
    }

    // Calculate CBUSD equivalent needed
    const cbusdRate = await getCBUSDRate(currency);
    const feeAmount = parseFloat(amount) * 0.004; // 0.4% fee
    const totalAmount = parseFloat(amount) + feeAmount;
    const cbusdRequired = totalAmount / cbusdRate;

    // Check CBUSD balance
    if (wallet.cbusd_balance < cbusdRequired) {
      return next(new AppError(ERROR_MESSAGES.INSUFFICIENT_BALANCE, HTTP_STATUS.BAD_REQUEST));
    }

    // Import payment services
    const stripeService = require('../services/stripeService');
    const flutterwaveService = require('../services/flutterwaveService');

    // Determine payment provider and process withdrawal
    let provider = 'stripe';
    let withdrawalResult;

    switch (currency.toUpperCase()) {
      case 'NGN':
        provider = 'flutterwave';
        withdrawalResult = await flutterwaveService.processWithdrawal({
          account_bank: bank_code,
          account_number: bank_account_number,
          amount: parseFloat(amount),
          narration: `CrossBridge withdrawal to ${account_holder_name}`,
          currency: currency.toUpperCase(),
          beneficiary_name: account_holder_name,
          user_id: userId,
          reference: `CB-WITH-${Date.now().toString().slice(-6)}`
        });
        break;
      
      case 'USD':
      case 'GBP':
        provider = 'stripe';
        withdrawalResult = await stripeService.processWithdrawal({
          amount: parseFloat(amount) * 100, // Convert to cents
          currency: currency.toLowerCase(),
          bank_account: {
            account_number: bank_account_number,
            routing_number: bank_code,
            account_holder_name: account_holder_name
          },
          user_id: userId,
          metadata: {
            user_id: userId,
            withdrawal_type: 'bank_transfer'
          }
        });
        break;
      
      default:
        return next(new AppError(`Currency ${currency} not supported for withdrawals`, 400));
    }

    // Debit CBUSD balance immediately
    await db('wallets')
      .where('user_id', userId)
      .decrement('cbusd_balance', cbusdRequired)
      .update({ updated_at: new Date() });

    // Create withdrawal transaction record
    const transactionData = {
      sender_id: userId,
      recipient_id: null, // Bank withdrawal
      amount: parseFloat(amount),
      source_currency: 'CBUSD',
      target_currency: currency.toUpperCase(),
      transaction_type: 'withdrawal',
      status: withdrawalResult.success ? 'processing' : 'failed',
      provider: provider,
      external_reference: withdrawalResult.transfer_id || withdrawalResult.transaction_id,
      metadata: JSON.stringify({
        withdrawal_data: withdrawalResult,
        bank_account: {
          account_number: bank_account_number,
          bank_name: bank_name,
          account_holder_name: account_holder_name
        },
        provider: provider,
        risk_assessment: securityAssessment
      })
    };

    const transaction = await transactionService.createTransaction(transactionData);

    res.status(201).json({
      success: true,
      message: 'Withdrawal initiated successfully',
      data: {
        transaction_id: transaction.id,
        provider: provider,
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        status: withdrawalResult.success ? 'processing' : 'failed',
        reference: withdrawalResult.transfer_id || withdrawalResult.transaction_id,
        estimated_completion: provider === 'flutterwave' ? '2-5 minutes' : '1-3 business days'
      }
    });

  } catch (error) {
    console.error('Enhanced withdrawal creation error:', error);
    return next(new AppError('Failed to create withdrawal: ' + error.message, 500));
  }
});

/**
 * @desc    Initiate App-to-Bank transfer (Real withdrawal)
 * @route   POST /api/transactions/app-to-bank
 * @access  Private
 */
const initiateWithdrawal = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { 
    amount, 
    currency, 
    bank_account_number, 
    bank_name, 
    account_holder_name,
    two_factor_code,
    transaction_pin,
    metadata = {}
  } = req.body;

  // Validate currency
  if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
    return next(new AppError(ERROR_MESSAGES.INVALID_CURRENCY, HTTP_STATUS.BAD_REQUEST));
  }

  // Validate transaction PIN using security service
  const pinValidation = await securityService.validateTransactionPin(userId, transaction_pin);
  if (!pinValidation.valid) {
    return next(new AppError(pinValidation.error || ERROR_MESSAGES.INVALID_PIN, HTTP_STATUS.BAD_REQUEST));
  }

  // Get security requirements for this transaction
  const securityReqs = securityService.getSecurityRequirements(parseFloat(amount), currency, 'withdrawal');
  
  if (securityReqs.requiresTwoFactor) {
    if (!two_factor_code) {
      return next(new AppError(`Two-factor authentication required for withdrawals above ${securityReqs.threshold.toLocaleString()} ${currency.toUpperCase()}`, HTTP_STATUS.BAD_REQUEST));
    }
    
    // Verify 2FA code
    const twoFactorValid = await securityService.verifyTwoFactorCode(userId, two_factor_code);
    if (!twoFactorValid) {
      return next(new AppError('Invalid two-factor code', HTTP_STATUS.UNAUTHORIZED));
    }
  }

  try {
    // Enhanced metadata with bank details
    const fullMetadata = {
      ...metadata,
      bank_account_number,
      bank_name,
      account_holder_name
    };

    // Check if amount qualifies for instant settlement
    const isInstantEligible = await instantSettlementService.isEligibleForInstantWithdrawal(
      amount, currency, userId
    );

    let result;
    if (isInstantEligible.eligible) {
      console.log(`💨 Processing instant withdrawal for user ${userId}, amount: ${amount} ${currency}`);
      result = await instantSettlementService.processInstantWithdrawal(
        userId, amount, currency, fullMetadata
      );
    } else {
      console.log(`⚡ Processing regular withdrawal for user ${userId}, amount: ${amount} ${currency}`);
      console.log(`   Reason: ${isInstantEligible.reason}`);
      result = await parallelProcessingService.processWithdrawalWithPreBurn({
        userId, 
        amount, 
        currency, 
        bankDetails: fullMetadata
      });
    }

    res.status(200).json({
      success: true,
      message: result.instant ? 'Instant withdrawal completed' : 'Withdrawal initiated with parallel processing',
      transaction: {
        id: result.id,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        created_at: result.created_at,
        reference: result.reference,
        estimated_completion: result.instant ? 'Completed' : '30-90 seconds'
      }
    });
  } catch (error) {
    console.error('Withdrawal initiation error:', error);
    return next(new AppError('Withdrawal failed: ' + error.message, 500));
  }
});

/**
 * Process withdrawal to bank account
 */
const processWithdrawalToBank = async (transaction) => {
  try {
    // Update to processing
    console.log(`📝 Updating to processing...`);
    await transactionService.processTransaction(transaction.id);
    console.log(`✅ Updated to processing`);

    const metadata = typeof transaction.metadata === 'string' 
      ? JSON.parse(transaction.metadata) 
      : transaction.metadata;
    console.log(`📄 Metadata parsed:`, metadata);

    // Simulate bank API call (replace with real banking API)
    console.log(`⏳ Starting 2-second delay...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    console.log(`✅ Delay completed`);

    // Mock bank transfer result
    const bankTransferResult = {
      success: true,
      bank_reference: `BNK_${Date.now()}`,
      status: 'completed'
    };
    console.log(`🏦 Bank result:`, bankTransferResult);

    if (bankTransferResult.success) {
      // Complete transaction
      console.log(`🎯 Attempting to complete transaction...`);
      await transactionService.completeTransaction(transaction.id);
      console.log(`🎉 Transaction completed successfully!`);
    } else {
      // Refund CBUSD if bank transfer failed
      const wallet = await Wallet.findByUserId(transaction.sender_id);
      await db('wallets')
        .where({ id: wallet.id })
        .increment('cbusd_balance', metadata.cbusd_burned);

      await transactionService.failTransaction(transaction.id, 'Bank transfer failed');
    }
  } catch (error) {
    console.error('Withdrawal processing failed:', error);
    
    // Refund CBUSD
    const metadata = typeof transaction.metadata === 'string' 
      ? JSON.parse(transaction.metadata) 
      : transaction.metadata;
    const wallet = await Wallet.findByUserId(transaction.sender_id);
    await db('wallets')
      .where({ id: wallet.id })
      .increment('cbusd_balance', metadata.cbusd_burned);

    await transactionService.failTransaction(transaction.id, error.message);
  }
};

/**
 * Get CBUSD exchange rate for currency
 */
const getCBUSDRate = async (currency) => {
  // For withdrawals: How much local currency you get per 1 CBUSD
  const rates = {
    'USD': 1.0,    // 1 CBUSD = 1 USD
    'NGN': 1500,   // 1 CBUSD = 1500 NGN
    'GBP': 0.8     // 1 CBUSD = 0.8 GBP (inverse of 1.25)
  };
  return rates[currency] || 1.0;
};

/**
 * @desc    Cancel a transaction
 * @route   POST /api/transactions/:id/cancel
 * @access  Private
 */
const cancelTransaction = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const transactionId = req.params.id;
  const { reason } = req.body;
  
  // Get transaction
  const transaction = await Transaction.findById(transactionId);
  
  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }
  
  // Check if user is involved in transaction
  if (transaction.sender_id !== userId && transaction.recipient_id !== userId) {
    return next(new AppError('Unauthorized', 403));
  }
  
  // Check if transaction can be cancelled
  if (!['initiated', 'processing'].includes(transaction.status)) {
    return next(new AppError('Transaction cannot be cancelled', 400));
  }
  
  try {
    // Attempt to cancel the transaction
    const updatedTransaction = await Transaction.updateStatus(
      transactionId, 
      'cancelled',
      {
        metadata: JSON.stringify({
          ...JSON.parse(transaction.metadata || '{}'),
          cancellation_reason: reason || 'User requested cancellation',
          cancelled_by: userId,
          cancelled_at: new Date().toISOString()
        }),
        cancelled_at: new Date()
      }
    );
    
    // If the transaction was in 'processing' state and involved funds movement,
    // We would need to handle refunds here
    if (transaction.status === 'processing' && transaction.sender_id === userId) {
      // If sender initiated transaction, we may need to refund
      // For certain transaction types, issue a refund
      if (['app_transfer', 'withdrawal'].includes(transaction.transaction_type)) {
        // Get sender wallet
        const senderWallet = await Wallet.findByUserId(userId);
        
        if (senderWallet) {
          // Credit back the amount to sender's wallet
          await Wallet.updateBalance(
            senderWallet.id,
            transaction.currency_from.toLowerCase(),
            parseFloat(transaction.amount)
          );
        }
      }
    }
    
    // Notify users about cancellation
    notifyTransactionUpdate(updatedTransaction);
    
    res.status(200).json({
      success: true,
      message: 'Transaction cancelled successfully',
      transaction: {
        id: updatedTransaction.id,
        status: updatedTransaction.status,
        cancelled_at: updatedTransaction.cancelled_at
      }
    });
  } catch (error) {
    return next(new AppError('Failed to cancel transaction: ' + error.message, 500));
  }
});

/**
 * @desc    Manually retry a failed transaction
 * @route   POST /api/transactions/:id/retry
 * @access  Private
 */
const retryTransaction = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const transactionId = req.params.id;
  
  // Get transaction
  const transaction = await Transaction.findById(transactionId);
  
  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }
  
  // Check if user is involved in transaction
  if (transaction.sender_id !== userId && transaction.recipient_id !== userId) {
    return next(new AppError('Unauthorized', 403));
  }
  
  // Check if transaction can be retried
  if (!['failed', 'retry_scheduled'].includes(transaction.status)) {
    return next(new AppError('Transaction cannot be retried', 400));
  }
  
  // Schedule transaction for retry
  const scheduled = await retryService.scheduleRetry(
    transactionId,
    'Manual retry requested by user',
    0, // Reset retry count for manual retries
    'manual_retry'
  );
  
  if (scheduled) {
    res.status(200).json({
      success: true,
      message: 'Transaction scheduled for retry',
      transaction: {
        id: transactionId,
        status: 'retry_scheduled'
      }
    });
  } else {
    return next(new AppError('Failed to schedule transaction retry', 500));
  }
});

/**
 * @desc    Transfer from bank to app (legacy method for backward compatibility)
 * @route   POST /api/transactions/bank-to-app
 * @access  Private
 */
const transferFromBank = asyncHandler(async (req, res, next) => {
  // This is the legacy method that maps to the new deposit flow
  return createDepositIntent(req, res, next);
});

/**
 * @desc    Transfer to bank from app (legacy method for backward compatibility)
 * @route   POST /api/transactions/app-to-bank
 * @access  Private
 */
const transferToBank = asyncHandler(async (req, res, next) => {
  // This is the legacy method that maps to the new withdrawal flow
  return createWithdrawalIntent(req, res, next);
});

// Export all functions
module.exports = {
  getQuote,
  lockRate,
  verifyRateLock,
  sendMoney,
  getTransactionHistory,
  getTransaction,
  createDepositIntent,
  createWithdrawalIntent,
  transferFromBank,
  transferToBank,
  initiateDeposit,
  initiateWithdrawal,
  cancelTransaction,
  retryTransaction,
  processWithdrawalToBank,
  getCBUSDRate,
  demoSettleCBUSD,
  convertToCBUSD
};