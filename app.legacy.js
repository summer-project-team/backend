// LEGACY CODE!!!

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const http = require('http');

// Database connection
const knex = require('knex')(require('./knexfile')[process.env.NODE_ENV || 'development']);

// Import services
const transactionService = require('./src/services/transaction');
const websocketService = require('./src/services/websocket');

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket service
websocketService.initialize(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Simple rate limiting middleware
const apiLimiter = function(req, res, next) {
  // Simple rate limiting implementation for Node.js v12 compatibility
  next();
};
app.use('/api/', apiLimiter);

// Authentication middleware
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'crossbridge_secret_key');
    
    req.user = {
      id: decoded.id,
      phone_number: decoded.phone_number,
      country_code: decoded.country_code,
      email: decoded.email,
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone_number, country_code, email, password, first_name, last_name } = req.body;
    
    // Validate required fields
    if (!phone_number || !country_code || !email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if user already exists
    const existingUserByPhone = await knex('users').where({ phone_number }).first();
    if (existingUserByPhone) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    
    const existingUserByEmail = await knex('users').where({ email }).first();
    if (existingUserByEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = uuidv4();
    
    // Begin transaction
    await knex.transaction(async (trx) => {
      // Insert user
      await trx('users').insert({
        id: userId,
        phone_number,
        country_code,
        email,
        password_hash,
        first_name,
        last_name,
        kyc_status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });
      
      // Create wallet for each supported currency
      const currencies = ['NGN', 'GBP', 'USD'];
      for (const currency of currencies) {
        await trx('wallets').insert({
          id: uuidv4(),
          user_id: userId,
          currency,
          balance: 0.00,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { id: userId, phone_number, country_code, email },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        phone_number,
        country_code,
        email,
        first_name,
        last_name,
        kyc_status: 'pending',
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Add the /api/users/register endpoint that redirects to /api/auth/register
app.post('/api/users/register', async (req, res) => {
  try {
    const { phone_number, country_code, email, password, first_name, last_name } = req.body;
    
    // Validate required fields
    if (!phone_number || !country_code || !email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if user already exists
    const existingUserByPhone = await knex('users').where({ phone_number }).first();
    if (existingUserByPhone) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    
    const existingUserByEmail = await knex('users').where({ email }).first();
    if (existingUserByEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Create user
    const userId = uuidv4();
    
    // Begin transaction
    await knex.transaction(async (trx) => {
      // Insert user
      await trx('users').insert({
        id: userId,
        phone_number,
        country_code,
        email,
        password_hash,
        first_name,
        last_name,
        kyc_status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });
      
      // Create wallet for each supported currency
      const currencies = ['NGN', 'GBP', 'USD'];
      for (const currency of currencies) {
        await trx('wallets').insert({
          id: uuidv4(),
          user_id: userId,
          currency,
          balance: 0.00,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { id: userId, phone_number, country_code, email },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        phone_number,
        country_code,
        email,
        first_name,
        last_name,
        kyc_status: 'pending',
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await knex('users').where({ email }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, phone_number: user.phone_number, country_code: user.country_code, email: user.email },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        phone_number: user.phone_number,
        country_code: user.country_code,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        kyc_status: user.kyc_status,
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Add the /api/users/login endpoint that redirects to /api/auth/login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await knex('users').where({ email }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, phone_number: user.phone_number, country_code: user.country_code, email: user.email },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        phone_number: user.phone_number,
        country_code: user.country_code,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        kyc_status: user.kyc_status,
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    const decoded = jwt.verify(
      refresh_token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'crossbridge_secret_key'
    );
    
    const user = await knex('users').where({ id: decoded.id }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    const token = jwt.sign(
      { id: user.id, phone_number: user.phone_number, country_code: user.country_code, email: user.email },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );
    
    res.status(200).json({
      message: 'Token refreshed successfully',
      token
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// User routes
app.get('/api/users/profile', authenticate, async (req, res) => {
  try {
    const user = await knex('users').where({ id: req.user.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove sensitive information
    const { password_hash, ...userWithoutPassword } = user;
    
    res.status(200).json({
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

// User routes (previously /api/users/me)
app.get('/api/users/me', authenticate, async (req, res) => {
  try {
    const user = await knex('users').where({ id: req.user.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove sensitive information
    const { password_hash, ...userWithoutPassword } = user;
    
    res.status(200).json({
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

// Handle both profile update endpoints
app.put('/api/users/profile', authenticate, async (req, res) => {
  try {
    const { first_name, last_name, email } = req.body;
    
    // Update user
    await knex('users')
      .where({ id: req.user.id })
      .update({
        first_name: first_name,
        last_name: last_name,
        email: email,
        updated_at: new Date()
      });
    
    // Get updated user
    const user = await knex('users').where({ id: req.user.id }).first();
    
    // Remove sensitive information
    const { password_hash, ...userWithoutPassword } = user;
    
    res.status(200).json({
      message: 'Profile updated successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Add new update-profile endpoint
app.put('/api/users/update-profile', authenticate, async (req, res) => {
  try {
    const { first_name, last_name, email } = req.body;
    
    // Update user
    await knex('users')
      .where({ id: req.user.id })
      .update({
        first_name: first_name,
        last_name: last_name,
        email: email,
        updated_at: new Date()
      });
    
    // Get updated user
    const user = await knex('users').where({ id: req.user.id }).first();
    
    // Remove sensitive information
    const { password_hash, ...userWithoutPassword } = user;
    
    res.status(200).json({
      message: 'Profile updated successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Wallet routes
app.get('/api/wallets', authenticate, async (req, res) => {
  try {
    const wallets = await knex('wallets').where({ user_id: req.user.id });
    
    res.status(200).json({
      wallets
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to get wallets' });
  }
});

app.get('/api/wallets/:currency', authenticate, async (req, res) => {
  try {
    const { currency } = req.params;
    
    const wallet = await knex('wallets')
      .where({ 
        user_id: req.user.id,
        currency: currency.toUpperCase()
      })
      .first();
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.status(200).json({
      wallet
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

// Phone lookup route
app.get('/api/users/lookup/:phoneNumber', authenticate, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const user = await knex('users').where({ phone_number: phoneNumber }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(200).json({
      user: {
        id: user.id,
        phone_number: user.phone_number,
        country_code: user.country_code,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (error) {
    console.error('Phone lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup phone number' });
  }
});

// Transaction routes - Enhanced with the transaction service
app.get('/api/transactions/quote', authenticate, async (req, res) => {
  try {
    const { amount, from, to } = req.query;
    
    if (!amount || !from || !to) {
      return res.status(400).json({ error: 'Amount, from currency, and to currency are required' });
    }
    
    // Get exchange rate
    const exchangeRate = await knex('exchange_rates')
      .where({ 
        source_currency: from.toUpperCase(), 
        target_currency: to.toUpperCase() 
      })
      .first();
      
    if (!exchangeRate) {
      return res.status(400).json({ error: 'Exchange rate not available for the selected currencies' });
    }
    
    // Calculate fee
    const fee = parseFloat(amount) * (exchangeRate.fee_percentage / 100);
    
    // Calculate converted amount
    const convertedAmount = parseFloat(amount) * exchangeRate.rate;
    
    res.status(200).json({
      quote: {
        amount: parseFloat(amount),
        from_currency: from.toUpperCase(),
        to_currency: to.toUpperCase(),
        exchange_rate: exchangeRate.rate,
        fee,
        converted_amount: convertedAmount,
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
      }
    });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
});

app.post('/api/transactions', authenticate, async (req, res) => {
  try {
    const { recipient_phone, amount, source_currency, target_currency, note } = req.body;
    
    if (!recipient_phone || !amount || !source_currency || !target_currency) {
      return res.status(400).json({ error: 'Recipient phone, amount, source currency, and target currency are required' });
    }
    
    // Check if recipient exists
    const recipient = await knex('users').where({ phone_number: recipient_phone }).first();
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Get exchange rate
    const exchangeRate = await knex('exchange_rates')
      .where({ 
        source_currency: source_currency.toUpperCase(), 
        target_currency: target_currency.toUpperCase() 
      })
      .first();
      
    if (!exchangeRate) {
      return res.status(400).json({ error: 'Exchange rate not available for the selected currencies' });
    }
    
    // Calculate fee
    const fee = parseFloat(amount) * (exchangeRate.fee_percentage / 100);
    
    // Check if sender has enough balance
    const senderWallet = await knex('wallets')
      .where({ 
        user_id: req.user.id,
        currency: source_currency.toUpperCase()
      })
      .first();
    
    if (!senderWallet) {
      return res.status(404).json({ error: 'Sender wallet not found' });
    }
    
    if (senderWallet.balance < parseFloat(amount) + fee) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Save recipient for future use
    await transactionService.saveRecipient(req.user.id, {
      recipient_phone,
      recipient_name: `${recipient.first_name} ${recipient.last_name}`,
      country_code: recipient.country_code
    });
    
    // Create transaction data
    const transactionData = {
      sender_id: req.user.id,
      recipient_id: recipient.id,
      sender_phone: req.user.phone_number,
      recipient_phone,
      sender_country_code: req.user.country_code,
      recipient_country_code: recipient.country_code,
      amount: parseFloat(amount),
      source_currency: source_currency.toUpperCase(),
      target_currency: target_currency.toUpperCase(),
      exchange_rate: exchangeRate.rate,
      fee,
      metadata: { note: note || '' }
    };
    
    // Create and process transaction
    const transaction = await transactionService.createTransaction(transactionData);
    const processedTransaction = await transactionService.completeTransaction(transaction.id);
    
    res.status(200).json({
      transaction: processedTransaction
    });
  } catch (error) {
    console.error('Send transaction error:', error);
    res.status(500).json({ error: 'Failed to send transaction', details: error.message });
  }
});

app.get('/api/transactions/history', authenticate, async (req, res) => {
  try {
    // Get query parameters
    const { 
      limit = 20, 
      offset = 0, 
      status = null, 
      startDate = null, 
      endDate = null,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;
    
    // Get transactions using the transaction service
    const result = await transactionService.getUserTransactions(req.user.id, {
      limit,
      offset,
      status,
      startDate,
      endDate,
      sortBy,
      sortOrder
    });
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

app.get('/api/transactions/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get transaction
    const transaction = await transactionService.getTransaction(id);
    
    // Check if user is authorized to view this transaction
    if (transaction.sender_id !== req.user.id && transaction.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get transaction events
    const events = await transactionService.getTransactionEvents(id);
    
    res.status(200).json({ 
      transaction,
      events
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
});

// Saved recipients routes
app.get('/api/recipients', authenticate, async (req, res) => {
  try {
    const recipients = await transactionService.getSavedRecipients(req.user.id);
    res.status(200).json({ recipients });
  } catch (error) {
    console.error('Get recipients error:', error);
    res.status(500).json({ error: 'Failed to get recipients' });
  }
});

app.post('/api/recipients/:id/favorite', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const recipient = await transactionService.toggleFavoriteRecipient(req.user.id, id);
    res.status(200).json({ recipient });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite status' });
  }
});

app.delete('/api/recipients/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await transactionService.deleteRecipient(req.user.id, id);
    
    if (success) {
      res.status(200).json({ message: 'Recipient deleted successfully' });
    } else {
      res.status(404).json({ error: 'Recipient not found' });
    }
  } catch (error) {
    console.error('Delete recipient error:', error);
    res.status(500).json({ error: 'Failed to delete recipient' });
  }
});

// Exchange rate routes
app.get('/api/exchange-rates', async (req, res) => {
  try {
    const rates = await knex('exchange_rates');
    res.status(200).json({ rates });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({ error: 'Failed to get exchange rates' });
  }
});

app.get('/api/exchange-rates/:from/:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    
    const rate = await knex('exchange_rates')
      .where({ 
        source_currency: from.toUpperCase(), 
        target_currency: to.toUpperCase() 
      })
      .first();
      
    if (!rate) {
      return res.status(404).json({ error: 'Exchange rate not found' });
    }
    
    res.status(200).json({ rate });
  } catch (error) {
    console.error('Get exchange rate error:', error);
    res.status(500).json({ error: 'Failed to get exchange rate' });
  }
});

// WebSocket connection endpoint
app.get('/api/websocket/token', authenticate, (req, res) => {
  try {
    const token = jwt.sign(
      { id: req.user.id },
      process.env.JWT_SECRET || 'crossbridge_secret_key',
      { expiresIn: '1h' }
    );
    
    res.status(200).json({
      websocket_url: `${req.protocol}://${req.get('host')}`,
      token
    });
  } catch (error) {
    console.error('WebSocket token error:', error);
    res.status(500).json({ error: 'Failed to generate WebSocket token' });
  }
});

// Demo deposit endpoint (for testing only)
app.post('/api/wallets/deposit', authenticate, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    
    if (!amount || !currency) {
      return res.status(400).json({ error: 'Amount and currency are required' });
    }
    
    if (!['NGN', 'GBP', 'USD'].includes(currency.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid currency' });
    }
    
    const wallet = await knex('wallets')
      .where({ 
        user_id: req.user.id,
        currency: currency.toUpperCase()
      })
      .first();
      
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    // Update wallet balance
    await knex('wallets')
      .where({ id: wallet.id })
      .increment('balance', parseFloat(amount));
    
    // Get updated wallet
    const updatedWallet = await knex('wallets')
      .where({ id: wallet.id })
      .first();
    
    res.status(200).json({
      message: 'Demo deposit successful',
      wallet: updatedWallet
    });
  } catch (error) {
    console.error('Demo deposit error:', error);
    res.status(500).json({ error: 'Failed to process demo deposit' });
  }
});

// Bank-to-bank transfer endpoint
app.post('/api/banking/b2b-transfer', authenticate, async (req, res) => {
  try {
    const {
      sender_bank_id,
      recipient_bank_id,
      amount,
      source_currency,
      target_currency,
      sender_account_number,
      recipient_account_number,
      sender_account_name,
      recipient_account_name,
      swift_code,
      routing_number,
      memo
    } = req.body;

    // Validate required fields
    if (!sender_bank_id || !recipient_bank_id || !amount || !source_currency || 
        !target_currency || !sender_account_number || !recipient_account_number) {
      return res.status(400).json({ 
        error: 'Missing required fields for bank-to-bank transfer' 
      });
    }

    // Get sender bank
    const senderBank = await knex('banking_partners')
      .where({ id: sender_bank_id })
      .first();

    if (!senderBank) {
      return res.status(404).json({ error: 'Sender bank not found' });
    }

    // Get recipient bank
    const recipientBank = await knex('banking_partners')
      .where({ id: recipient_bank_id })
      .first();

    if (!recipientBank) {
      return res.status(404).json({ error: 'Recipient bank not found' });
    }

    // Get exchange rate
    const exchangeRate = await knex('exchange_rates')
      .where({
        source_currency: source_currency.toUpperCase(),
        target_currency: target_currency.toUpperCase()
      })
      .first();

    if (!exchangeRate) {
      return res.status(400).json({ 
        error: 'Exchange rate not available for the selected currencies' 
      });
    }

    // Calculate fee - we'll use the bank's fee percentage
    const fee = parseFloat(amount) * (senderBank.fee_percentage / 100);

    // For simplicity in this prototype, we'll use the current user's ID for both sender and recipient
    // In a real implementation, we'd create proper bank entities with their own IDs
    const userId = req.user.id;

    // Create transfer data
    const transferData = {
      sender_bank_id,
      recipient_bank_id,
      // Use the actual user ID for both sender and recipient in this prototype
      sender_id: userId,
      recipient_id: userId,
      amount: parseFloat(amount),
      source_currency: source_currency.toUpperCase(),
      target_currency: target_currency.toUpperCase(),
      exchange_rate: exchangeRate.rate,
      fee,
      sender_country_code: senderBank.country_code,
      recipient_country_code: recipientBank.country_code,
      sender_bank_name: senderBank.name,
      recipient_bank_name: recipientBank.name,
      sender_account_number,
      recipient_account_number,
      sender_account_name,
      recipient_account_name,
      swift_code: swift_code || senderBank.swift_code,
      routing_number,
      memo,
      integration_id: req.user.id // Using user ID as integration ID for demo
    };

    // Create a simpler transaction data for our prototype
    const transactionData = {
      id: uuidv4(),
      sender_id: userId,
      recipient_id: userId,
      sender_phone: null,
      recipient_phone: null,
      sender_country_code: senderBank.country_code,
      recipient_country_code: recipientBank.country_code,
      amount: parseFloat(amount),
      source_currency: source_currency.toUpperCase(),
      target_currency: target_currency.toUpperCase(),
      exchange_rate: exchangeRate.rate,
      fee,
      status: 'initiated',
      reference_id: `B2B-${source_currency.toUpperCase()}-${target_currency.toUpperCase()}-${Date.now().toString().slice(-6)}`,
      transaction_type: 'bank_to_bank',
      metadata: JSON.stringify({
        sender_bank_id,
        recipient_bank_id,
        sender_bank_name: senderBank.name,
        recipient_bank_name: recipientBank.name,
        sender_account_number,
        recipient_account_number,
        sender_account_name,
        recipient_account_name,
        swift_code: swift_code || senderBank.swift_code,
        routing_number,
        memo: memo || '',
      }),
      is_test: false,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Insert transaction directly (simpler approach for the prototype)
    const [transaction] = await knex('transactions').insert(transactionData).returning('*');

    // Create proxy record
    await knex('bank_transactions_proxy').insert({
      transaction_id: transaction.id,
      sender_bank_id,
      recipient_bank_id,
      amount: parseFloat(amount),
      source_currency: source_currency.toUpperCase(),
      target_currency: target_currency.toUpperCase(),
      status: 'initiated',
      exchange_rate: exchangeRate.rate,
      fee,
      reference: transaction.reference_id,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Create initial transaction event
    await knex('transaction_events').insert({
      transaction_id: transaction.id,
      event_type: 'initiated',
      event_data: JSON.stringify({
        amount: parseFloat(amount),
        source_currency: source_currency.toUpperCase(),
        target_currency: target_currency.toUpperCase(),
        fee,
        bank_to_bank: true
      }),
      created_at: new Date()
    });

    // Process the transaction asynchronously
    // This would handle the actual conversion and settlement steps
    setTimeout(async () => {
      try {
        // Update to processing
        await knex('transactions')
          .where({ id: transaction.id })
          .update({
            status: 'processing',
            processing_started_at: new Date(),
            updated_at: new Date()
          });

        await knex('bank_transactions_proxy')
          .where({ transaction_id: transaction.id })
          .update({
            status: 'processing',
            updated_at: new Date()
          });

        await knex('transaction_events').insert({
          transaction_id: transaction.id,
          event_type: 'processing',
          event_data: JSON.stringify({
            started_at: new Date().toISOString()
          }),
          created_at: new Date()
        });

        // Simulate processing time
        setTimeout(async () => {
          try {
            // Complete the transaction
            const convertedAmount = parseFloat(amount) * parseFloat(exchangeRate.rate);
            
            await knex('transactions')
              .where({ id: transaction.id })
              .update({
                status: 'completed',
                completed_at: new Date(),
                updated_at: new Date()
              });

            await knex('bank_transactions_proxy')
              .where({ transaction_id: transaction.id })
              .update({
                status: 'completed',
                settled_amount: convertedAmount,
                completed_at: new Date(),
                updated_at: new Date()
              });

            await knex('transaction_events').insert({
              transaction_id: transaction.id,
              event_type: 'completed',
              event_data: JSON.stringify({
                completed_at: new Date().toISOString(),
                converted_amount: convertedAmount
              }),
              created_at: new Date()
            });

            console.log(`Bank-to-bank transfer ${transaction.id} completed`);
          } catch (error) {
            console.error('Error completing B2B transaction:', error);
          }
        }, 5000); // 5 seconds to simulate processing

      } catch (error) {
        console.error('Error processing B2B transaction:', error);
      }
    }, 1000); // 1 second delay before processing

    res.status(200).json({
      message: 'Bank-to-bank transfer initiated',
      transaction: {
        id: transaction.id,
        reference: transaction.reference_id,
        status: transaction.status,
        amount: transaction.amount,
        source_currency: transaction.source_currency,
        target_currency: transaction.target_currency,
        fee: transaction.fee,
        created_at: transaction.created_at
      }
    });
  } catch (error) {
    console.error('Bank-to-bank transfer error:', error);
    res.status(500).json({ 
      error: 'Failed to process bank-to-bank transfer', 
      details: error.message 
    });
  }
});

// Banking partners endpoints
app.get('/api/banking/partners', async (req, res) => {
  try {
    const { country_code } = req.query;
    
    let query = knex('banking_partners').where({ is_active: true });
    
    if (country_code) {
      query = query.where({ country_code: country_code.toUpperCase() });
    }
    
    const partners = await query;
    
    res.status(200).json({ partners });
  } catch (error) {
    console.error('Get banking partners error:', error);
    res.status(500).json({ error: 'Failed to get banking partners' });
  }
});

// System status endpoint
app.get('/api/system/status', async (req, res) => {
  try {
    // Check database connection
    await knex.raw('SELECT 1');
    
    // Check WebSocket status
    const wsStatus = websocketService.getOnlineUsersCount() !== undefined ? 'operational' : 'down';
    
    res.status(200).json({
      status: 'operational',
      components: {
        api: { status: 'operational' },
        database: { status: 'operational' },
        redis: { status: 'operational' },
        websocket: { status: wsStatus },
      },
      exchange_rates: {
        last_updated: new Date().toISOString(),
        status: 'up_to_date',
      },
      version: '1.0.0',
      online_users: websocketService.getOnlineUsersCount() || 0
    });
  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({
      status: 'degraded',
      components: {
        api: { status: 'operational' },
        database: { status: 'down', error: error.message },
        redis: { status: 'unknown' },
        websocket: { status: 'unknown' },
      },
      version: '1.0.0',
    });
  }
});

// Dashboard overview endpoint
app.get('/api/dashboard', authenticate, async (req, res) => {
  try {
    // Get user information
    const user = await knex('users').where({ id: req.user.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's wallets
    const wallets = await knex('wallets').where({ user_id: req.user.id });
    
    // Get total balance in USD
    let totalBalanceUSD = 0;
    for (const wallet of wallets) {
      if (wallet.currency === 'USD') {
        totalBalanceUSD += parseFloat(wallet.balance);
      } else {
        // Convert to USD
        const exchangeRate = await knex('exchange_rates')
          .where({
            source_currency: wallet.currency,
            target_currency: 'USD'
          })
          .first();
        
        if (exchangeRate) {
          totalBalanceUSD += parseFloat(wallet.balance) * parseFloat(exchangeRate.rate);
        }
      }
    }
    
    // Get recent transactions
    const recentTransactions = await knex('transactions')
      .where(function() {
        this.where('sender_id', req.user.id).orWhere('recipient_id', req.user.id);
      })
      .orderBy('created_at', 'desc')
      .limit(5);
    
    // Get transaction statistics
    const sentCount = await knex('transactions')
      .where({ sender_id: req.user.id })
      .count('* as count')
      .first();
    
    const receivedCount = await knex('transactions')
      .where({ recipient_id: req.user.id })
      .count('* as count')
      .first();
    
    const failedCount = await knex('transactions')
      .where({ 
        sender_id: req.user.id,
        status: 'failed'
      })
      .count('* as count')
      .first();
    
    // Get saved recipients count
    const savedRecipientsCount = await knex('saved_recipients')
      .where({ user_id: req.user.id })
      .count('* as count')
      .first();
    
    // Get liquidity pools information
    const liquidityPools = await knex('liquidity_pools');
    
    res.status(200).json({
      user: {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        country_code: user.country_code,
        kyc_status: user.kyc_status
      },
      wallets,
      total_balance_usd: totalBalanceUSD.toFixed(2),
      transaction_stats: {
        sent: parseInt(sentCount.count) || 0,
        received: parseInt(receivedCount.count) || 0,
        failed: parseInt(failedCount.count) || 0,
        total: (parseInt(sentCount.count) || 0) + (parseInt(receivedCount.count) || 0)
      },
      saved_recipients_count: parseInt(savedRecipientsCount.count) || 0,
      recent_transactions: recentTransactions,
      liquidity_pools: liquidityPools,
      system_status: {
        status: 'operational',
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 