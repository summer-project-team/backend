const express = require('express');
const { getUserDashboard } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Protect all dashboard routes
router.use(protect);

/**
 * @route   GET /api/dashboard
 * @desc    Get user dashboard data
 * @access  Private
 */
router.get('/', getUserDashboard);

module.exports = router; 