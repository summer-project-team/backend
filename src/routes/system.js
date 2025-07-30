const express = require('express');
const { getSystemStatus, refreshRates, healthCheck, getMetrics } = require('../controllers/systemController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/status', getSystemStatus);
router.get('/health', healthCheck);

// Protected routes
router.post('/refresh-rates', protect, restrictTo('admin'), refreshRates);
router.get('/metrics', protect, restrictTo('admin'), getMetrics);

module.exports = router; 