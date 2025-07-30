const express = require('express');
const { mintCBUSD, burnCBUSD, getBalance, transferCBUSD } = require('../controllers/cbusdController');
const { validate, schemas } = require('../middleware/validation');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// CBUSD routes
router.post('/mint', validate(schemas.mint), mintCBUSD);
router.post('/burn', validate(schemas.burn), burnCBUSD);
router.get('/balance', getBalance);
router.post('/transfer', validate(schemas.transfer), transferCBUSD);

module.exports = router; 