console.log('=== APPLICATION STARTING ===');

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED PROMISE REJECTION ===');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack);
  // Don't exit immediately, let's see what happens
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  // Don't exit immediately, let's see what happens
});

// Log when the process is about to exit
process.on('exit', (code) => {
  console.log('=== PROCESS EXITING WITH CODE:', code, '===');
});

// Log SIGTERM and SIGINT
process.on('SIGTERM', () => {
  console.log('=== RECEIVED SIGTERM ===');
});

process.on('SIGINT', () => {
  console.log('=== RECEIVED SIGINT ===');
});

console.log('=== ERROR HANDLERS REGISTERED ===');


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { errorHandler } = require('./middleware/errorHandler');
const rateLimit = require('express-rate-limit');
const path = require('path'); // Added for express.static

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const transactionRoutes = require('./routes/transactions');
const passwordResetRoutes = require('./routes/passwordReset');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

// Import middleware
const { requestLogger } = require('./middleware/requestLogger');
const { apiLimiter, authLimiter, ussdLimiter } = require('./middleware/rateLimiting');

// Import Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');
const bankingRoutes = require('./routes/banking');
const cbusdRoutes = require('./routes/cbusd');
const systemRoutes = require('./routes/system');
const analyticsRoutes = require('./routes/analytics');
const bankIntegrationRoutes = require('./routes/bankIntegration');
const ussdRoutes = require('./routes/ussd');
const liquidityRoutes = require('./routes/liquidity');
const mlRoutes = require('./routes/ml');
const securityRoutes = require('./routes/security');
// New routes
const aliasRoutes = require('./routes/alias');
const websocketRoutes = require('./routes/websocket');
const walletRoutes = require('./routes/wallet');
const dashboardRoutes = require('./routes/dashboard');

// Initialize database connection
const { initializeDatabase } = require('./utils/database');

// Initialize Redis connection
const { initializeRedis } = require('./utils/redis');

// Import rate refresh service
const rateRefreshService = require('./services/rateRefreshService');
// Import retry service
const retryService = require('./services/retryService');
// Import fallback service
const fallbackService = require('./services/fallbackService');

// Create Express app
const app = express();

// Enable CORS
app.use(cors());

// Set security HTTP headers
app.use(helmet());

// Request logging
app.use(requestLogger);
app.use(morgan('dev'));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoints
app.use('/health', healthRoutes);

console.log('=== DEBUGGING ROUTERS ===');
console.log('authRoutes:', typeof authRoutes);
console.log('userRoutes:', typeof userRoutes);
console.log('aliasRoutes:', typeof aliasRoutes);
console.log('transactionRoutes:', typeof transactionRoutes);
console.log('bankingRoutes:', typeof bankingRoutes);
console.log('cbusdRoutes:', typeof cbusdRoutes);
console.log('systemRoutes:', typeof systemRoutes);
console.log('analyticsRoutes:', typeof analyticsRoutes);
console.log('bankIntegrationRoutes:', typeof bankIntegrationRoutes);
console.log('ussdRoutes:', typeof ussdRoutes);
console.log('liquidityRoutes:', typeof liquidityRoutes);
console.log('mlRoutes:', typeof mlRoutes);
console.log('securityRoutes:', typeof securityRoutes);
console.log('websocketRoutes:', typeof websocketRoutes);
console.log('walletRoutes:', typeof walletRoutes);
console.log('dashboardRoutes:', typeof dashboardRoutes);
console.log('=== END ROUTER DEBUG ===');

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/ussd', ussdLimiter);

// Body parser middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser middleware
app.use(cookieParser());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Logging in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Rate limiting is already applied from middleware/rateLimiting.js
// We don't need to define it again here

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'CrossBridge API',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString() 
  });
});

