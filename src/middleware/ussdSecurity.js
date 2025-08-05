const rateLimit = require('express-rate-limit');
const { setCache, getCache } = require('../utils/redis');

/**
 * USSD-specific rate limiting
 * More permissive than API calls but still protects against abuse
 */
const ussdRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per IP
  message: {
    error: 'Too many USSD requests. Please try again later.',
    end_session: true
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for trusted telecom provider IPs
    const trustedIPs = (process.env.TRUSTED_USSD_IPS || '').split(',');
    return trustedIPs.includes(req.ip);
  }
});

/**
 * Phone number specific rate limiting
 * Prevents abuse from individual phone numbers
 */
const phoneRateLimit = async (req, res, next) => {
  try {
    const phoneNumber = req.body.phone_number;
    if (!phoneNumber) {
      return next();
    }

    const key = `ussd:rate:${phoneNumber}`;
    const requests = await getCache(key) || 0;
    
    if (requests >= 30) { // 30 requests per hour per phone
      return res.status(200).json({
        success: false,
        message: 'Too many requests from this phone number. Please try again later.',
        end_session: true
      });
    }

    await setCache(key, requests + 1, 60 * 60); // 1 hour
    next();
  } catch (error) {
    console.error('Phone rate limit error:', error);
    next(); // Continue on error
  }
};

/**
 * Network operator IP validation
 * Ensures USSD requests come from authorized telecom providers
 */
const validateNetworkOperator = (req, res, next) => {
  // In production, this should validate against known telecom provider IPs
  const allowedNetworks = {
    'MTN': process.env.MTN_USSD_IPS || '',
    'AIRTEL': process.env.AIRTEL_USSD_IPS || '',
    'GLO': process.env.GLO_USSD_IPS || '',
    '9MOBILE': process.env.NINEMOBILE_USSD_IPS || ''
  };

  const clientIP = req.ip || req.connection.remoteAddress;
  const networkCode = req.body.network_code;

  // Skip validation in development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  if (!networkCode || !allowedNetworks[networkCode]) {
    return res.status(403).json({
      error: 'Unauthorized network operator'
    });
  }

  const allowedIPs = allowedNetworks[networkCode].split(',');
  if (!allowedIPs.includes(clientIP)) {
    console.warn(`USSD request from unauthorized IP: ${clientIP} for network: ${networkCode}`);
    return res.status(403).json({
      error: 'Unauthorized IP address'
    });
  }

  next();
};

/**
 * USSD session validation
 * Validates session format and prevents session hijacking
 */
const validateUssdSession = async (req, res, next) => {
  try {
    const { session_id, phone_number } = req.body;
    
    if (!session_id || !phone_number) {
      return next(); // Let controller handle missing data
    }

    // For session-based requests, validate session belongs to phone number
    if (req.path === '/session') {
      const sessionKey = `ussd:${session_id}`;
      const session = await getCache(sessionKey);
      
      if (session && session.phone_number !== phone_number) {
        return res.status(200).json({
          success: false,
          message: 'Invalid session. Please dial *737# to start again.',
          end_session: true
        });
      }
    }

    next();
  } catch (error) {
    console.error('USSD session validation error:', error);
    next(); // Continue on error
  }
};

/**
 * Log USSD requests for monitoring
 */
const logUssdRequest = (req, res, next) => {
  const { phone_number, network_code, session_id, text } = req.body;
  
  console.log('USSD Request:', {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    phone: phone_number ? phone_number.replace(/\d{4}$/, '****') : 'N/A', // Mask last 4 digits
    network: network_code,
    session: session_id,
    input_length: text ? text.length : 0,
    endpoint: req.path
  });

  next();
};

module.exports = {
  ussdRateLimit,
  phoneRateLimit,
  validateNetworkOperator,
  validateUssdSession,
  logUssdRequest
};
