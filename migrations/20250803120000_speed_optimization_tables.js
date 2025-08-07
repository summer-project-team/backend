/**
 * Migration for speed optimization features
 * Tables for instant settlement, parallel processing, and enhanced webhooks
 */

exports.up = async function(knex) {
  // Liquidity pools for instant settlement (only if it doesn't exist)
  const hasLiquidityPools = await knex.schema.hasTable('liquidity_pools');
  if (!hasLiquidityPools) {
    await knex.schema.createTable('liquidity_pools', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('currency', 10).notNullable();
    table.decimal('available_amount', 20, 8).defaultTo(0);
    table.decimal('reserved_amount', 20, 8).defaultTo(0);
    table.decimal('total_capacity', 20, 8).notNullable();
    table.decimal('min_threshold', 20, 8).defaultTo(0);
    table.decimal('max_threshold', 20, 8).defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.jsonb('settings').nullable();
    table.timestamps(true, true);
    
    table.unique(['currency']);
    table.index(['currency', 'is_active']);
  });
  }

  // Instant settlement transactions tracking
  const hasInstantSettlements = await knex.schema.hasTable('instant_settlements');
  if (!hasInstantSettlements) {
    await knex.schema.createTable('instant_settlements', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.enum('type', ['deposit', 'withdrawal']).notNullable();
    table.string('currency', 10).notNullable();
    table.decimal('amount', 20, 8).notNullable();
    table.decimal('pool_amount_used', 20, 8).notNullable();
    table.string('background_process_id', 100).nullable();
    table.enum('background_status', ['pending', 'processing', 'completed', 'failed']).defaultTo('pending');
    table.text('background_error').nullable();
    table.timestamps(true, true);
    
    table.index(['user_id', 'type']);
    table.index(['currency', 'type']);
    table.index(['background_status']);
  });
  }

  // Parallel processing tasks tracking
  await knex.schema.createTable('parallel_processing_tasks', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').references('id').inTable('transactions').onDelete('CASCADE');
    table.string('task_type', 50).notNullable(); // 'validation', 'minting', 'burning', 'bank_transfer'
    table.enum('status', ['pending', 'running', 'completed', 'failed']).defaultTo('pending');
    table.decimal('progress_percentage', 5, 2).defaultTo(0);
    table.jsonb('task_data').nullable();
    table.text('error_message').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamps(true, true);
    
    table.index(['transaction_id', 'task_type']);
    table.index(['status']);
  });

  // Enhanced webhook processing queue
  await knex.schema.createTable('webhook_processing_queue', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('webhook_type', 50).notNullable(); // 'stripe', 'flutterwave', 'bank'
    table.string('event_type', 100).notNullable();
    table.jsonb('webhook_data').notNullable();
    table.string('batch_id', 100).nullable();
    table.integer('priority').defaultTo(5); // 1=highest, 10=lowest
    table.enum('status', ['queued', 'processing', 'completed', 'failed', 'retrying']).defaultTo('queued');
    table.integer('retry_count').defaultTo(0);
    table.integer('max_retries').defaultTo(3);
    table.text('error_message').nullable();
    table.timestamp('scheduled_at').nullable();
    table.timestamp('processed_at').nullable();
    table.timestamps(true, true);
    
    table.index(['status', 'priority', 'scheduled_at']);
    table.index(['webhook_type', 'status']);
    table.index(['batch_id']);
  });

  // Webhook processing statistics
  await knex.schema.createTable('webhook_processing_stats', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('batch_id', 100).notNullable();
    table.integer('total_webhooks').notNullable();
    table.integer('processed_webhooks').defaultTo(0);
    table.integer('failed_webhooks').defaultTo(0);
    table.decimal('avg_processing_time_ms', 10, 2).nullable();
    table.decimal('total_processing_time_ms', 15, 2).nullable();
    table.timestamp('batch_started_at').nullable();
    table.timestamp('batch_completed_at').nullable();
    table.timestamps(true, true);
    
    table.unique(['batch_id']);
    table.index(['batch_started_at']);
  });

  // User instant settlement eligibility cache
  await knex.schema.createTable('user_instant_eligibility', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('currency', 10).notNullable();
    table.enum('transaction_type', ['deposit', 'withdrawal']).notNullable();
    table.decimal('max_instant_amount', 20, 8).notNullable();
    table.decimal('daily_instant_used', 20, 8).defaultTo(0);
    table.decimal('daily_instant_limit', 20, 8).notNullable();
    table.integer('trust_score').defaultTo(50); // 0-100
    table.date('calculation_date').notNullable();
    table.timestamps(true, true);
    
    table.unique(['user_id', 'currency', 'transaction_type', 'calculation_date']);
    table.index(['user_id', 'transaction_type']);
    table.index(['calculation_date']);
  });

  // Initialize default liquidity pools
  await knex('liquidity_pools').insert([
    {
      currency: 'USD',
      available_amount: 50000.00,
      total_capacity: 100000.00,
      min_threshold: 5000.00,
      max_threshold: 10000.00,
      settings: JSON.stringify({
        instant_deposit_limit: 1000,
        instant_withdrawal_limit: 500,
        refill_threshold: 0.2
      })
    },
    {
      currency: 'NGN',
      available_amount: 75000000.00,
      total_capacity: 150000000.00,
      min_threshold: 7500000.00,
      max_threshold: 15000000.00,
      settings: JSON.stringify({
        instant_deposit_limit: 1500000,
        instant_withdrawal_limit: 750000,
        refill_threshold: 0.2
      })
    },
    {
      currency: 'GBP',
      available_amount: 40000.00,
      total_capacity: 80000.00,
      min_threshold: 4000.00,
      max_threshold: 8000.00,
      settings: JSON.stringify({
        instant_deposit_limit: 800,
        instant_withdrawal_limit: 400,
        refill_threshold: 0.2
      })
    }
  ]);
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('user_instant_eligibility');
  await knex.schema.dropTableIfExists('webhook_processing_stats');
  await knex.schema.dropTableIfExists('webhook_processing_queue');
  await knex.schema.dropTableIfExists('parallel_processing_tasks');
  await knex.schema.dropTableIfExists('instant_settlements');
  await knex.schema.dropTableIfExists('liquidity_pools');
};