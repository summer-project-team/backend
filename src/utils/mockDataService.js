/**
 * Mock Data Service
 * This is a simple in-memory data store for testing the API without a database
 */

// Mock data storage
const data = {
  users: [
    {
      id: '9e391faf-64b2-4d4c-b879-463532920cd1',
      phone_number: '+2348012345678',
      country_code: 'NG',
      email: 'nigerian.user@example.com',
      password_hash: '$2b$10$1XpzUYu8FuvuUKhJrIpJkeu31KzNBgQ4.pIvE/kYDUlGcK.eSam8K', // Password123
      first_name: 'Adebayo',
      last_name: 'Okonkwo',
      kyc_status: 'verified',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: '7d4c12a5-f22d-4d5c-b456-f66e34567890',
      phone_number: '+447123456789',
      country_code: 'GB',
      email: 'uk.user@example.com',
      password_hash: '$2b$10$1XpzUYu8FuvuUKhJrIpJkeu31KzNBgQ4.pIvE/kYDUlGcK.eSam8K', // Password123
      first_name: 'James',
      last_name: 'Wilson',
      kyc_status: 'verified',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: '3a2b1c0d-9e8f-4a5b-8c7d-6e5f4a3b2c1d',
      phone_number: '+12025550179',
      country_code: 'US',
      email: 'us.user@example.com',
      password_hash: '$2b$10$1XpzUYu8FuvuUKhJrIpJkeu31KzNBgQ4.pIvE/kYDUlGcK.eSam8K', // Password123
      first_name: 'Sarah',
      last_name: 'Johnson',
      kyc_status: 'verified',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ],
  
  wallets: [
    {
      id: 'a1b2c3d4-e5f6-4a5b-8c7d-1e2f3a4b5c6d',
      user_id: '9e391faf-64b2-4d4c-b879-463532920cd1', // Nigerian user
      balance_ngn: 250000.00, // 250,000 NGN
      balance_gbp: 0.00,
      balance_usd: 50.00,
      cbusd_balance: 100.00,
      wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
      created_at: new Date(),
    },
    {
      id: 'b2c3d4e5-f6a7-5b6c-9d0e-2f3g4h5i6j7k',
      user_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890', // UK user
      balance_ngn: 0.00,
      balance_gbp: 500.00,
      balance_usd: 100.00,
      cbusd_balance: 200.00,
      wallet_address: '0x2345678901abcdef2345678901abcdef23456789',
      created_at: new Date(),
    },
    {
      id: 'c3d4e5f6-g7h8-6c7d-0e1f-3g4h5i6j7k8l',
      user_id: '3a2b1c0d-9e8f-4a5b-8c7d-6e5f4a3b2c1d', // US user
      balance_ngn: 0.00,
      balance_gbp: 0.00,
      balance_usd: 1000.00,
      cbusd_balance: 500.00,
      wallet_address: '0x3456789012abcdef3456789012abcdef34567890',
      created_at: new Date(),
    },
  ],
  
  phone_wallet_mapping: [
    {
      phone_number: '+2348012345678',
      user_id: '9e391faf-64b2-4d4c-b879-463532920cd1',
      wallet_id: 'a1b2c3d4-e5f6-4a5b-8c7d-1e2f3a4b5c6d',
      created_at: new Date(),
    },
    {
      phone_number: '+447123456789',
      user_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890',
      wallet_id: 'b2c3d4e5-f6a7-5b6c-9d0e-2f3g4h5i6j7k',
      created_at: new Date(),
    },
    {
      phone_number: '+12025550179',
      user_id: '3a2b1c0d-9e8f-4a5b-8c7d-6e5f4a3b2c1d',
      wallet_id: 'c3d4e5f6-g7h8-6c7d-0e1f-3g4h5i6j7k8l',
      created_at: new Date(),
    },
  ],
  
  exchange_rates: [
    {
      id: 1,
      from_currency: 'NGN',
      to_currency: 'USD',
      rate: 0.00067, // 1 NGN = 0.00067 USD (approx. 1500 NGN = 1 USD)
      fee_percentage: 0.3,
      created_at: new Date(),
    },
    {
      id: 2,
      from_currency: 'USD',
      to_currency: 'NGN',
      rate: 1500.00, // 1 USD = 1500 NGN
      fee_percentage: 0.3,
      created_at: new Date(),
    },
    {
      id: 3,
      from_currency: 'NGN',
      to_currency: 'GBP',
      rate: 0.00053, // 1 NGN = 0.00053 GBP (approx. 1900 NGN = 1 GBP)
      fee_percentage: 0.3,
      created_at: new Date(),
    },
    {
      id: 4,
      from_currency: 'GBP',
      to_currency: 'NGN',
      rate: 1900.00, // 1 GBP = 1900 NGN
      fee_percentage: 0.3,
      created_at: new Date(),
    },
    {
      id: 5,
      from_currency: 'USD',
      to_currency: 'GBP',
      rate: 0.78, // 1 USD = 0.78 GBP
      fee_percentage: 0.3,
      created_at: new Date(),
    },
    {
      id: 6,
      from_currency: 'GBP',
      to_currency: 'USD',
      rate: 1.28, // 1 GBP = 1.28 USD
      fee_percentage: 0.3,
      created_at: new Date(),
    },
  ],
  
  transactions: [
    {
      id: 'd4e5f6g7-h8i9-7d8e-1f2g-4h5i6j7k8l9m',
      sender_id: '9e391faf-64b2-4d4c-b879-463532920cd1', // Nigerian user
      recipient_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890', // UK user
      sender_phone: '+2348012345678',
      recipient_phone: '+447123456789',
      amount: 50000.00, // 50,000 NGN
      currency_from: 'NGN',
      currency_to: 'GBP',
      exchange_rate: 0.00053,
      fee: 150.00, // 0.3% of 50,000 NGN
      status: 'completed',
      transaction_type: 'app_transfer',
      reference: 'TRX-NGN-GBP-001',
      metadata: JSON.stringify({
        sender_name: 'Adebayo Okonkwo',
        recipient_name: 'James Wilson',
        note: 'Payment for services',
      }),
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      completed_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 10000), // 10 seconds later
    },
  ],
  
  bank_accounts: [],
  quotes: {},
};