// API routes
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes); // Updated to users plural for consistency
app.use('/api/users', aliasRoutes); // Alias routes for backward compatibility
app.use('/api/transactions', transactionRoutes);
app.use('/api/banking', bankingRoutes);
app.use('/api/cbusd', cbusdRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/bank-integration', bankIntegrationRoutes);
app.use('/api/ussd', ussdRoutes);
app.use('/api/liquidity', liquidityRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/security', securityRoutes);
// New routes
app.use('/api/websocket', websocketRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Temporary debug registration route
app.post('/api/auth/register-debug', async (req, res) => {
  console.log('=== DEBUG REGISTRATION START ===');
  
  try {
    console.log('Step 1: Route handler entered');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Test imports one by one
    console.log('Step 2: Testing User model import...');
    const User = require('./models/User');
    console.log('✓ User model imported');
    console.log('User methods:', Object.getOwnPropertyNames(User));
    
    console.log('Step 3: Testing Wallet model import...');
    const Wallet = require('./models/Wallet');
    console.log('✓ Wallet model imported');
    
    console.log('Step 4: Testing helpers import...');
    const { validatePhoneNumber } = require('./utils/helpers');
    console.log('✓ Helpers imported');
    
    console.log('Step 5: Testing phone validation...');
    const { phone_number, country_code } = req.body;
    const phoneValidation = validatePhoneNumber(phone_number, country_code);
    console.log('✓ Phone validation result:', phoneValidation);
    
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        error: 'Phone validation failed',
        details: phoneValidation.message
      });
    }
    
    console.log('Step 6: Testing User.findByPhone...');
    const existingUser = await User.findByPhone(phoneValidation.e164Format, country_code);
    console.log('✓ User.findByPhone completed, result:', !!existingUser);
    
    console.log('Step 7: Testing User.findByEmail...');
    const { email } = req.body;
    const existingEmail = await User.findByEmail(email);
    console.log('✓ User.findByEmail completed, result:', !!existingEmail);
    
    // If we get here, the basic operations work
    res.json({ 
      success: true, 
      message: 'Debug completed successfully - all basic operations work',
      phoneValidation,
      existingUser: !!existingUser,
      existingEmail: !!existingEmail
    });
    
  } catch (error) {
    console.error('=== DEBUG ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      details: error.toString()
    });
  }
  
  console.log('=== DEBUG REGISTRATION END ===');
});

