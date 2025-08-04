const express = require('express');
const { handleBankDeposit, handleFlutterwaveWebhook } = require('../controllers/webhookController');
const { validate, schemas } = require('../middleware/validation');
const router = express.Router();

router.post('/bank-deposit', validate(schemas.bankDepositWebhook), handleBankDeposit);
router.post('/flutterwave', handleFlutterwaveWebhook);

module.exports = router;