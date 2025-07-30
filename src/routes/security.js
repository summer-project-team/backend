const express = require('express');
const { 
  assessTransactionRisk,
  assessDeviceRisk,
  getFraudAlerts,
  updateFraudAlert,
  recordLoginAttempt
} = require('../controllers/securityController');
const { protect, restrictTo } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Authenticated routes
router.use(protect);

// Transaction and device risk assessment
router.post('/assess-transaction', validate(schemas.assessTransaction), assessTransactionRisk);
router.post('/assess-device', validate(schemas.assessDevice), assessDeviceRisk);

// Login recording (typically called internally)
router.post('/record-login', validate(schemas.recordLogin), recordLoginAttempt);

// Admin-only routes
router.get('/fraud-alerts', restrictTo('admin'), getFraudAlerts);
router.put('/fraud-alerts/:id', restrictTo('admin'), validate(schemas.updateFraudAlert), updateFraudAlert);

module.exports = router; 