// Test validation middleware specifically
app.post('/api/auth/register-test-validation', (req, res, next) => {
  console.log('=== TESTING VALIDATION MIDDLEWARE ===');
  console.log('Request body:', req.body);
  
  try {
    const { validate, schemas } = require('./middleware/validation');
    console.log('✓ Validation middleware imported');
    console.log('Available schemas:', Object.keys(schemas));
    
    // Apply validation manually
    const validationMiddleware = validate(schemas.register);
    console.log('✓ Validation middleware created');
    
    // Test validation
    validationMiddleware(req, res, (error) => {
      if (error) {
        console.error('✗ Validation failed:', error);
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.message,
          stack: error.stack 
        });
      }
      
      console.log('✓ Validation passed');
      res.json({ success: true, message: 'Validation middleware works' });
    });
    
  } catch (error) {
    console.error('=== VALIDATION TEST ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});


// Add this to your app.js to test the rate limiter
app.post('/api/auth/register-test-ratelimit', (req, res, next) => {
  console.log('=== TESTING RATE LIMITER ===');
  
  try {
    const { authLimiter } = require('./middleware/rateLimiting');
    console.log('✓ Rate limiter imported');
    
    // Apply rate limiter
    authLimiter(req, res, (error) => {
      if (error) {
        console.error('✗ Rate limiter failed:', error);
        return res.status(500).json({ 
          error: 'Rate limiter failed', 
          details: error.message,
          stack: error.stack 
        });
      }
      
      console.log('✓ Rate limiter passed');
      res.json({ success: true, message: 'Rate limiter works' });
    });
    
  } catch (error) {
    console.error('=== RATE LIMITER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});


// Add this to your app.js to test the register controller directly
app.post('/api/auth/register-test-controller', async (req, res, next) => {
  console.log('=== TESTING REGISTER CONTROLLER ===');
  
  try {
    const { register } = require('./controllers/authController');
    console.log('✓ Register controller imported');
    
    // Call the register function directly
    console.log('Calling register function...');
    await register(req, res, next);
    console.log('✓ Register function completed');
    
  } catch (error) {
    console.error('=== REGISTER CONTROLLER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error.message,
        stack: error.stack 
      });
    }
  }
});


// Add this to your app.js to debug each step of registration
app.post('/api/auth/register-debug-steps', async (req, res, next) => {
  console.log('=== STEP BY STEP REGISTRATION DEBUG ===');
  
  try {
    const { phone_number, country_code, email, password } = req.body;
    console.log('Step 1: Extracted request data');
    
    // Import what we need
    const User = require('./models/User');
    const Wallet = require('./models/Wallet');
    const { validatePhoneNumber, generateWalletAddress, generateVerificationCode } = require('./utils/helpers');
    const { setCache } = require('./utils/redis');
    console.log('Step 2: All imports successful');
    
    // Validate phone
    const phoneValidation = validatePhoneNumber(phone_number, country_code);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.message });
    }
    console.log('Step 3: Phone validation passed');
    
    // Check existing user
    const existingUser = await User.findByPhone(phoneValidation.e164Format, country_code);
    if (existingUser) {
      return res.status(400).json({ error: 'User exists' });
    }
    console.log('Step 4: No existing user found');
    
    // Check existing email
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email exists' });
    }
    console.log('Step 5: No existing email found');
    
    // Create user - THIS IS LIKELY WHERE IT CRASHES
    console.log('Step 6: About to create user...');
    const user = await User.create({
      phone_number: phoneValidation.e164Format,
      country_code,
      email,
      password,
    });
    console.log('Step 6: ✓ User created successfully, ID:', user.id);
    
    // Generate wallet address
    console.log('Step 7: About to generate wallet address...');
    const walletAddress = generateWalletAddress(phoneValidation.e164Format);
    console.log('Step 7: ✓ Wallet address generated:', walletAddress);
    
    // Create wallet
    console.log('Step 8: About to create wallet...');
    const wallet = await Wallet.create({
      user_id: user.id,
      wallet_address: walletAddress,
    });
    console.log('Step 8: ✓ Wallet created successfully, ID:', wallet.id);
    
    // Create phone mapping
    console.log('Step 9: About to create phone mapping...');
    await Wallet.createPhoneMapping(phoneValidation.e164Format, user.id, wallet.id);
    console.log('Step 9: ✓ Phone mapping created');
    
    // Generate verification code
    console.log('Step 10: About to generate verification code...');
    const verificationCode = generateVerificationCode();
    console.log('Step 10: ✓ Verification code generated:', verificationCode);
    
    // Store in Redis
    console.log('Step 11: About to store in Redis...');
    await setCache(`verify_${phoneValidation.e164Format}`, verificationCode, 10 * 60);
    console.log('Step 11: ✓ Stored in Redis');
    
    // Send SMS (skip for now to avoid SMS issues)
    console.log('Step 12: Skipping SMS for debug');
    
    console.log('Step 13: Sending success response...');
    res.status(201).json({
      success: true,
      message: 'User registered successfully (DEBUG)',
      user_id: user.id,
      phone_number: user.phone_number,
      requires_verification: true,
    });
    console.log('Step 13: ✓ Response sent');
    
  } catch (error) {
    console.error('=== REGISTRATION STEP ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error.message,
        stack: error.stack 
      });
    }
  }
  
  console.log('=== STEP BY STEP DEBUG END ===');
});


// Add this to debug the User.create method specifically
app.post('/api/auth/debug-user-create', async (req, res) => {
  console.log('=== DEBUG USER.CREATE ===');
  
  try {
    const { phone_number, country_code, email, password } = req.body;
    
    const User = require('./models/User');
    const { validatePhoneNumber } = require('./utils/helpers');
    
    const phoneValidation = validatePhoneNumber(phone_number, country_code);
    console.log('Phone validation:', phoneValidation);
    
    console.log('About to call User.create with data:', {
      phone_number: phoneValidation.e164Format,
      country_code,
      email,
      password: '[HIDDEN]'
    });
    
    // Try to create user with detailed error catching
    const user = await User.create({
      phone_number: phoneValidation.e164Format,
      country_code,
      email,
      password,
    });
    
    console.log('User created successfully:', user);
    res.json({ success: true, user });
    
  } catch (error) {
    console.error('=== USER.CREATE ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', error);
    
    res.status(500).json({
      error: 'User.create failed',
      name: error.name,
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack
    });
  }
});

