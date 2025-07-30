const express = require('express');
const {
  registerBank,
  getBankById,
  listBanks,
  processB2BTransfer,
  getB2BQuote,
  getTransferStatus,
  verifyWebhook,
  processBatchTransfer
} = require('../controllers/bankIntegrationController');
const { validate, schemas } = require('../middleware/validation');
const { protect, restrictTo } = require('../middleware/auth');
const { apiKeyAuth } = require('../middleware/auth');

const router = express.Router();

// Admin routes (protected and restricted to admin)
router.post('/register', protect, restrictTo('admin'), registerBank);
router.get('/:id', protect, restrictTo('admin'), getBankById);
router.get('/list', protect, restrictTo('admin'), listBanks);

// Bank API routes (protected by API key)
router.post('/b2b-transfer', apiKeyAuth, validate(schemas.b2bTransfer), processB2BTransfer);
router.post('/batch-transfer', apiKeyAuth, validate(schemas.b2bBatchTransfer), processBatchTransfer);
router.post('/b2b-quote', apiKeyAuth, validate(schemas.b2bQuote), getB2BQuote);
router.get('/transfer-status/:id', apiKeyAuth, getTransferStatus);

// Webhook route (public but verified by signature)
router.post('/webhook-verify', validate(schemas.webhookVerify), verifyWebhook);

module.exports = router; 