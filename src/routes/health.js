const express = require('express');
const router = express.Router();
const { db } = require('../utils/database');
const { getCache, setCache } = require('../utils/redis');
const flutterwaveService = require('../services/flutterwaveService');
const stripeService = require('../services/stripeService');
const cbusdService = require('../services/cbusdService');

/**
 * @route GET /api/health
 * @desc Basic health check endpoint
 * @access Public
 */
router.get('/', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };
  try {
    res.send(healthcheck);
  } catch (error) {
    healthcheck.message = error.message;
    res.status(503).send(healthcheck);
  }
});

/**
 * @route GET /api/health/deep
 * @desc Comprehensive health check with external dependencies
 * @access Private
 */
router.get('/deep', async (req, res) => {
  const startTime = Date.now();
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: startTime,
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {}
  };

  const checks = [];

  // Database connectivity check
  checks.push(
    (async () => {
      try {
        const dbStart = Date.now();
        await db.raw('SELECT 1 as health_check');
        const dbTime = Date.now() - dbStart;
        
        // Check specific tables
        const userCount = await db('users').count('id as count').first();
        const transactionCount = await db('transactions').count('id as count').first();
        
        healthcheck.services.database = {
          status: 'OK',
          response_time_ms: dbTime,
          user_count: parseInt(userCount.count),
          transaction_count: parseInt(transactionCount.count),
          last_checked: new Date().toISOString()
        };
      } catch (error) {
        healthcheck.services.database = {
          status: 'ERROR',
          error: error.message,
          last_checked: new Date().toISOString()
        };
        healthcheck.message = 'Database connectivity issue';
      }
    })()
  );

  // Redis connectivity check
  checks.push(
    (async () => {
      try {
        const redisStart = Date.now();
        const testKey = `health_check_${Date.now()}`;
        await setCache(testKey, 'test', 5);
        const retrieved = await getCache(testKey);
        const redisTime = Date.now() - redisStart;
        
        if (retrieved === 'test') {
          healthcheck.services.redis = {
            status: 'OK',
            response_time_ms: redisTime,
            last_checked: new Date().toISOString()
          };
        } else {
          throw new Error('Redis read/write test failed');
        }
      } catch (error) {
        healthcheck.services.redis = {
          status: 'ERROR',
          error: error.message,
          last_checked: new Date().toISOString()
        };
        healthcheck.message = 'Redis connectivity issue';
      }
    })()
  );

  // Flutterwave API check
  checks.push(
    (async () => {
      try {
        const flutterwaveStart = Date.now();
        // Use a lightweight endpoint to check connectivity
        const banks = await flutterwaveService.listBanks();
        const flutterwaveTime = Date.now() - flutterwaveStart;
        
        healthcheck.services.flutterwave = {
          status: 'OK',
          response_time_ms: flutterwaveTime,
          banks_count: banks.length || 0,
          last_checked: new Date().toISOString()
        };
      } catch (error) {
        healthcheck.services.flutterwave = {
          status: 'ERROR',
          error: error.message,
          last_checked: new Date().toISOString()
        };
        if (healthcheck.message === 'OK') {
          healthcheck.message = 'Flutterwave API issue';
        }
      }
    })()
  );

  // Stripe API check
  checks.push(
    (async () => {
      try {
        const stripeStart = Date.now();
        // Check Stripe webhook endpoint health
        const stripeHealth = await stripeService.healthCheck();
        const stripeTime = Date.now() - stripeStart;
        
        healthcheck.services.stripe = {
          status: 'OK',
          response_time_ms: stripeTime,
          webhook_status: stripeHealth.webhook_status || 'unknown',
          last_checked: new Date().toISOString()
        };
      } catch (error) {
        healthcheck.services.stripe = {
          status: 'ERROR',
          error: error.message,
          last_checked: new Date().toISOString()
        };
        if (healthcheck.message === 'OK') {
          healthcheck.message = 'Stripe API issue';
        }
      }
    })()
  );

  // CBUSD Contract check
  checks.push(
    (async () => {
      try {
        const cbusdStart = Date.now();
        const cbusdHealth = await cbusdService.healthCheck();
        const cbusdTime = Date.now() - cbusdStart;
        
        healthcheck.services.cbusd = {
          status: 'OK',
          response_time_ms: cbusdTime,
          total_supply: cbusdHealth.total_supply || 'unknown',
          contract_address: cbusdHealth.contract_address || 'unknown',
          last_checked: new Date().toISOString()
        };
      } catch (error) {
        healthcheck.services.cbusd = {
          status: 'ERROR',
          error: error.message,
          last_checked: new Date().toISOString()
        };
        if (healthcheck.message === 'OK') {
          healthcheck.message = 'CBUSD contract issue';
        }
      }
    })()
  );

  // Execute all checks in parallel
  await Promise.all(checks);

  // Calculate overall response time
  const totalTime = Date.now() - startTime;
  healthcheck.total_response_time_ms = totalTime;

  // Determine overall status
  const hasErrors = Object.values(healthcheck.services).some(service => service.status === 'ERROR');
  const statusCode = hasErrors ? 503 : 200;

  if (hasErrors) {
    healthcheck.message = 'One or more services are experiencing issues';
  }

  res.status(statusCode).json(healthcheck);
});

module.exports = router;
