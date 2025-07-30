const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Seed data for CrossBridge
 */
exports.seed = async function(knex) {
  // Enable uuid-ossp extension for UUID generation
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  
  // Clear existing data
  await knex('bank_accounts').del();
  await knex('transactions').del();
  await knex('exchange_rates').del();
  await knex('wallets').del();
  await knex('users').del();

  // Demo users
  const users = [
    {
      id: '9e391faf-64b2-4d4c-b879-463532920cd1',
      phone_number: '+2348012345678',
      country_code: 'NG',
      email: 'nigerian.user@example.com',
      password_hash: await bcrypt.hash('Password123', 10),
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
      password_hash: await bcrypt.hash('Password123', 10),
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
      password_hash: await bcrypt.hash('Password123', 10),
      first_name: 'Sarah',
      last_name: 'Johnson',
      kyc_status: 'verified',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];
  
  // Insert users
  await knex('users').insert(users);
  
  // Demo wallets
  const wallets = [
    {
      id: 'a1b2c3d4-e5f6-4a5b-8c7d-1e2f3a4b5c6d',
      user_id: '9e391faf-64b2-4d4c-b879-463532920cd1', // Nigerian user
      currency: 'NGN',
      balance: 250000.00, // 250,000 NGN
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'b2c3d4e5-f6a7-5b6c-9d0e-2f3a4b5c6d7e', // Fixed UUID format
      user_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890', // UK user
      currency: 'GBP',
      balance: 500.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'c3d4e5f6-a7b8-6c7d-0e1f-3a4b5c6d7e8f', // Fixed UUID format
      user_id: '3a2b1c0d-9e8f-4a5b-8c7d-6e5f4a3b2c1d', // US user
      currency: 'USD',
      balance: 1000.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    // Additional wallets for users with multiple currencies
    {
      id: uuidv4(),
      user_id: '9e391faf-64b2-4d4c-b879-463532920cd1', // Nigerian user
      currency: 'USD',
      balance: 50.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890', // UK user
      currency: 'USD',
      balance: 100.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }
  ];
  
  // Insert wallets
  await knex('wallets').insert(wallets);
  
  // Exchange rates
  const exchangeRates = [
    {
      source_currency: 'NGN',
      target_currency: 'USD',
      rate: 0.00067, // 1 NGN = 0.00067 USD (approx. 1500 NGN = 1 USD)
      fee_percentage: 0.3,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      source_currency: 'USD',
      target_currency: 'NGN',
      rate: 1500.00, // 1 USD = 1500 NGN
      fee_percentage: 0.3,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      source_currency: 'NGN',
      target_currency: 'GBP',
      rate: 0.00053, // 1 NGN = 0.00053 GBP (approx. 1900 NGN = 1 GBP)
      fee_percentage: 0.3,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      source_currency: 'GBP',
      target_currency: 'NGN',
      rate: 1900.00, // 1 GBP = 1900 NGN
      fee_percentage: 0.3,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      source_currency: 'USD',
      target_currency: 'GBP',
      rate: 0.78, // 1 USD = 0.78 GBP
      fee_percentage: 0.3,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      source_currency: 'GBP',
      target_currency: 'USD',
      rate: 1.28, // 1 GBP = 1.28 USD
      fee_percentage: 0.3,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];
  
  // Insert exchange rates
  await knex('exchange_rates').insert(exchangeRates);
  
  // Sample transaction
  const transactions = [
    {
      id: 'd4e5f6a7-b8c9-7d8e-1f2a-4b5c6d7e8f9a', // Fixed UUID format
      sender_id: '9e391faf-64b2-4d4c-b879-463532920cd1', // Nigerian user
      recipient_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890', // UK user
      sender_phone: '+2348012345678',
      recipient_phone: '+447123456789',
      sender_country_code: 'NG',
      recipient_country_code: 'GB',
      amount: 50000.00, // 50,000 NGN
      source_currency: 'NGN',
      target_currency: 'GBP',
      exchange_rate: 0.00053,
      fee: 150.00, // 0.3% of 50,000 NGN
      status: 'completed',
      reference_id: 'TRX-NGN-GBP-001',
      metadata: JSON.stringify({
        sender_name: 'Adebayo Okonkwo',
        recipient_name: 'James Wilson',
        note: 'Payment for services',
      }),
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 10000),
      completed_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 10000), // 10 seconds later
    },
  ];
  
  // Insert transactions
  await knex('transactions').insert(transactions);
  
  // Bank accounts
  const bankAccounts = [
    {
      id: uuidv4(),
      user_id: '9e391faf-64b2-4d4c-b879-463532920cd1', // Nigerian user
      bank_name: 'First Bank of Nigeria',
      account_number: '1234567890',
      account_holder_name: 'Adebayo Okonkwo',
      currency: 'NGN',
      country_code: 'NG',
      is_verified: true,
      is_primary: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: '7d4c12a5-f22d-4d5c-b456-f66e34567890', // UK user
      bank_name: 'Barclays',
      account_number: '12345678',
      account_holder_name: 'James Wilson',
      currency: 'GBP',
      country_code: 'GB',
      is_verified: true,
      is_primary: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: '3a2b1c0d-9e8f-4a5b-8c7d-6e5f4a3b2c1d', // US user
      bank_name: 'Chase',
      account_number: '1234567890',
      account_holder_name: 'Sarah Johnson',
      currency: 'USD',
      country_code: 'US',
      is_verified: true,
      is_primary: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];
  
  // Insert bank accounts
  await knex('bank_accounts').insert(bankAccounts);
}; 