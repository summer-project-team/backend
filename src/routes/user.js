const express = require('express');
const { getProfile, updateProfile, getWallet, lookupUser, validatePhone } = require('../controllers/userController');
const { validate, schemas } = require('../middleware/validation');
const { lookupLimiter } = require('../middleware/rateLimiting');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(protect);

// User routes
router.get('/me', getProfile);
router.put('/update-profile', validate(schemas.updateProfile), updateProfile);
router.put('/profile', validate(schemas.updateProfile), updateProfile); // Add alias for backward compatibility
router.get('/wallet', getWallet);
router.post('/lookup', lookupLimiter, lookupUser);
router.post('/validate-phone', validate(schemas.validatePhone), validatePhone);

module.exports = router; 