// Mock database functions
const mockDb = {
  // User functions
  findUserById: (id) => {
    return data.users.find(user => user.id === id) || null;
  },
  
  findUserByPhone: (phone_number, country_code) => {
    return data.users.find(user => 
      user.phone_number === phone_number && user.country_code === country_code
    ) || null;
  },
  
  findUserByEmail: (email) => {
    return data.users.find(user => user.email === email) || null;
  },
  
  // Wallet functions
  findWalletById: (id) => {
    return data.wallets.find(wallet => wallet.id === id) || null;
  },
  
  findWalletByUserId: (userId) => {
    return data.wallets.find(wallet => wallet.user_id === userId) || null;
  },
  
  updateWalletBalance: (id, currency, amount) => {
    const wallet = data.wallets.find(wallet => wallet.id === id);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    const balanceKey = currency.toLowerCase() === 'cbusd' ? 'cbusd_balance' : `balance_${currency.toLowerCase()}`;
    
    if (amount < 0 && Math.abs(amount) > wallet[balanceKey]) {
      throw new Error('Insufficient balance');
    }
    
    wallet[balanceKey] += amount;
    
    return wallet;
  },
  
  findWalletByPhoneNumber: (phoneNumber) => {
    const mapping = data.phone_wallet_mapping.find(mapping => mapping.phone_number === phoneNumber);
    if (!mapping) {
      return null;
    }
    
    return data.wallets.find(wallet => wallet.id === mapping.wallet_id) || null;
  },
  
  // Transaction functions
  createTransaction: (transactionData) => {
    const transaction = {
      ...transactionData,
      id: transactionData.id || `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: transactionData.created_at || new Date(),
    };
    
    data.transactions.push(transaction);
    
    return transaction;
  },
  
  findTransactionById: (id) => {
    return data.transactions.find(tx => tx.id === id) || null;
  },
  
  updateTransactionStatus: (id, status, additionalData = {}) => {
    const transaction = data.transactions.find(tx => tx.id === id);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    transaction.status = status;
    
    if (status === 'completed' && !additionalData.completed_at) {
      transaction.completed_at = new Date();
    }
    
    Object.assign(transaction, additionalData);
    
    return transaction;
  },
  
  getUserTransactions: (userId, options = {}) => {
    const {
      limit = 20,
      offset = 0,
      status,
      type,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;
    
    let filteredTransactions = data.transactions.filter(tx => 
      tx.sender_id === userId || tx.recipient_id === userId
    );
    
    if (status) {
      filteredTransactions = filteredTransactions.filter(tx => tx.status === status);
    }
    
    if (type) {
      filteredTransactions = filteredTransactions.filter(tx => tx.transaction_type === type);
    }
    
    // Sort transactions
    filteredTransactions.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'desc') {
        return bValue - aValue;
      } else {
        return aValue - bValue;
      }
    });
    
    // Apply pagination
    const paginatedTransactions = filteredTransactions.slice(offset, offset + limit);
    
    return {
      transactions: paginatedTransactions,
      pagination: {
        total: filteredTransactions.length,
        limit,
        offset,
        hasMore: filteredTransactions.length > offset + limit,
      },
    };
  },
  
  // Exchange rate functions
  getExchangeRate: (fromCurrency, toCurrency) => {
    return data.exchange_rates.find(rate => 
      rate.from_currency === fromCurrency.toUpperCase() && 
      rate.to_currency === toCurrency.toUpperCase()
    ) || null;
  },
  
  getAllExchangeRates: () => {
    return data.exchange_rates;
  },
  
  // Quote functions
  saveQuote: (quote) => {
    data.quotes[quote.id] = quote;
    return quote;
  },
  
  getQuote: (quoteId) => {
    return data.quotes[quoteId] || null;
  },
};

module.exports = mockDb; 