const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { protect } = require('../middleware/auth');
const { demoDeposit } = require('../controllers/userController');

const router = express.Router();

// Protect all wallet routes
router.use(protect);

/**
 * @route   POST /api/wallets/deposit
 * @desc    Demo deposit of any currency to wallet (testing only)
 * @access  Private
 */
router.post('/deposit', demoDeposit);

module.exports = router; 