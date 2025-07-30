const cbusdService = require('../services/cbusdService');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');
const phoneService = require('../services/phoneService');

/**
 * @desc    Mint CBUSD tokens
 * @route   POST /api/cbusd/mint
 * @access  Private
 */
const mintCBUSD = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { amount, currency } = req.body;
  
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
    
    // Check if user has sufficient balance
    const balanceKey = `balance_${currency.toLowerCase()}`;
    if (wallet[balanceKey] < parseFloat(amount)) {
      return next(new AppError('Insufficient balance', 400));
    }
    
    // Deduct from fiat balance
    await Wallet.updateBalance(
      wallet.id,
      currency.toLowerCase(),
      -parseFloat(amount)
    );
    
    // Mint CBUSD
    const result = await cbusdService.mintCBUSD(
      userId,
      wallet.id,
      parseFloat(amount),
      currency.toUpperCase()
    );
    
    res.status(200).json({
      success: true,
      message: 'CBUSD minted successfully',
      transaction: {
        transaction_id: result.transaction_id,
        amount: result.amount,
        new_balance: result.new_balance,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to mint CBUSD: ' + error.message, 500));
  }
});

/**
 * @desc    Burn CBUSD tokens
 * @route   POST /api/cbusd/burn
 * @access  Private
 */
const burnCBUSD = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { amount, currency } = req.body;
  
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
    
    // Check if user has sufficient CBUSD balance
    if (wallet.cbusd_balance < parseFloat(amount)) {
      return next(new AppError('Insufficient CBUSD balance', 400));
    }
    
    // Burn CBUSD
    const result = await cbusdService.burnCBUSD(
      userId,
      wallet.id,
      parseFloat(amount),
      currency.toUpperCase()
    );
    
    // Add to fiat balance
    await Wallet.updateBalance(
      wallet.id,
      currency.toLowerCase(),
      parseFloat(amount)
    );
    
    res.status(200).json({
      success: true,
      message: 'CBUSD burned successfully',
      transaction: {
        transaction_id: result.transaction_id,
        amount: result.amount,
        new_balance: result.new_balance,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to burn CBUSD: ' + error.message, 500));
  }
});

/**
 * @desc    Get CBUSD balance
 * @route   GET /api/cbusd/balance
 * @access  Private
 */
const getBalance = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    // Get user wallet
    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      return next(new AppError('Wallet not found', 404));
    }
    
    // Get CBUSD balance
    const result = await cbusdService.getBalance(wallet.id);
    
    res.status(200).json({
      success: true,
      balance: {
        cbusd_balance: result.cbusd_balance,
        wallet_address: result.wallet_address,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    return next(new AppError('Failed to get CBUSD balance: ' + error.message, 500));
  }
});

/**
 * @desc    Transfer CBUSD to another user by phone number (crypto native)
 * @route   POST /api/cbusd/transfer
 * @access  Private
 */
const transferCBUSD = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { recipient_phone, recipient_country_code, amount } = req.body;
  
  try {
    // Validate recipient phone number
    const phoneValidation = phoneService.validatePhoneNumber(recipient_phone, recipient_country_code);
    if (!phoneValidation.isValid) {
      return next(new AppError(phoneValidation.message, 400));
    }
    
    // Lookup recipient by phone
    const recipient = await phoneService.lookupUserByPhone(phoneValidation.e164Format);
    if (!recipient) {
      return next(new AppError('Recipient not found', 404));
    }
    
    // Check if trying to send to self
    if (recipient.id === userId) {
      return next(new AppError('Cannot send to yourself', 400));
    }
    
    // Get sender wallet
    const senderWallet = await Wallet.findByUserId(userId);
    if (!senderWallet) {
      return next(new AppError('Sender wallet not found', 404));
    }
    
    // Check if sender has sufficient CBUSD balance
    if (senderWallet.cbusd_balance < parseFloat(amount)) {
      return next(new AppError('Insufficient CBUSD balance', 400));
    }
    
    // Get recipient wallet
    const recipientWallet = await Wallet.findByUserId(recipient.id);
    if (!recipientWallet) {
      return next(new AppError('Recipient wallet not found', 404));
    }
    
    // Process the transfer
    const result = await cbusdService.transferCBUSD(
      userId,
      senderWallet.id,
      recipient.id,
      recipientWallet.id,
      parseFloat(amount)
    );
    
    res.status(200).json({
      success: true,
      message: 'CBUSD transferred successfully',
      transaction: {
        transaction_id: result.transaction_id,
        amount: result.amount,
        recipient: recipient.phone_number,
        timestamp: result.timestamp
      }
    });
  } catch (error) {
    return next(new AppError('Failed to transfer CBUSD: ' + error.message, 500));
  }
});

module.exports = {
  mintCBUSD,
  burnCBUSD,
  getBalance,
  transferCBUSD
}; 