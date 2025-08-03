/**
 * Initial database schema migration
 */
exports.up = function(knex) {
  return knex.schema
    // Users table
    .createTable('users', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('phone_number').notNullable().unique();
      table.string('country_code').notNullable();
      table.string('email').notNullable().unique();
      table.string('password_hash').notNullable();
      table.string('first_name');
      table.string('last_name');
      table.enum('kyc_status', ['pending', 'verified', 'rejected']).defaultTo('pending');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Index for phone lookup
      table.index(['phone_number', 'country_code']);
    })
    
    // Wallets table
    .createTable('wallets', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('balance_ngn', 20, 2).notNullable().defaultTo(0);
      table.decimal('balance_gbp', 20, 2).notNullable().defaultTo(0);
      table.decimal('balance_usd', 20, 2).notNullable().defaultTo(0);
      table.decimal('cbusd_balance', 20, 2).notNullable().defaultTo(0);
      table.string('wallet_address').notNullable().unique();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Index for wallet lookup
      table.index('wallet_address');
    })
    
    // Transactions table
    .createTable('transactions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('sender_id').references('id').inTable('users');
      table.uuid('recipient_id').references('id').inTable('users');
      table.string('sender_phone');
      table.string('recipient_phone');
      table.decimal('amount', 20, 2).notNullable();
      table.string('currency_from').notNullable();
      table.string('currency_to').notNullable();
      table.decimal('exchange_rate', 20, 6).notNullable();
      table.decimal('fee', 20, 2).notNullable();
      table.enum('status', [
        'pending', 
        'processing', 
        'completed', 
        'failed'
      ]).defaultTo('pending');
      table.enum('transaction_type', [
        'app_transfer',
        'deposit',
        'withdrawal',
        'mint',
        'burn'
      ]).notNullable();
      table.string('reference').unique();
      table.jsonb('metadata');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');
      
      // Indexes for transaction queries
      table.index('sender_id');
      table.index('recipient_id');
      table.index(['sender_phone', 'recipient_phone']);
      table.index('status');
      table.index('transaction_type');
    })
    
    // Exchange rates table
    .createTable('exchange_rates', (table) => {
      table.increments('id').primary();
      table.string('from_currency').notNullable();
      table.string('to_currency').notNullable();
      table.decimal('rate', 20, 6).notNullable();
      table.decimal('fee_percentage', 10, 4).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Unique constraint for currency pair
      table.unique(['from_currency', 'to_currency']);
    })
    
    // Phone wallet mapping table
    .createTable('phone_wallet_mapping', (table) => {
      table.string('phone_number').notNullable().primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('wallet_id').notNullable().references('id').inTable('wallets').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Index for quick lookups
      table.index('phone_number');
    })
    
    // Bank accounts table
    .createTable('bank_accounts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('account_number').notNullable();
      table.string('bank_code').notNullable();
      table.string('bank_name').notNullable();
      table.string('account_name').notNullable();
      table.enum('account_type', ['savings', 'checking', 'current']).notNullable();
      table.string('currency').notNullable();
      table.boolean('is_verified').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Unique constraint
      table.unique(['user_id', 'account_number', 'bank_code']);
    });
};

/**
 * Rollback migration
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('bank_accounts')
    .dropTableIfExists('phone_wallet_mapping')
    .dropTableIfExists('exchange_rates')
    .dropTableIfExists('transactions')
    .dropTableIfExists('wallets')
    .dropTableIfExists('users');
}; 