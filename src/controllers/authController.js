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
const phoneService = require('../services/phoneService');
const phoneVerificationService = require('../services/phoneVerificationService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code, email, password, first_name, last_name } = req.body;
  
  // Validate phone number
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
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
  const verificationResult = await phoneVerificationService.sendVerificationCode(
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
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  try {
    // Use production-ready verification service
    const verificationResult = await phoneVerificationService.verifyCode(
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
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
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
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  try {
    const result = await phoneVerificationService.sendVerificationCode(phoneValidation.e164Format);
    
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
  const phoneValidation = phoneService.validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  try {
    const status = await phoneVerificationService.getVerificationStatus(phoneValidation.e164Format);
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    return next(new AppError('Failed to get verification status: ' + error.message, 500));
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
}; 