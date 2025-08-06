// migrations/20250803_initial_complete_schema.js
exports.up = async function(knex) {
  // Create uuid extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  
  // Check and create tables only if they don't exist
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    await knex.schema.createTable('users', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('phone_number', 255).notNullable().unique();
      table.string('country_code', 255).notNullable();
      table.string('email', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.string('first_name', 255);
      table.string('last_name', 255);
      table.text('kyc_status').defaultTo('pending').checkIn(['pending', 'verified', 'rejected']);
      table.timestamps(true, true);
      table.timestamp('deleted_at');
      table.string('transaction_pin_hash', 255);
      table.boolean('pin_enabled').defaultTo(false);
      table.timestamp('pin_created_at');
      table.timestamp('pin_last_used');
      table.integer('pin_failed_attempts').defaultTo(0);
      table.timestamp('pin_locked_until');
      
      table.index(['phone_number', 'country_code']);
      table.index('deleted_at');
    });
  }
    
  // Wallets table
  const hasWallets = await knex.schema.hasTable('wallets');
  if (!hasWallets) {
    await knex.schema.createTable('wallets', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('balance_ngn', 20, 2).defaultTo('0').notNullable();
      table.decimal('balance_gbp', 20, 2).defaultTo('0').notNullable();
      table.decimal('balance_usd', 20, 2).defaultTo('0').notNullable();
      table.decimal('cbusd_balance', 20, 2).defaultTo('0').notNullable();
      table.string('wallet_address', 255).notNullable().unique();
      table.timestamps(true, true);
      
      table.index('wallet_address');
    });
  }
    
  // Transactions table
  const hasTransactions = await knex.schema.hasTable('transactions');
  if (!hasTransactions) {
    await knex.schema.createTable('transactions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('sender_id').references('id').inTable('users');
      table.uuid('recipient_id').references('id').inTable('users');
      table.string('sender_phone', 255);
      table.string('recipient_phone', 255);
      table.decimal('amount', 20, 2).notNullable();
      table.string('currency_from', 10);
      table.string('currency_to', 10);
      table.decimal('exchange_rate', 20, 6).notNullable();
      table.decimal('fee', 20, 2).notNullable();
      table.text('status').defaultTo('pending').checkIn(['initiated', 'processing', 'completed', 'failed', 'cancelled', 'refunded']);
      table.text('transaction_type').notNullable().checkIn(['app_transfer', 'deposit', 'withdrawal', 'mint', 'burn', 'bank_to_bank']);
      table.string('reference', 255).unique();
      table.jsonb('metadata');
      table.timestamps(true, true);
      table.timestamp('completed_at');
      table.timestamp('processing_started_at');
      table.timestamp('failed_at');
      table.timestamp('cancelled_at');
      table.timestamp('refunded_at');
      table.string('failure_reason', 255);
      table.string('cancellation_reason', 255);
      table.string('transaction_hash', 255);
      table.jsonb('routing_info');
      table.boolean('is_test').defaultTo(false);
      table.integer('retry_count').defaultTo(0);
      table.timestamp('last_retry_at');
      table.string('reference_id', 255);
      table.string('source_currency', 10);
      table.string('target_currency', 10);
      table.string('sender_country_code', 3);
      table.string('recipient_country_code', 3);
      
      table.index('sender_id');
      table.index('recipient_id');
      table.index(['sender_phone', 'recipient_phone']);
      table.index('status');
      table.index('transaction_type');
    })
    
    // Bank accounts table
    .createTable('bank_accounts', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('account_number', 255).notNullable();
      table.string('bank_code', 255).notNullable();
      table.string('bank_name', 255).notNullable();
      table.string('account_name', 255).notNullable();
      table.text('account_type').notNullable().checkIn(['savings', 'checking', 'current']);
      table.string('currency', 255).notNullable();
      table.boolean('is_verified').defaultTo(false);
      table.timestamps(true, true);
      
      table.unique(['user_id', 'account_number', 'bank_code']);
    })
    
    // Exchange rates table
    .createTable('exchange_rates', function(table) {
      table.increments('id').primary();
      table.string('from_currency', 10);
      table.string('to_currency', 10);
      table.decimal('rate', 20, 6).notNullable();
      table.decimal('fee_percentage', 10, 4).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.unique(['from_currency', 'to_currency']);
    })
    
    // Bank integrations table
    .createTable('bank_integrations', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('public.uuid_generate_v4()'));
      table.string('bank_name', 100).notNullable();
      table.string('bank_code', 20).notNullable();
      table.string('swift_code', 20);
      table.string('country_code', 5).notNullable();
      table.string('api_key', 255).notNullable();
      table.string('api_secret', 255).notNullable();
      table.jsonb('integration_settings').defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.boolean('supports_b2b').defaultTo(false);
      table.timestamps(true, true);
    })
    
    // Bank transactions table
    .createTable('bank_transactions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('public.uuid_generate_v4()'));
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions');
      table.uuid('sender_bank_id').notNullable();
      table.uuid('recipient_bank_id').notNullable();
      table.decimal('amount', 20, 8).notNullable();
      table.string('source_currency', 10).notNullable();
      table.string('target_currency', 10).notNullable();
      table.text('status').defaultTo('initiated').notNullable();
      table.decimal('exchange_rate', 20, 8).notNullable();
      table.decimal('fee', 20, 8).notNullable();
      table.decimal('settled_amount', 20, 8);
      table.string('reference', 100).notNullable();
      table.string('failure_reason', 255);
      table.timestamp('completed_at');
      table.timestamps(true, true);
    })
    
    // Bank transactions proxy table
    .createTable('bank_transactions_proxy', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('public.uuid_generate_v4()'));
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
      table.string('sender_bank_id', 255).notNullable();
      table.string('recipient_bank_id', 255).notNullable();
      table.decimal('amount', 20, 8).notNullable();
      table.string('source_currency', 10);
      table.string('target_currency', 10);
      table.text('status').defaultTo('initiated').notNullable().checkIn(['initiated', 'processing', 'completed', 'failed', 'cancelled']);
      table.decimal('exchange_rate', 20, 8).notNullable();
      table.decimal('fee', 20, 8).notNullable();
      table.decimal('settled_amount', 20, 8);
      table.string('reference', 255).notNullable();
      table.string('failure_reason', 255);
      table.timestamp('completed_at');
      table.timestamps(true, true);
      
      table.index('transaction_id');
      table.index('sender_bank_id');
      table.index('recipient_bank_id');
      table.index('status');
      table.index('reference');
    })
    
    // Additional tables...
    .createTable('bank_deposit_references', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('reference_code', 50).notNullable().unique();
      table.decimal('amount', 20, 2).notNullable();
      table.string('currency', 10);
      table.string('status', 20).defaultTo('pending');
      table.string('bank_account_id', 100).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at').notNullable();
      table.timestamp('processed_at');
    })
    
    .createTable('phone_wallet_mapping', function(table) {
      table.string('phone_number', 255).primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('wallet_id').notNullable().references('id').inTable('wallets').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index('phone_number');
    })
    
    .createTable('saved_recipients', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('public.uuid_generate_v4()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('recipient_phone', 255).notNullable();
      table.string('recipient_name', 255);
      table.string('country_code', 2).notNullable();
      table.boolean('is_favorite').defaultTo(false);
      table.timestamps(true, true);
      table.timestamp('last_used_at');
      
      table.unique(['user_id', 'recipient_phone']);
      table.index('user_id');
      table.index('recipient_phone');
    })
    
    .createTable('transaction_events', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('public.uuid_generate_v4()'));
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
      table.string('event_type', 255).notNullable();
      table.jsonb('event_data');
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      
      table.index('transaction_id');
      table.index('event_type');
    })
    
    .createTable('webhook_events', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('event_type', 50).notNullable();
      table.string('reference_code', 50);
      table.decimal('amount', 20, 2);
      table.string('currency', 3);
      table.string('bank_reference', 100);
      table.jsonb('raw_data');
      table.boolean('processed').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    
    // Liquidity and fraud tables
    .createTable('liquidity_pools', function(table) {
      table.uuid('id').primary();
      table.string('currency', 10).notNullable().unique();
      table.decimal('target_balance', 24, 8).notNullable();
      table.decimal('current_balance', 24, 8).defaultTo('0').notNullable();
      table.decimal('min_threshold', 24, 8).notNullable();
      table.decimal('max_threshold', 24, 8).notNullable();
      table.decimal('usd_rate', 24, 8).defaultTo('1').notNullable();
      table.integer('rebalance_frequency_hours').defaultTo(24).notNullable();
      table.timestamp('last_rebalance_at');
      table.boolean('is_active').defaultTo(true).notNullable();
      table.timestamps(true, true);
      
      table.index('currency');
      table.index('is_active');
    })
    
    .createTable('fraud_alerts', function(table) {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
      table.integer('risk_score').notNullable();
      table.string('risk_level', 20).notNullable();
      table.json('risk_factors');
      table.string('status', 20).defaultTo('open').notNullable();
      table.text('resolution');
      table.uuid('resolved_by');
      table.timestamp('resolved_at');
      table.timestamps(true, true);
      
      table.index('user_id');
      table.index('transaction_id');
      table.index('status');
      table.index('risk_level');
      table.index('created_at');
    })
    
    // Additional supporting tables
    .createTable('user_devices', function(table) {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('device_fingerprint', 255).notNullable();
      table.string('device_name', 100);
      table.json('device_info');
      table.boolean('is_trusted').defaultTo(false);
      table.timestamps(true, true);
      table.timestamp('last_used').notNullable();
      
      table.unique(['user_id', 'device_fingerprint']);
      table.index('user_id');
      table.index('device_fingerprint');
      table.index('created_at');
    })
    
    .createTable('user_logins', function(table) {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('ip_address', 45);
      table.string('device_fingerprint', 255);
      table.string('country_code', 2);
      table.string('city', 100);
      table.boolean('success').notNullable();
      table.string('failure_reason', 100);
      table.json('user_agent_data');
      table.timestamp('created_at').notNullable();
      
      table.index('user_id');
      table.index('ip_address');
      table.index('device_fingerprint');
      table.index('country_code');
      table.index('success');
      table.index('created_at');
    })
    
    .createTable('transaction_retries', function(table) {
      table.uuid('id').primary();
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
      table.integer('retry_count').defaultTo(0).notNullable();
      table.timestamp('next_retry_time').notNullable();
      table.text('failure_reason');
      table.string('failure_type', 50);
      table.string('status', 20).notNullable();
      table.timestamp('processing_started_at');
      table.timestamp('completed_at');
      table.json('result');
      table.timestamps(true, true);
      
      table.index('transaction_id');
      table.index('status');
      table.index('next_retry_time');
    })
    
    .createTable('payment_route_events', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('public.uuid_generate_v4()'));
      table.string('route_id', 255).notNullable();
      table.string('provider', 100).notNullable();
      table.string('corridor_key', 100).notNullable();
      table.boolean('success').notNullable();
      table.integer('duration_ms').notNullable();
      table.text('failure_reason');
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      
      table.index('provider');
      table.index('corridor_key');
      table.index('success');
      table.index('created_at');
    })
    
    // Liquidity supporting tables
    .createTable('liquidity_alerts', function(table) {
      table.uuid('id').primary();
      table.uuid('pool_id').notNullable().references('id').inTable('liquidity_pools').onDelete('CASCADE');
      table.string('currency', 10).notNullable();
      table.string('level', 20).notNullable();
      table.string('message', 255).notNullable();
      table.decimal('current_balance', 24, 8).notNullable();
      table.decimal('target_balance', 24, 8).notNullable();
      table.decimal('percent_of_target', 24, 8).notNullable();
      table.boolean('is_resolved').defaultTo(false).notNullable();
      table.string('resolution', 255);
      table.uuid('resolved_by');
      table.timestamp('resolved_at');
      table.timestamp('created_at').notNullable();
      
      table.index('pool_id');
      table.index('currency');
      table.index('level');
      table.index('is_resolved');
      table.index('created_at');
    })
    
    .createTable('liquidity_movements', function(table) {
      table.uuid('id').primary();
      table.uuid('pool_id').notNullable().references('id').inTable('liquidity_pools').onDelete('CASCADE');
      table.decimal('amount', 24, 8).notNullable();
      table.decimal('previous_balance', 24, 8).notNullable();
      table.decimal('new_balance', 24, 8).notNullable();
      table.string('reason', 255).notNullable();
      table.uuid('transaction_id');
      table.timestamp('created_at').notNullable();
      
      table.index('pool_id');
      table.index('transaction_id');
      table.index('created_at');
    })
    
    .createTable('liquidity_rebalances', function(table) {
      table.uuid('id').primary();
      table.string('action_type', 20).notNullable();
      table.string('from_currency', 10);
      table.string('to_currency', 10);
      table.decimal('amount', 24, 8).notNullable();
      table.uuid('executed_by');
      table.json('execution_result');
      table.timestamp('created_at').notNullable();
      
      table.index('action_type');
      table.index('from_currency');
      table.index('to_currency');
      table.index('created_at');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('liquidity_rebalances')
    .dropTableIfExists('liquidity_movements')
    .dropTableIfExists('liquidity_alerts')
    .dropTableIfExists('payment_route_events')
    .dropTableIfExists('transaction_retries')
    .dropTableIfExists('user_logins')
    .dropTableIfExists('user_devices')
    .dropTableIfExists('fraud_alerts')
    .dropTableIfExists('liquidity_pools')
    .dropTableIfExists('webhook_events')
    .dropTableIfExists('transaction_events')
    .dropTableIfExists('saved_recipients')
    .dropTableIfExists('phone_wallet_mapping')
    .dropTableIfExists('bank_deposit_references')
    .dropTableIfExists('bank_transactions_proxy')
    .dropTableIfExists('bank_transactions')
    .dropTableIfExists('bank_integrations')
    .dropTableIfExists('exchange_rates')
    .dropTableIfExists('bank_accounts')
    .dropTableIfExists('transactions')
    .dropTableIfExists('wallets')
    .dropTableIfExists('users')
    .raw('DROP EXTENSION IF EXISTS "uuid-ossp"');
};
}