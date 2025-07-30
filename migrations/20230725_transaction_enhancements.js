/**
 * Migration to enhance transactions table with more detailed status tracking and additional fields
 */
exports.up = async function(knex) {
  // Check if transactions table exists
  const hasTransactions = await knex.schema.hasTable('transactions');
  
  if (hasTransactions) {
    // First run the raw SQL to update the enum
    await knex.raw(`
      ALTER TABLE transactions 
      DROP CONSTRAINT IF EXISTS transactions_status_check,
      ADD CONSTRAINT transactions_status_check 
      CHECK (status IN ('initiated', 'processing', 'completed', 'failed', 'cancelled', 'refunded'))
    `);
    
    // Then modify the transactions table to add new fields
    await knex.schema.alterTable('transactions', table => {
      // Add new fields for enhanced tracking
      table.timestamp('processing_started_at').nullable();
      table.timestamp('failed_at').nullable();
      table.timestamp('cancelled_at').nullable();
      table.timestamp('refunded_at').nullable();
      table.string('failure_reason').nullable();
      table.string('cancellation_reason').nullable();
      table.string('transaction_hash').nullable();
      table.jsonb('routing_info').nullable();
      table.boolean('is_test').defaultTo(false);
      table.integer('retry_count').defaultTo(0);
      table.timestamp('last_retry_at').nullable();
    });

    // Create transaction_events table for detailed transaction history
    await knex.schema.createTable('transaction_events', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
      table.string('event_type').notNullable();
      table.jsonb('event_data').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      
      // Index for quick lookups
      table.index('transaction_id');
      table.index('event_type');
    });

    // Create saved_recipients table
    await knex.schema.createTable('saved_recipients', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('recipient_phone').notNullable();
      table.string('recipient_name').nullable();
      table.string('country_code', 2).notNullable();
      table.boolean('is_favorite').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('last_used_at').nullable();
      
      // Unique constraint
      table.unique(['user_id', 'recipient_phone']);
      
      // Indexes
      table.index('user_id');
      table.index('recipient_phone');
    });
  }
};

exports.down = async function(knex) {
  // Drop the new tables
  await knex.schema.dropTableIfExists('transaction_events');
  await knex.schema.dropTableIfExists('saved_recipients');
  
  // Revert changes to transactions table
  if (await knex.schema.hasTable('transactions')) {
    await knex.schema.alterTable('transactions', table => {
      table.dropColumn('processing_started_at');
      table.dropColumn('failed_at');
      table.dropColumn('cancelled_at');
      table.dropColumn('refunded_at');
      table.dropColumn('failure_reason');
      table.dropColumn('cancellation_reason');
      table.dropColumn('transaction_hash');
      table.dropColumn('routing_info');
      table.dropColumn('is_test');
      table.dropColumn('retry_count');
      table.dropColumn('last_retry_at');
    });
    
    // Revert status enum
    await knex.raw(`
      ALTER TABLE transactions 
      DROP CONSTRAINT IF EXISTS transactions_status_check,
      ADD CONSTRAINT transactions_status_check 
      CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'))
    `);
  }
}; 