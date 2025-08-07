const express = require('express');
const { 
  handleBankDeposit, 
  handleFlutterwaveWebhook,
  handleStripeWebhook 
} = require('../controllers/webhookController');
const { validate, schemas } = require('../middleware/validation');
const router = express.Router();

// Bank deposit webhook (general)
router.post('/bank-deposit', validate(schemas.bankDepositWebhook), handleBankDeposit);

// Payment provider specific webhooks
router.post('/flutterwave', handleFlutterwaveWebhook);
router.post('/stripe', handleStripeWebhook);

module.exports = router;