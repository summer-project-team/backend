const bankingService = require('../services/bankingService');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Link a bank account
 * @route   POST /api/banking/link-account
 * @access  Private
 */
const linkAccount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { account_number, bank_code, bank_name, account_name, account_type, currency } = req.body;
  
  // Validate currency
  const validCurrencies = ['NGN', 'GBP', 'USD'];
  if (!validCurrencies.includes(currency.toUpperCase())) {
    return next(new AppError('Invalid currency', 400));
  }
  
  try {
    // Link account
    const account = await bankingService.linkBankAccount(userId, {
      account_number,
      bank_code,
      bank_name,
      account_name,
      account_type,
      currency: currency.toUpperCase(),
    });
    
    res.status(200).json({
      success: true,
      message: 'Bank account linked successfully',
      account: {
        id: account.id,
        account_number: account.account_number,
        bank_name: account.bank_name,
        account_name: account.account_name,
        account_type: account.account_type,
        currency: account.currency,
        is_verified: account.is_verified,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to link bank account: ' + error.message, 500));
  }
});

/**
 * @desc    Get linked bank accounts
 * @route   GET /api/banking/accounts
 * @access  Private
 */
const getAccounts = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    // Get accounts
    const accounts = await bankingService.getUserBankAccounts(userId);
    
    res.status(200).json({
      success: true,
      accounts,
    });
  } catch (error) {
    return next(new AppError('Failed to get bank accounts: ' + error.message, 500));
  }
});

/**
 * @desc    Verify bank deposit
 * @route   POST /api/banking/verify-deposit
 * @access  Private
 */
const verifyDeposit = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { account_id, amount, currency } = req.body;
  
  // Validate currency
  const validCurrencies = ['NGN', 'GBP', 'USD'];
  if (!validCurrencies.includes(currency.toUpperCase())) {
    return next(new AppError('Invalid currency', 400));
  }
  
  try {
    // Get user wallet
    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      return next(new AppError('Wallet not found', 404));
    }
    
    // Process deposit
    const result = await bankingService.processDeposit(
      userId,
      account_id,
      parseFloat(amount),
      currency.toUpperCase()
    );
    
    // Update wallet balance
    await Wallet.updateBalance(
      wallet.id,
      currency.toLowerCase(),
      parseFloat(amount)
    );
    
    res.status(200).json({
      success: true,
      message: 'Deposit verified successfully',
      transaction: {
        reference: result.reference,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to verify deposit: ' + error.message, 500));
  }
});

/**
 * @desc    Verify bank account
 * @route   POST /api/banking/verify-account
 * @access  Private
 */
const verifyAccount = asyncHandler(async (req, res, next) => {
  const { account_id } = req.body;
  
  try {
    // Verify account
    const result = await bankingService.verifyBankAccount(account_id);
    
    res.status(200).json({
      success: true,
      message: 'Bank account verified successfully',
      verification: {
        verification_id: result.verification_id,
        verified_at: result.verified_at,
        account: {
          id: result.account.id,
          account_number: result.account.account_number,
          bank_name: result.account.bank_name,
          is_verified: result.account.is_verified,
        },
      },
    });
  } catch (error) {
    return next(new AppError('Failed to verify bank account: ' + error.message, 500));
  }
});

/**
 * @desc    Remove a linked bank account
 * @route   DELETE /api/banking/accounts/:accountId
 * @access  Private
 */
const removeAccount = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { accountId } = req.params;
  
  try {
    // Check if account exists and belongs to user
    const account = await bankingService.getBankAccount(userId, accountId);
    if (!account) {
      return next(new AppError('Bank account not found', 404));
    }
    
    // Remove the account
    await bankingService.removeBankAccount(userId, accountId);
    
    res.status(200).json({
      success: true,
      message: 'Bank account removed successfully',
    });
  } catch (error) {
    return next(new AppError('Failed to remove bank account: ' + error.message, 500));
  }
});

module.exports = {
  linkAccount,
  getAccounts,
  removeAccount,
  verifyDeposit,
  verifyAccount,
}; 