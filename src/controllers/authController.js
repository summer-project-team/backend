const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');
const { 
  generateToken, 
  generateRefreshToken, 
  blacklistToken,
  generateWalletAddress,
  generateVerificationCode
} = require('../utils/helpers');
const { setCache, getCache } = require('../utils/redis');
const phoneManagementService = require('../services/phoneManagementService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code, email, password, first_name, last_name } = req.body;
  
  // Validate phone number
  const phoneValidation = phoneManagementService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  // Check if user already exists
  const existingUser = await User.findByPhone(phoneValidation.e164Format, country_code);
  if (existingUser) {
    return next(new AppError('User with this phone number already exists', 400));
  }
  
  // Check if email already exists
  const existingEmail = await User.findByEmail(email);
  if (existingEmail) {
    return next(new AppError('User with this email already exists', 400));
  }
  
  // Create user
  const user = await User.create({
    phone_number: phoneValidation.e164Format,
    country_code,
    email,
    password,
    first_name,
    last_name,
  });
  
  // Generate wallet address
  const walletAddress = generateWalletAddress(phoneValidation.e164Format);
  
  // Create wallet
  const wallet = await Wallet.create({
    user_id: user.id,
    wallet_address: walletAddress,
  });
  
  // Create phone wallet mapping
  await Wallet.createPhoneMapping(phoneValidation.e164Format, user.id, wallet.id);
  
  // Send verification code using production-ready service
  const verificationResult = await phoneManagementService.sendVerificationCode(
    phoneValidation.e164Format,
    'register',
    {
      metadata: {
        user_id: user.id,
        registration_time: new Date().toISOString()
      }
    }
  );

  if (!verificationResult.success) {
    // If SMS fails, we should still allow the user to exist but mark as unverified
    console.error('Failed to send verification SMS:', verificationResult.error);
    
    return res.status(201).json({
      success: true,
      message: 'User registered successfully, but verification SMS failed. Please request a new verification code.',
      user_id: user.id,
      phone_number: user.phone_number,
      requires_verification: true,
      sms_error: verificationResult.message
    });
  }

  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please verify your phone number.',
    user_id: user.id,
    phone_number: user.phone_number,
    requires_verification: true,
    verification: {
      expires_in: verificationResult.expiresIn,
      resend_cooldown: verificationResult.resendCooldown,
      attempts_remaining: verificationResult.attemptsRemaining
    }
  });
});

/**
 * @desc    Verify phone number
 * @route   POST /api/auth/verify-phone
 * @access  Public
 */
const verifyPhone = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code, verification_code } = req.body;
  
  // Validate phone number
  const phoneValidation = phoneManagementService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  try {
    // Use production-ready verification service
    const verificationResult = await phoneManagementService.verifyCode(
      phoneValidation.e164Format,
      verification_code
    );
    
    if (!verificationResult.success) {
      return next(new AppError(verificationResult.message, 400));
    }
    
    // Find user
    const user = await User.findByPhone(phoneValidation.e164Format, country_code);
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    
    // Generate tokens
    const token = generateToken({ id: user.id, phone_number: user.phone_number, country_code: user.country_code });
    const refreshToken = generateRefreshToken({ id: user.id });
    
    res.status(200).json({
      success: true,
      message: 'Phone verified successfully',
      token,
      refresh_token: refreshToken,
    });
  } catch (error) {
    return next(new AppError('Verification failed: ' + error.message, 500));
  }
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code, password } = req.body;
  
  // Validate phone number
  const phoneValidation = phoneManagementService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  // Find user
  const user = await User.findByPhone(phoneValidation.e164Format, country_code);
  if (!user) {
    return next(new AppError('Invalid credentials', 401));
  }
  
  // Verify password
  const isPasswordValid = await User.verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    return next(new AppError('Invalid credentials', 401));
  }
  
  // Generate tokens
  const token = generateToken({ id: user.id, phone_number: user.phone_number, country_code: user.country_code });
  const refreshToken = generateRefreshToken({ id: user.id });
  
  // Set refresh token cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  
  res.status(200).json({
    success: true,
    token,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      phone_number: user.phone_number,
      country_code: user.country_code,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    },
  });
});

