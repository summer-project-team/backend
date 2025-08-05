const express = require('express');
const { 
  processUssdSession, 
  initiateUssdSession, 
  getUssdStatus, 
  handleProviderCallback 
} = require('../controllers/ussdController');
const { validate, schemas } = require('../middleware/validation');
const { ussdLimiter } = require('../middleware/rateLimiting');
const {
  ussdRateLimit,
  phoneRateLimit,
  validateNetworkOperator,
  validateUssdSession,
  logUssdRequest
} = require('../middleware/ussdSecurity');

const router = express.Router();

// Apply security middleware to all USSD routes
router.use(logUssdRequest);
router.use(ussdRateLimit);
router.use(phoneRateLimit);
router.use(validateNetworkOperator);
router.use(validateUssdSession);

// USSD routes (typically unprotected but with IP restrictions)
router.post('/session', validate(schemas.ussdSession), processUssdSession);
router.post('/initiate', validate(schemas.ussdInitiate), initiateUssdSession);
router.get('/status/:sessionId', validate(schemas.ussdStatus, 'params'), getUssdStatus);
router.post('/callback', validate(schemas.ussdCallback), handleProviderCallback);

module.exports = router; 