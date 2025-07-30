const express = require('express');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');
const asyncHandler = require('express-async-handler');

const router = express.Router();

/**
 * @desc    Get WebSocket token
 * @route   GET /api/websocket/token
 * @access  Private
 */
router.get('/token', protect, asyncHandler(async (req, res) => {
  try {
    const token = jwt.sign(
      { id: req.user.id },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: '1h' }
    );
    
    res.status(200).json({
      success: true,
      websocket_url: `${req.protocol}://${req.get('host')}`,
      token
    });
  } catch (error) {
    console.error('WebSocket token error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate WebSocket token' 
    });
  }
}));

module.exports = router; 