/**
 * @desc    Refresh token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res, next) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return next(new AppError('Refresh token is required', 400));
  }
  
  try {
    // Verify refresh token
    const decoded = require('jsonwebtoken').verify(
      refresh_token,
      process.env.JWT_REFRESH_SECRET
    );
    
    // Get user
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('Invalid refresh token', 401));
    }
    
    // Generate new tokens
    const newToken = generateToken({ id: user.id, phone_number: user.phone_number, country_code: user.country_code });
    const newRefreshToken = generateRefreshToken({ id: user.id });
    
    res.status(200).json({
      success: true,
      token: newToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    return next(new AppError('Invalid refresh token', 401));
  }
});

/**
 * @desc    Logout user
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    // Blacklist token
    await blacklistToken(token);
  }
  
  // Clear refresh token cookie
  res.clearCookie('refreshToken');
  
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * @desc    Resend verification code
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
const resendVerificationCode = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code } = req.body;
  
  // Validate phone number
  const phoneValidation = phoneManagementService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  try {
    const result = await phoneManagementService.sendVerificationCode(phoneValidation.e164Format);
    
    if (!result.success) {
      return next(new AppError(result.message, 429));
    }
    
    res.status(200).json({
      success: true,
      message: 'Verification code sent successfully',
      nextResendAvailable: result.nextResendAvailable,
      provider: result.provider
    });
  } catch (error) {
    return next(new AppError('Failed to send verification code: ' + error.message, 500));
  }
});

/**
 * @desc    Get verification status
 * @route   GET /api/auth/verification-status/:phone_number/:country_code
 * @access  Public
 */
const getVerificationStatus = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code } = req.params;
  
  // Validate phone number
  const phoneValidation = phoneManagementService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  try {
    const status = await phoneManagementService.getVerificationStatus(phoneValidation.e164Format);
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    return next(new AppError('Failed to get verification status: ' + error.message, 500));
  }
});

/**
 * @desc    Request password reset
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  
  // Always return success for security (timing attack prevention)
  const successResponse = {
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.'
  };
  
  try {
    // Find user by email
    const user = await User.findByEmail(email);
    
    if (!user) {
      // Log attempt for security monitoring
      console.log(`Password reset attempt for non-existent email: ${email}`);
      return res.status(200).json(successResponse);
    }
    
    // Check rate limiting for this user (max 3 reset requests per hour)
    const resetAttemptKey = `pwd_reset_attempts:${user.id}`;
    const attempts = await getCache(resetAttemptKey);
    
    if (attempts && parseInt(attempts) >= 3) {
      console.log(`Password reset rate limit exceeded for user: ${user.id}`);
      return res.status(200).json(successResponse); // Still return success for security
    }
    
    // Generate secure reset token
    const resetToken = generateVerificationCode(32); // 32 character secure token
    const resetTokenHash = require('crypto')
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Store reset token with user ID and expiry (15 minutes)
    const resetData = {
      userId: user.id,
      email: user.email,
      createdAt: new Date().toISOString()
    };
    
    await setCache(`pwd_reset:${resetTokenHash}`, JSON.stringify(resetData), 900); // 15 minutes
    
    // Increment rate limiting counter
    await setCache(resetAttemptKey, (parseInt(attempts) || 0) + 1, 3600); // 1 hour
    
    // Send reset email
    const { sendPasswordResetEmail } = require('../utils/email');
    await sendPasswordResetEmail(user.email, resetToken);
    
    // Log successful reset request
    console.log(`Password reset requested for user: ${user.id}`);
    
    res.status(200).json(successResponse);
  } catch (error) {
    console.error('Password reset request error:', error);
    // Still return success to prevent information leakage
    res.status(200).json(successResponse);
  }
});

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res, next) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return next(new AppError('Token and password are required', 400));
  }
  
  // Validate password strength
  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long', 400));
  }
  
  try {
    // Hash the provided token
    const resetTokenHash = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Get reset data from cache
    const resetDataStr = await getCache(`pwd_reset:${resetTokenHash}`);
    
    if (!resetDataStr) {
      return next(new AppError('Invalid or expired reset token', 400));
    }
    
    const resetData = JSON.parse(resetDataStr);
    
    // Verify token age (additional security check)
    const tokenAge = Date.now() - new Date(resetData.createdAt).getTime();
    if (tokenAge > 900000) { // 15 minutes in milliseconds
      await setCache(`pwd_reset:${resetTokenHash}`, null, 1); // Delete token
      return next(new AppError('Reset token has expired', 400));
    }
    
    // Find user
    const user = await User.findById(resetData.userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    
    // Verify email matches (additional security)
    if (user.email !== resetData.email) {
      console.error(`Email mismatch in password reset for user: ${user.id}`);
      return next(new AppError('Invalid reset token', 400));
    }
    
    // Update password
    await User.updatePassword(user.id, password);
    
    // Delete the reset token immediately
    await setCache(`pwd_reset:${resetTokenHash}`, null, 1);
    
    // Clear rate limiting for this user
    await setCache(`pwd_reset_attempts:${user.id}`, null, 1);
    
    // Blacklist all existing tokens for this user (force re-login)
    const { blacklistAllUserTokens } = require('../utils/helpers');
    await blacklistAllUserTokens(user.id);
    
    // Log successful password reset
    console.log(`Password successfully reset for user: ${user.id}`);
    
    res.status(200).json({
      success: true,
      message: 'Password successfully reset. Please log in with your new password.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    return next(new AppError('Failed to reset password. Please try again.', 500));
  }
});

module.exports = {
  register,
  verifyPhone,
  resendVerificationCode,
  getVerificationStatus,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword
}; 