const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { AppError } = require('../middleware/errorHandler');
const { 
  generateToken, 
  generateRefreshToken, 
  blacklistToken,
  validatePhoneNumber,
  generateWalletAddress,
  generateVerificationCode
} = require('../utils/helpers');
const { setCache, getCache } = require('../utils/redis');
const phoneService = require('../services/phoneService');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code, email, password, first_name, last_name } = req.body;
  
  // Validate phone number
  const phoneValidation = validatePhoneNumber(phone_number, country_code);
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
  
  // Generate verification code
  const verificationCode = generateVerificationCode();
  
  // Store verification code in Redis (expires in 10 minutes)
  await setCache(`verify_${phoneValidation.e164Format}`, verificationCode, 10 * 60);
  
  // Send verification SMS (mock)
  await phoneService.sendVerificationSMS(phoneValidation.e164Format, verificationCode);
  
  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please verify your phone number.',
    user_id: user.id,
    phone_number: user.phone_number,
    requires_verification: true,
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
  const phoneValidation = validatePhoneNumber(phone_number, country_code);
  if (!phoneValidation.isValid) {
    return next(new AppError(phoneValidation.message, 400));
  }
  
  // Get stored verification code
  const storedCode = await getCache(`verify_${phoneValidation.e164Format}`);
  console.log("============================================================", storedCode);
  
  if (!storedCode || storedCode !== verification_code) {
    return next(new AppError('Invalid or expired verification code', 400));
  }
  
  // Find user
  const user = await User.findByPhone(phoneValidation.e164Format, country_code);
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Clear verification code
  await setCache(`verify_${phoneValidation.e164Format}`, null);
  
  // Generate tokens
  const token = generateToken({ id: user.id, phone_number: user.phone_number, country_code: user.country_code });
  const refreshToken = generateRefreshToken({ id: user.id });
  
  res.status(200).json({
    success: true,
    message: 'Phone verified successfully',
    token,
    refresh_token: refreshToken,
  });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res, next) => {
  const { phone_number, country_code, password } = req.body;
  
  // Validate phone number
  const phoneValidation = validatePhoneNumber(phone_number, country_code);
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

module.exports = {
  register,
  verifyPhone,
  login,
  refreshToken,
  logout,
}; 