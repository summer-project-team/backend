const { createClient } = require('redis');

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

// Handle Redis errors
redisClient.on('error', (err) => {
  console.error('Redis Error:', err);
});

/**
 * Initialize Redis connection
 */
const initializeRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected');
    return redisClient;
  } catch (error) {
    console.error('Redis connection failed:', error);
    throw error;
  }
};

/**
 * Set data in Redis with optional expiration
 * @param {string} key - The key to store
 * @param {any} value - The value to store
 * @param {number} expireSeconds - Expiration time in seconds (optional)
 */
const setCache = async (key, value, expireSeconds = null) => {
  try {
    const stringValue = JSON.stringify(value);
    if (expireSeconds) {
      await redisClient.setEx(key, expireSeconds, stringValue);
    } else {
      await redisClient.set(key, stringValue);
    }
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
};

/**
 * Get data from Redis
 * @param {string} key - The key to retrieve
 * @returns {any} The stored value or null
 */
const getCache = async (key) => {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
};

/**
 * Delete data from Redis
 * @param {string} key - The key to delete
 */
const deleteCache = async (key) => {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
};

module.exports = {
  redisClient,
  initializeRedis,
  setCache,
  getCache,
  deleteCache,
}; 