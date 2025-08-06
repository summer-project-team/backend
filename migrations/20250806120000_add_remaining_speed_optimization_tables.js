// Add remaining speed optimization tables
exports.up = async function(knex) {
  // Rate locks table for exchange rate locking
  await knex.schema.createTable('rate_locks', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('from_currency', 10).notNullable();
    table.string('to_currency', 10).notNullable();
    table.decimal('amount', 20, 8).notNullable();
    table.decimal('locked_rate', 20, 8).notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_used').defaultTo(false);
    table.uuid('transaction_id').references('id').inTable('transactions');
    table.timestamps(true, true);
    
    table.index('user_id');
    table.index('expires_at');
    table.index('is_used');
    table.index(['from_currency', 'to_currency']);
  });

  // Parallel processing tasks table
  await knex.schema.createTable('parallel_processing_tasks', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
    table.string('task_type', 50).notNullable(); // 'validation', 'cbusd_mint', 'bank_transfer', etc.
    table.string('status', 20).defaultTo('pending').notNullable(); // 'pending', 'processing', 'completed', 'failed'
    table.jsonb('task_data');
    table.jsonb('result_data');
    table.string('error_message', 500);
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('retry_count').defaultTo(0);
    table.timestamps(true, true);
    
    table.index('transaction_id');
    table.index('task_type');
    table.index('status');
    table.index('started_at');
  });

  // Instant settlement eligibility table
  await knex.schema.createTable('instant_settlement_eligibility', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('currency', 10).notNullable();
    table.decimal('daily_limit', 20, 8).notNullable();
    table.decimal('daily_used', 20, 8).defaultTo('0');
    table.decimal('transaction_limit', 20, 8).notNullable();
    table.boolean('is_eligible').defaultTo(true);
    table.string('risk_level', 20).defaultTo('low'); // 'low', 'medium', 'high'
    table.timestamp('last_reset_at').defaultTo(knex.fn.now());
    table.timestamps(true, true);
    
    table.unique(['user_id', 'currency']);
    table.index('user_id');
    table.index('currency');
    table.index('is_eligible');
    table.index('risk_level');
  });

  // Webhook batch processing table for enhanced webhook handling
  await knex.schema.createTable('webhook_batches', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('provider', 50).notNullable(); // 'stripe', 'flutterwave', etc.
    table.string('status', 20).defaultTo('pending'); // 'pending', 'processing', 'completed', 'failed'
    table.integer('webhook_count').defaultTo(0);
    table.timestamp('batch_started_at');
    table.timestamp('batch_completed_at');
    table.integer('processing_time_ms');
    table.jsonb('batch_summary');
    table.timestamps(true, true);
    
    table.index('provider');
    table.index('status');
    table.index('batch_started_at');
  });

  // Enhanced webhook events table (extends existing webhook_events)
  await knex.schema.createTable('webhook_processing_logs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('webhook_event_id').references('id').inTable('webhook_events').onDelete('CASCADE');
    table.uuid('batch_id').references('id').inTable('webhook_batches').onDelete('SET NULL');
    table.string('processing_stage', 50); // 'received', 'validated', 'processed', 'completed'
    table.integer('processing_time_ms');
    table.string('error_message', 500);
    table.jsonb('processing_metadata');
    table.timestamps(true, true);
    
    table.index('webhook_event_id');
    table.index('batch_id');
    table.index('processing_stage');
  });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('webhook_processing_logs')
    .dropTableIfExists('webhook_batches')
    .dropTableIfExists('instant_settlement_eligibility')
    .dropTableIfExists('parallel_processing_tasks')
    .dropTableIfExists('rate_locks');
};
