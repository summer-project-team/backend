const express = require('express');
const { 
  getQuote, 
  sendMoney, 
  getTransactionHistory, 
  getTransaction,
  initiateDeposit,
  initiateWithdrawal,
  lockRate,
  verifyRateLock,
  cancelTransaction,
  retryTransaction
} = require('../controllers/transactionController');
const { validate, schemas } = require('../middleware/validation');
const { transactionLimiter } = require('../middleware/rateLimiting');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// Transaction routes
router.post('/quote', validate(schemas.quote), getQuote);
router.post('/lock-rate', validate(schemas.lockRate), lockRate);
router.get('/verify-lock/:lockId', verifyRateLock);
router.post('/send', transactionLimiter, validate(schemas.send), sendMoney);
router.post('/:id/cancel', cancelTransaction);
router.post('/:id/retry', retryTransaction);
router.get('/history', getTransactionHistory);
router.get('/:id', getTransaction);

// CBUSD-Bank operations (mocked data for now)
router.post('/bank-to-app', validate(schemas.bankToApp), initiateDeposit);
router.post('/app-to-bank', validate(schemas.appToBank), initiateWithdrawal);

module.exports = router; 