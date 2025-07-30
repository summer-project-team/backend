const express = require('express');
const { 
  getPoolStatus,
  getAllPools,
  updatePool,
  getAlerts,
  resolveAlert,
  getRebalanceRecommendations,
  executeRebalance
} = require('../controllers/liquidityController');
const { validate, schemas } = require('../middleware/validation');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All routes are protected and restricted to admin
router.use(protect);
router.use(restrictTo('admin'));

// Pool routes
router.get('/pools', getAllPools);
router.get('/pools/:currency', getPoolStatus);
router.post('/pools/:currency/update', updatePool);

// Alert routes
router.get('/alerts', getAlerts);
router.post('/alerts/:id/resolve', resolveAlert);

// Rebalance routes
router.get('/rebalance/recommendations', getRebalanceRecommendations);
router.post('/rebalance/execute', executeRebalance);

module.exports = router; 