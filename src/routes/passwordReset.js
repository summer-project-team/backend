const express = require('express');
const router = express.Router();
const { User } = require('../models/User');
const { validate } = require('../middleware/validation');
const { sendEmail } = require('../utils/email');
const crypto = require('crypto');
const { redisClient } = require('../utils/redis');

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findByEmail(email);
    
    if (!user) {
      // Return 200 even if user not found for security
      return res.status(200).json({
        status: 'success',
        message: 'If your email is registered, you will receive reset instructions'
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Store token in Redis with 1 hour expiry
    await redisClient.set(
      `pwd_reset:${resetTokenHash}`,
      user.id,
      'EX',
      3600
    );
    
    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `To reset your password, click: ${resetUrl}\nThis link expires in 1 hour.`
    });
    
    res.status(200).json({
      status: 'success',
      message: 'If your email is registered, you will receive reset instructions'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error processing password reset request'
    });
  }
});

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password using token
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 */
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    // Hash token for comparison
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Get user id from Redis
    const userId = await redisClient.get(`pwd_reset:${resetTokenHash}`);
    
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }
    
    // Update password
    const user = await User.findById(userId);
    await user.updatePassword(password);
    
    // Delete reset token
    await redisClient.del(`pwd_reset:${resetTokenHash}`);
    
    res.status(200).json({
      status: 'success',
      message: 'Password successfully reset'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error resetting password'
    });
  }
});

module.exports = router;
