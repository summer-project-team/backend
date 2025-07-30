const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const asyncHandler = require('express-async-handler');
const { db } = require('../utils/database');

/**
 * @desc    Get user dashboard data
 * @route   GET /api/dashboard
 * @access  Private
 */
const getUserDashboard = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    // Get user information
    const user = await User.getProfile(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    
    // Get user's wallet
    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      return next(new AppError('Wallet not found', 404));
    }
    
    // Get total balance in USD (simplified for now)
    const balances = {
      ngn: parseFloat(wallet.balance_ngn) || 0,
      gbp: parseFloat(wallet.balance_gbp) || 0,
      usd: parseFloat(wallet.balance_usd) || 0,
      cbusd: parseFloat(wallet.cbusd_balance) || 0
    };
    
    // Get exchange rates for conversion to USD
    const exchangeRates = {
      NGN_TO_USD: 0.00068, // Example rate
      GBP_TO_USD: 1.27,     // Example rate
      USD_TO_USD: 1,
      CBUSD_TO_USD: 1
    };
    
    // Calculate total in USD
    const totalBalanceUSD = 
      balances.ngn * exchangeRates.NGN_TO_USD +
      balances.gbp * exchangeRates.GBP_TO_USD +
      balances.usd * exchangeRates.USD_TO_USD +
      balances.cbusd * exchangeRates.CBUSD_TO_USD;
    
    // Get recent transactions
    const recentTransactions = await Transaction.getRecentTransactions(userId, 5);
    
    // Get transaction statistics
    const sentCount = await db('transactions')
      .where({ sender_id: userId })
      .count('* as count')
      .first();
    
    const receivedCount = await db('transactions')
      .where({ recipient_id: userId })
      .count('* as count')
      .first();
    
    const failedCount = await db('transactions')
      .where({ 
        sender_id: userId,
        status: 'failed'
      })
      .count('* as count')
      .first();
    
    // Get saved recipients count
    const savedRecipientsCount = await db('saved_recipients')
      .where({ user_id: userId })
      .count('* as count')
      .first();
    
    // Response data
    const dashboardData = {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        country_code: user.country_code,
        kyc_status: user.kyc_status
      },
      wallet: {
        id: wallet.id,
        wallet_address: wallet.wallet_address,
        balances
      },
      total_balance_usd: totalBalanceUSD.toFixed(2),
      transaction_stats: {
        sent: parseInt(sentCount?.count) || 0,
        received: parseInt(receivedCount?.count) || 0,
        failed: parseInt(failedCount?.count) || 0,
        total: (parseInt(sentCount?.count) || 0) + (parseInt(receivedCount?.count) || 0)
      },
      saved_recipients_count: parseInt(savedRecipientsCount?.count) || 0,
      recent_transactions: recentTransactions,
      system_status: {
        status: 'operational',
        last_updated: new Date().toISOString()
      }
    };
    
    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return next(new AppError('Failed to get dashboard data', 500));
  }
});

module.exports = {
  getUserDashboard
}; 