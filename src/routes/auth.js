const express = require('express');
const { register, verifyPhone, login, refreshToken, logout } = require('../controllers/authController');
const { validate, schemas } = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimiting');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', authLimiter, validate(schemas.register), register);
router.post('/verify-phone', authLimiter, validate(schemas.verifyPhone), verifyPhone);
router.post('/login', authLimiter, validate(schemas.login), login);
router.post('/refresh', authLimiter, refreshToken);

// Protected routes
router.post('/logout', protect, logout);

module.exports = router; 