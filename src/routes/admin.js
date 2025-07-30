const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { Transaction } = require('../models/Transaction');
const { User } = require('../models/User');
const { Wallet } = require('../models/Wallet');

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/dashboard', restrictTo('admin'), async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const monthStart = new Date(now.setDate(1));
    
    // Get today's statistics
    const todayStats = await Transaction.getStatistics(todayStart, now);
    
    // Get monthly statistics
    const monthlyStats = await Transaction.getStatistics(monthStart, now);
    
    // Get user statistics
    const totalUsers = await User.count();
    const newUsersToday = await User.countNew(todayStart);
    
    // Get wallet statistics
    const walletStats = await Wallet.getStatistics();
    
    res.status(200).json({
      status: 'success',
      data: {
        today: {
          transactions: todayStats.count,
          volume: todayStats.volume,
          new_users: newUsersToday
        },
        month: {
          transactions: monthlyStats.count,
          volume: monthlyStats.volume
        },
        total: {
          users: totalUsers,
          wallets: walletStats.total,
          total_balance: walletStats.total_balance
        }
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching dashboard data'
    });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get user list with pagination
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const users = await User.findAll({ offset, limit });
    const total = await User.count();
    
    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching users'
    });
  }
});

/**
 * @swagger
 * /api/admin/transactions:
 *   get:
 *     summary: Get transaction list with filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/transactions', protect, restrictTo('admin'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      type,
      start_date,
      end_date
    } = req.query;
    
    const offset = (page - 1) * limit;
    const filters = {};
    
    if (status) filters.status = status;
    if (type) filters.transaction_type = type;
    if (start_date) filters.created_at_gte = new Date(start_date);
    if (end_date) filters.created_at_lte = new Date(end_date);
    
    const transactions = await Transaction.findAll({
      offset,
      limit,
      filters
    });
    
    const total = await Transaction.count(filters);
    
    res.status(200).json({
      status: 'success',
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Admin transactions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching transactions'
    });
  }
});

module.exports = router;
