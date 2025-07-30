const express = require('express');
const router = express.Router();

/**
 * @route GET /api/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now()
  };
  try {
    res.send(healthcheck);
  } catch (error) {
    healthcheck.message = error;
    res.status(503).send();
  }
});

/**
 * @route GET /api/health/deep
 * @desc Deep health check endpoint that verifies database and redis connection
 * @access Private
 */
router.get('/deep', async (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    services: {
      database: 'OK',
      redis: 'OK',
      externalApis: 'OK'
    }
  };
  
  try {
    // Check database
    await db.raw('SELECT 1');
    
    // Check Redis
    await redisClient.ping();
    
    // Check external APIs
    // Add checks for critical external services
    
    res.send(healthcheck);
  } catch (error) {
    healthcheck.message = error.message;
    res.status(503).send(healthcheck);
  }
});

module.exports = router;
