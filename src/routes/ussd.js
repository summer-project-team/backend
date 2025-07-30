const express = require('express');
const { processUssdSession } = require('../controllers/ussdController');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// USSD routes (typically unprotected but with IP restrictions)
router.post('/session', processUssdSession);

module.exports = router; 