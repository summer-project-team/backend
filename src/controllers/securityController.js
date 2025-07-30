/**
 * Security Controller
 * Handles security-related endpoints including fraud detection
 */
const { AppError } = require('../middleware/errorHandler');
const fraudDetectionService = require('../services/fraudDetectionService');
const asyncHandler = require('express-async-handler');
const { db } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');

/**
 * @desc    Assess transaction risk
 * @route   POST /api/security/assess-transaction
 * @access  Private
 */
const assessTransactionRisk = asyncHandler(async (req, res, next) => {
  const { transaction_id, context } = req.body;
  
  if (!transaction_id) {
    return next(new AppError('Transaction ID is required', 400));
  }
  
  try {
    // Get transaction details
    const transaction = await db('transactions')
      .where({ id: transaction_id })
      .first();
    
    if (!transaction) {
      return next(new AppError(`Transaction ${transaction_id} not found`, 404));
    }
    
    // Assess transaction risk
    const assessment = await fraudDetectionService.assessTransactionRisk(
      transaction, 
      { 
        ...context,
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      }
    );
    
    res.status(200).json({
      success: true,
      data: assessment
    });
  } catch (error) {
    return next(new AppError(`Failed to assess transaction risk: ${error.message}`, 500));
  }
});

/**
 * @desc    Assess device risk
 * @route   POST /api/security/assess-device
 * @access  Private
 */
const assessDeviceRisk = asyncHandler(async (req, res, next) => {
  const { device_fingerprint } = req.body;
  
  if (!device_fingerprint) {
    return next(new AppError('Device fingerprint is required', 400));
  }
  
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }
  
  try {
    // Assess device risk
    const assessment = await fraudDetectionService.assessDeviceRisk(
      req.user.id, 
      device_fingerprint
    );
    
    res.status(200).json({
      success: true,
      data: assessment
    });
  } catch (error) {
    return next(new AppError(`Failed to assess device risk: ${error.message}`, 500));
  }
});

/**
 * @desc    Get fraud alerts
 * @route   GET /api/security/fraud-alerts
 * @access  Private/Admin
 */
const getFraudAlerts = asyncHandler(async (req, res, next) => {
  try {
    // Extract filters from query parameters
    const {
      user_id,
      risk_level,
      status,
      start_date,
      end_date,
      limit = 50
    } = req.query;
    
    // Build filters object
    const filters = {
      userId: user_id,
      riskLevel: risk_level,
      status,
      limit: parseInt(limit)
    };
    
    // Add date range if provided
    if (start_date && end_date) {
      filters.startDate = new Date(start_date);
      filters.endDate = new Date(end_date);
    }
    
    // Get alerts
    const alerts = await fraudDetectionService.getFraudAlerts(filters);
    
    res.status(200).json({
      success: true,
      data: alerts
    });
  } catch (error) {
    return next(new AppError(`Failed to get fraud alerts: ${error.message}`, 500));
  }
});

/**
 * @desc    Update fraud alert status
 * @route   PUT /api/security/fraud-alerts/:id
 * @access  Private/Admin
 */
const updateFraudAlert = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, resolution } = req.body;
  
  if (!status) {
    return next(new AppError('Status is required', 400));
  }
  
  if (!id) {
    return next(new AppError('Alert ID is required', 400));
  }
  
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }
  
  try {
    // Update alert status
    const updatedAlert = await fraudDetectionService.updateAlertStatus(
      id,
      status,
      resolution || '',
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      data: updatedAlert
    });
  } catch (error) {
    return next(new AppError(`Failed to update fraud alert: ${error.message}`, 500));
  }
});

/**
 * @desc    Record user login (success or failure)
 * @route   POST /api/security/record-login
 * @access  Public (but typically called internally)
 */
const recordLoginAttempt = asyncHandler(async (req, res, next) => {
  const { 
    user_id, 
    success, 
    failure_reason, 
    ip_address,
    device_fingerprint,
    country_code,
    city,
    user_agent
  } = req.body;
  
  if (!user_id || typeof success !== 'boolean') {
    return next(new AppError('User ID and success status are required', 400));
  }
  
  try {
    // Create login record
    const loginRecord = {
      id: uuidv4(),
      user_id,
      success,
      failure_reason: failure_reason || null,
      ip_address: ip_address || req.ip,
      device_fingerprint: device_fingerprint || null,
      country_code: country_code || null,
      city: city || null,
      user_agent_data: user_agent ? JSON.stringify(parseUserAgent(user_agent)) : null,
      created_at: new Date()
    };
    
    // Save to database
    await db('user_logins').insert(loginRecord);
    
    // If device fingerprint is provided and login is successful, add to user devices
    if (success && device_fingerprint) {
      await fraudDetectionService._addUserDevice(user_id, device_fingerprint);
    }
    
    res.status(200).json({
      success: true,
      message: 'Login attempt recorded'
    });
  } catch (error) {
    return next(new AppError(`Failed to record login attempt: ${error.message}`, 500));
  }
});

/**
 * Parse user agent string into structured data
 * @param {string} userAgent - User agent string
 * @returns {Object} Parsed user agent data
 */
function parseUserAgent(userAgent) {
  try {
    // In a real implementation, this would use a proper user agent parsing library
    // For now, return a simple object with the raw string
    return {
      raw: userAgent,
      browser: getUserAgentBrowser(userAgent),
      os: getUserAgentOS(userAgent),
      device: getUserAgentDevice(userAgent)
    };
  } catch (error) {
    console.error('Error parsing user agent:', error);
    return { raw: userAgent };
  }
}

/**
 * Extract browser info from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Browser name
 */
function getUserAgentBrowser(userAgent) {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) return 'Internet Explorer';
  return 'Unknown';
}

/**
 * Extract OS info from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} OS name
 */
function getUserAgentOS(userAgent) {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'MacOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  return 'Unknown';
}

/**
 * Extract device info from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Device type
 */
function getUserAgentDevice(userAgent) {
  if (userAgent.includes('Mobile')) return 'Mobile';
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) return 'Tablet';
  return 'Desktop';
}

module.exports = {
  assessTransactionRisk,
  assessDeviceRisk,
  getFraudAlerts,
  updateFraudAlert,
  recordLoginAttempt
}; 