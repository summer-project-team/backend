const express = require('express');
const authController = require('../controllers/authController');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Alias for /api/auth/register
router.post('/register', validate(schemas.register), authController.register);

// Alias for /api/auth/login
router.post('/login', validate(schemas.login), authController.login);

module.exports = router; 