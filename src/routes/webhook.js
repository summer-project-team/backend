const express = require('express');
const { handleBankDeposit } = require('../controllers/webhookController');
const router = express.Router();

router.post('/bank-deposit', validate(schemas.bankDepositWebhook), handleBankDeposit);

module.exports = router;