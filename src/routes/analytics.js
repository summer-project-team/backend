const express = require('express');
const { 
  getVolumeData,
  getCorridorAnalytics,
  getUserActivity,
  getPerformanceMetrics,
  getSystemStatus,
  getFraudIndicators,
  getDashboardData,
  getSpendingPatterns,
  getTransactionTrends,
  getSummary,
  getMonthlyComparison,
  getCurrencyDistribution,
  getCBUSDFlows,
  getCBUSDCirculation
} = require('../controllers/analyticsController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// Basic analytics endpoints
router.get('/volume', getVolumeData);
router.get('/corridor/:fromCurrency/:toCurrency', getCorridorAnalytics);
router.get('/spending-patterns', getSpendingPatterns);
router.get('/transaction-trends', getTransactionTrends);
router.get('/summary', getSummary);
router.get('/monthly-comparison', getMonthlyComparison);
router.get('/currency-distribution', getCurrencyDistribution);

// CBUSD-specific analytics endpoints
router.get('/cbusd-flows', getCBUSDFlows);
router.get('/cbusd-circulation', getCBUSDCirculation);

// Admin-only endpoints
router.get('/user-activity', restrictTo('admin'), getUserActivity);
router.get('/performance', restrictTo('admin'), getPerformanceMetrics);
router.get('/system-status', restrictTo('admin'), getSystemStatus);
router.get('/fraud-indicators', restrictTo('admin'), getFraudIndicators);
router.get('/dashboard', restrictTo('admin'), getDashboardData);

module.exports = router; 