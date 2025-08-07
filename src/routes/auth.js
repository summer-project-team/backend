const express = require('express');
const { 
  register, 
  verifyPhone, 
  resendVerificationCode,
  getVerificationStatus,
  login, 
  refreshToken, 
  logout,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { validate, schemas } = require('../middleware/validation');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiting');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', authLimiter, validate(schemas.register), register);
router.post('/verify-phone', authLimiter, validate(schemas.verifyPhone), verifyPhone);
router.post('/resend-verification', authLimiter, validate(schemas.resendVerification), resendVerificationCode);
router.get('/verification-status/:phone_number/:country_code', authLimiter, getVerificationStatus);
router.post('/login', authLimiter, validate(schemas.login), login);
router.post('/refresh', authLimiter, refreshToken);

// Password reset routes with strict rate limiting
router.post('/forgot-password', passwordResetLimiter, validate(schemas.forgotPassword), forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate(schemas.resetPassword), resetPassword);

// Protected routes
router.post('/logout', protect, logout);

module.exports = router; 