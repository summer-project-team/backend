const express = require('express');
const { 
  linkAccount,
  getAccounts,
  verifyDeposit,
  verifyAccount
} = require('../controllers/bankingController');
const { validate, schemas } = require('../middleware/validation');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// Banking routes
router.post('/link-account', validate(schemas.linkAccount), linkAccount);
router.get('/accounts', getAccounts);
router.post('/verify-deposit', verifyDeposit);
router.post('/verify-account', verifyAccount);

module.exports = router; 