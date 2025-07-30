const express = require('express');
const { 
  getLiquidityForecast,
  predictOptimalFee,
  forecastTransactionVolume,
  getCorridorForecasts
} = require('../controllers/mlController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Public ML endpoints for authenticated users
router.post('/optimal-fee', predictOptimalFee);

// Admin-only ML endpoints
router.get('/liquidity-forecast/:fromCurrency/:toCurrency', restrictTo('admin'), getLiquidityForecast);
router.get('/volume-forecast/:fromCurrency/:toCurrency', restrictTo('admin'), forecastTransactionVolume);
router.get('/corridor-forecasts', restrictTo('admin'), getCorridorForecasts);

module.exports = router; 