const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');
const phoneService = require('../services/phoneService');
const Transaction = require('../models/Transaction');
const transactionService = require('../services/transaction');
const knex = require('knex')(require('../../knexfile')[process.env.NODE_ENV || 'development']);


/**
 * @desc    Get user profile
 * @route   GET /api/users/me
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  // Get user profile
  const user = await User.getProfile(userId);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    success: true,
    user,
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/users/update-profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { email, first_name, last_name } = req.body;
  
  // Check if email already exists
  if (email) {
    const existingEmail = await User.findByEmail(email);
    if (existingEmail && existingEmail.id !== userId) {
      return next(new AppError('Email already in use', 400));
    }
  }
  
  // Update user
  const updatedUser = await User.update(userId, {
    ...(email && { email }),
    ...(first_name && { first_name }),
    ...(last_name && { last_name }),
  });
  
  res.status(200).json({
    success: true,
    user: {
      id: updatedUser.id,
      phone_number: updatedUser.phone_number,
      country_code: updatedUser.country_code,
      email: updatedUser.email,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      kyc_status: updatedUser.kyc_status,
    },
  });
});

/**
 * @desc    Get user wallet
 * @route   GET /api/users/wallet
 * @access  Private
 */
const getWallet = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  // Get wallet
  const wallet = await Wallet.findByUserId(userId);
  
  if (!wallet) {
    return next(new AppError('Wallet not found', 404));
  }
  
  res.status(200).json({
    success: true,
    wallet: {
      id: wallet.id,
      wallet_address: wallet.wallet_address,
      balances: {
        ngn: wallet.balance_ngn,
        gbp: wallet.balance_gbp,
        usd: wallet.balance_usd,
        cbusd: wallet.cbusd_balance,
      },
      created_at: wallet.created_at,
    },
  });
});

/**
 * @desc    Lookup user by phone number
 * @route   POST /api/user/lookup
 * @access  Private
 */
const lookupUser = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code } = req.body;
  
  // Validate phone number
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  // Lookup user
  const user = await phoneService.lookupUserByPhone(phoneValidation.e164Format);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    success: true,
    user: {
      phone_number: user.phone_number,
      first_name: user.first_name,
      last_name: user.last_name,
      wallet_address: user.wallet_address,
    },
  });
});

/**
 * @desc    Validate phone number and check if registered
 * @route   POST /api/users/validate-phone
 * @access  Private
 */
const validatePhone = asyncHandler(async (req, res, next) => {
  const { phone, country_code } = req.body;
  
  // Validate phone number format
  const phoneValidation = phoneService.validatePhoneNumber(phone, country_code);
  
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  // Check if user exists
  const user = await phoneService.lookupUserByPhone(phoneValidation.e164Format);
  
  const response = {
    success: true,
    valid: true,
    formatted_phone: phoneValidation.e164Format,
    is_registered: !!user,
  };
  
  // If registered, add limited user info (without sensitive details)
  if (user) {
    response.user = {
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      registered_since: user.created_at,
    };
  }
  
  res.status(200).json(response);
});


/**
 * @desc    Demo deposit to wallet (for testing only)
 * @route   POST /api/wallets/deposit
 * @access  Private
 */
const demoDeposit = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { amount, currency } = req.body;
  
  if (!amount || !currency) {
    return next(new AppError('Amount and currency are required', 400));
  }
  
  if (!['NGN', 'GBP', 'USD', 'CBUSD'].includes(currency.toUpperCase())) {
    return next(new AppError('Invalid currency', 400));
  }
  
  // Validate amount
  const depositAmount = parseFloat(amount);
  if (isNaN(depositAmount) || depositAmount <= 0) {
    return next(new AppError('Invalid amount', 400));
  }
  
  // Get wallet
  const wallet = await Wallet.findByUserId(userId);
  
  if (!wallet) {
    return next(new AppError('Wallet not found', 404));
  }
  
  try {
    // Create transaction record using the newer transaction service
    const transaction = await transactionService.createTransaction({
      sender_id: null, // No sender for deposits
      recipient_id: userId,
      sender_phone: null,
      recipient_phone: req.user.phone_number,
      sender_country_code: null,
      recipient_country_code: req.user.country_code || 'NG',
      amount: depositAmount,
      source_currency: currency.toUpperCase(),
      target_currency: currency.toUpperCase(),
      exchange_rate: 1.0,
      fee: 0,
      transaction_type: 'deposit',
      metadata: {
        method: 'demo_deposit',
        wallet_id: wallet.id,
        demo: true
      },
      is_test: true
    });
    
    // Process the transaction (mark as processing)
    await transactionService.processTransaction(transaction.id);
    
    // Complete the deposit by updating wallet balance and transaction status
    const completedTransaction = await completeDeposit(transaction.id, userId, currency.toUpperCase(), depositAmount);
    
    // Get updated wallet
    const updatedWallet = await Wallet.findByUserId(userId);
    
    res.status(200).json({
      success: true,
      message: 'Demo deposit successful',
      transaction: {
        id: completedTransaction.id,
        amount: completedTransaction.amount,
        currency: completedTransaction.source_currency,
        status: completedTransaction.status,
        reference: completedTransaction.reference_id,
        transaction_type: completedTransaction.transaction_type,
        created_at: completedTransaction.created_at,
        completed_at: completedTransaction.completed_at
      },
      wallet: {
        id: updatedWallet.id,
        wallet_address: updatedWallet.wallet_address,
        balances: {
          ngn: updatedWallet.balance_ngn,
          gbp: updatedWallet.balance_gbp,
          usd: updatedWallet.balance_usd,
          cbusd: updatedWallet.cbusd_balance,
        },
      }
    });
    
  } catch (error) {
    console.error('Demo deposit error:', error);
    return next(new AppError(`Failed to deposit: ${error.message}`, 500));
  }
});

/**
 * Complete a deposit transaction
 * @param {string} transactionId - Transaction ID
 * @param {string} userId - User ID
 * @param {string} currency - Currency
 * @param {number} amount - Amount to deposit
 * @returns {Promise<Object>} - Completed transaction
 */
async function completeDeposit(transactionId, userId, currency, amount) {
  return await knex.transaction(async (trx) => {
    // Get the wallet
    const wallet = await trx('wallets')
      .where({ user_id: userId })
      .first();
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Determine which balance column to update
    let columnToUpdate;
    switch (currency) {
      case 'NGN': columnToUpdate = 'balance_ngn'; break;
      case 'GBP': columnToUpdate = 'balance_gbp'; break;
      case 'USD': columnToUpdate = 'balance_usd'; break;
      case 'CBUSD': columnToUpdate = 'cbusd_balance'; break;
      default: throw new Error('Invalid currency');
    }
    
    // Update wallet balance
    await trx('wallets')
      .where({ id: wallet.id })
      .update({
        [columnToUpdate]: trx.raw(`?? + ?`, [columnToUpdate, amount]),
        updated_at: new Date()
      });
    
    // Complete the transaction
    const [completedTransaction] = await trx('transactions')
      .where({ id: transactionId })
      .update({
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    // Create transaction event
    await trx('transaction_events').insert({
      transaction_id: transactionId,
      event_type: 'completed',
      event_data: JSON.stringify({
        completed_at: new Date().toISOString(),
        amount: amount
      }),
      created_at: new Date()
    });
    
    return completedTransaction;
  });
}


module.exports = {
  getProfile,
  updateProfile,
  getWallet,
  lookupUser,
  validatePhone,
  demoDeposit,
}; 