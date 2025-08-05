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
  const { phone_number, country_code } = req.body;
  
  // Validate phone number format
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
  
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

/**
 * @desc    Soft delete user account (recommended)
 * @route   DELETE /api/users/me
 * @access  Private
 */
const deleteAccount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  // Check if user has pending transactions
  const pendingTransactions = await knex('transactions')
    .where('sender_id', userId)
    .whereIn('status', ['pending', 'processing'])
    .count('* as count')
    .first();
  
  if (pendingTransactions.count > 0) {
    return next(new AppError('Cannot delete account with pending transactions. Please wait for all transactions to complete.', 400));
  }
  
  // Check if user has non-zero balance
  const wallet = await knex('wallets')
    .where('user_id', userId)
    .first();
  
  if (wallet && wallet.cbusd_balance > 0) {
    return next(new AppError('Cannot delete account with remaining balance. Please withdraw all funds first.', 400));
  }
  
  // Soft delete user
  const deletedUser = await User.softDelete(userId);
  
  res.status(200).json({
    success: true,
    message: 'Account successfully deleted',
    data: {
      id: deletedUser.id,
      deleted_at: deletedUser.deleted_at
    }
  });
});

/**
 * @desc    Hard delete user account (admin only)
 * @route   DELETE /api/users/:id/hard-delete
 * @access  Private (Admin)
 */
const hardDeleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  // Check if requester is admin (you'll need to implement admin role checking)
  if (req.user.role !== 'admin') {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }
  
  // Verify user exists
  const user = await User.findById(id);
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Hard delete user and all related data
  const success = await User.hardDelete(id);
  
  if (!success) {
    return next(new AppError('Failed to delete user', 500));
  }
  
  res.status(200).json({
    success: true,
    message: 'User and all related data permanently deleted'
  });
});

/**
 * @desc    Restore soft deleted user (admin only)
 * @route   POST /api/users/:id/restore
 * @access  Private (Admin)
 */
const restoreUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  // Check if requester is admin
  if (req.user.role !== 'admin') {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }
  
  // Restore user
  const restoredUser = await User.restore(id);
  
  if (!restoredUser) {
    return next(new AppError('User not found or already active', 404));
  }
  
  res.status(200).json({
    success: true,
    message: 'User account restored',
    user: restoredUser
  });
});


/**
 * @desc    Set transaction PIN
 * @route   POST /api/users/pin/setup
 * @access  Private
 */
const setupTransactionPin = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { pin, confirmPin } = req.body;
  
  // Validate PIN
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return next(new AppError('PIN must be exactly 4 digits', 400));
  }
  
  if (pin !== confirmPin) {
    return next(new AppError('PIN confirmation does not match', 400));
  }
  
  // Set the PIN
  await User.setTransactionPin(userId, pin);
  
  res.status(200).json({
    success: true,
    message: 'Transaction PIN set successfully'
  });
});

/**
 * @desc    Verify transaction PIN
 * @route   POST /api/users/pin/verify
 * @access  Private
 */
const verifyTransactionPin = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { pin } = req.body;
  
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid PIN format. Please enter a 4-digit PIN.'
    });
  }
  
  const result = await User.verifyTransactionPin(userId, pin);
  
  if (!result.valid) {
    return res.status(400).json({
      success: false,
      message: result.error || 'Invalid PIN'
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'PIN verified successfully'
  });
});

/**
 * @desc    Change transaction PIN
 * @route   PUT /api/users/pin/change
 * @access  Private
 */
const changeTransactionPin = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { currentPin, newPin, confirmNewPin } = req.body;
  
  // Validate new PIN
  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    return next(new AppError('New PIN must be exactly 4 digits', 400));
  }
  
  if (newPin !== confirmNewPin) {
    return next(new AppError('New PIN confirmation does not match', 400));
  }
  
  // Verify current PIN
  const verification = await User.verifyTransactionPin(userId, currentPin);
  if (!verification.valid) {
    return next(new AppError(verification.error || 'Invalid current PIN', 400));
  }
  
  // Set new PIN
  await User.setTransactionPin(userId, newPin);
  
  res.status(200).json({
    success: true,
    message: 'Transaction PIN changed successfully'
  });
});

/**
 * @desc    Disable transaction PIN
 * @route   DELETE /api/users/pin
 * @access  Private
 */
const disableTransactionPin = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { currentPin } = req.body;
  
  // Verify current PIN before disabling
  const verification = await User.verifyTransactionPin(userId, currentPin);
  if (!verification.valid) {
    return next(new AppError(verification.error || 'Invalid PIN', 400));
  }
  
  await User.disableTransactionPin(userId);
  
  res.status(200).json({
    success: true,
    message: 'Transaction PIN disabled successfully'
  });
});

/**
 * @desc    Get PIN status
 * @route   GET /api/users/pin/status
 * @access  Private
 */
const getPinStatus = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const pinEnabled = await User.hasPinEnabled(userId);
  
  res.status(200).json({
    success: true,
    pinEnabled
  });
});


module.exports = {
  getProfile,
  updateProfile,
  getWallet,
  lookupUser,
  validatePhone,
  demoDeposit,
  deleteAccount,
  hardDeleteUser,
  restoreUser,
  setupTransactionPin,
  verifyTransactionPin,
  changeTransactionPin,
  disableTransactionPin,
  getPinStatus,
}; 