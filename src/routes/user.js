const express = require('express');
const { 
  getProfile, 
  updateProfile, 
  getWallet, 
  lookupUser, 
  validatePhone,
  deleteAccount,
  hardDeleteUser,
  restoreUser,
  setupTransactionPin,
  verifyTransactionPin,
  changeTransactionPin,
  disableTransactionPin,
  getPinStatus,
} = require('../controllers/userController');
const { validate, schemas } = require('../middleware/validation');
const { lookupLimiter } = require('../middleware/rateLimiting');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public info route
router.get('/', (req, res) => {
  res.send('SecureRemit User API - All user routes are protected. For documentation, visit /docs');
});

// All routes are protected
router.use(protect);

// User routes
router.get('/me', getProfile);
router.put('/update-profile', validate(schemas.updateProfile), updateProfile);
router.put('/profile', validate(schemas.updateProfile), updateProfile); // Add alias for backward compatibility
router.get('/wallet', getWallet);
router.post('/lookup', lookupLimiter, lookupUser);
router.post('/validate-phone', validate(schemas.validatePhone), validatePhone);

// User deletion routes
router.delete('/me', deleteAccount); // Soft delete own account
router.delete('/:id/hard-delete', hardDeleteUser); // Hard delete (admin only)
router.post('/:id/restore', restoreUser); // Restore deleted user (admin only)

// PIN management routes
router.get('/pin/status', getPinStatus); // Get PIN enabled status
router.post('/pin/setup', validate(schemas.setupPin), setupTransactionPin); // Set transaction PIN
router.post('/pin/verify', validate(schemas.verifyPin), verifyTransactionPin); // Verify transaction PIN
router.put('/pin/change', validate(schemas.changePin), changeTransactionPin); // Change transaction PIN
router.delete('/pin', disableTransactionPin); // Disable transaction PIN

module.exports = router; 