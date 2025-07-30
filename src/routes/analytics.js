const express = require('express');
const { 
  getVolumeData,
  getCorridorAnalytics,
  getUserActivity,
  getPerformanceMetrics,
  getSystemStatus,
  getFraudIndicators,
  getDashboardData
} = require('../controllers/analyticsController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// Basic analytics endpoints
router.get('/volume', getVolumeData);
router.get('/corridor/:fromCurrency/:toCurrency', getCorridorAnalytics);

// Admin-only endpoints
router.get('/user-activity', restrictTo('admin'), getUserActivity);
router.get('/performance', restrictTo('admin'), getPerformanceMetrics);
router.get('/system-status', restrictTo('admin'), getSystemStatus);
router.get('/fraud-indicators', restrictTo('admin'), getFraudIndicators);
router.get('/dashboard', restrictTo('admin'), getDashboardData);

module.exports = router; 