// Add this to debug the database table structure
app.get('/api/debug/database-tables', async (req, res) => {
  console.log('=== DEBUG DATABASE TABLES ===');
  
  try {
    const { db } = require('./utils/database');
    
    // Check if users table exists
    console.log('Checking if users table exists...');
    const tableExists = await db.schema.hasTable('users');
    console.log('Users table exists:', tableExists);
    
    if (tableExists) {
      // Get table info
      console.log('Getting table column info...');
      const columnInfo = await db('users').columnInfo();
      console.log('Users table columns:', columnInfo);
      
      // Count existing users
      const userCount = await db('users').count('* as count').first();
      console.log('Existing user count:', userCount.count);
      
      res.json({
        success: true,
        tableExists: true,
        columns: columnInfo,
        userCount: userCount.count
      });
    } else {
      res.json({
        success: true,
        tableExists: false,
        message: 'Users table does not exist - this is the problem!'
      });
    }
    
  } catch (error) {
    console.error('=== DATABASE DEBUG ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

app.get('/api/debug/list-tables', async (req, res) => {
  console.log('=== DEBUG LIST ALL TABLES ===');
  
  try {
    const { db } = require('./utils/database');
    
    // List all tables in the database
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('All tables in database:', tables.rows);
    
    res.json({
      success: true,
      tables: tables.rows.map(row => row.table_name)
    });
    
  } catch (error) {
    console.error('=== LIST TABLES ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});


// Add this to test the raw database insertion
app.post('/api/debug/raw-insert', async (req, res) => {
  console.log('=== DEBUG RAW DATABASE INSERT ===');
  
  try {
    const { phone_number, country_code, email, password } = req.body;
    const { db } = require('./utils/database');
    const bcrypt = require('bcryptjs');
    const { validatePhoneNumber } = require('./utils/helpers');
    
    const phoneValidation = validatePhoneNumber(phone_number, country_code);
    
    console.log('Step 1: About to hash password...');
    const password_hash = await bcrypt.hash(password, 10);
    console.log('Step 1: ✓ Password hashed successfully');
    
    console.log('Step 2: Preparing data for insertion...');
    const insertData = {
      phone_number: phoneValidation.e164Format,
      country_code,
      email,
      password_hash,
    };
    console.log('Insert data:', insertData);
    
    console.log('Step 3: About to insert into database...');
    console.log('Using db instance:', typeof db);
    
    // Try the actual insertion
    const result = await db('users')
      .insert(insertData)
      .returning('*');
    
    console.log('Step 3: ✓ Database insertion successful');
    console.log('Result:', result);
    
    res.json({
      success: true,
      message: 'Raw insert successful',
      user: result[0]
    });
    
  } catch (error) {
    console.error('=== RAW INSERT ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Error constraint:', error.constraint);
    console.error('Error table:', error.table);
    console.error('Error column:', error.column);
    console.error('Error stack:', error.stack);
    console.error('Full error:', error);
    
    res.status(500).json({
      error: 'Raw insert failed',
      name: error.name,
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table,
      column: error.column
    });
  }
});

// Add this to test bcrypt specifically
app.post('/api/debug/bcrypt', async (req, res) => {
  console.log('=== DEBUG BCRYPT ===');
  
  try {
    const { password } = req.body;
    const bcrypt = require('bcryptjs');
    
    console.log('Step 1: Testing bcrypt import...');
    console.log('Bcrypt imported:', typeof bcrypt);
    
    console.log('Step 2: About to hash password...');
    console.log('Password length:', password ? password.length : 'undefined');
    
    const hash = await bcrypt.hash(password, 10);
    
    console.log('Step 2: ✓ Password hashed successfully');
    console.log('Hash length:', hash.length);
    console.log('Hash preview:', hash.substring(0, 20) + '...');
    
    console.log('Step 3: Testing password verification...');
    const isValid = await bcrypt.compare(password, hash);
    console.log('Step 3: ✓ Verification result:', isValid);
    
    res.json({
      success: true,
      message: 'Bcrypt working correctly',
      hashLength: hash.length,
      verificationWorks: isValid
    });
    
  } catch (error) {
    console.error('=== BCRYPT ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});


// Error handling middleware
app.use(errorHandler);

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database connection established');
    
    // Initialize Redis
    await initializeRedis();
    console.log('Redis connection established');
    
    // Start the server with HTTP server reference for WebSocket
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
    
    // Initialize WebSocket server
    const { initializeWebSocket } = require('./utils/websocket');
    initializeWebSocket(server);
    console.log('WebSocket server initialized');
    
    // Start rate refresh service
    rateRefreshService.start();
    console.log('Rate refresh service started');
    
    // Start transaction retry service
    retryService.startScheduler();
    console.log('Transaction retry service started');

    // Log server startup
    console.log(`CrossBridge API Server running in ${process.env.NODE_ENV || 'development'} mode`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app; 