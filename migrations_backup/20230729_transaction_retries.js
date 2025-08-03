/**
 * Migration to add transaction retries table
 */
exports.up = function(knex) {
  return knex.schema.createTable('transaction_retries', function(table) {
    table.uuid('id').primary();
    table.uuid('transaction_id').notNullable();
    table.integer('retry_count').notNullable().defaultTo(0);
    table.timestamp('next_retry_time').notNullable();
    table.text('failure_reason');
    table.string('failure_type', 50);
    table.string('status', 20).notNullable();
    table.timestamp('processing_started_at');
    table.timestamp('completed_at');
    table.json('result');
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('transaction_id');
    table.index('status');
    table.index('next_retry_time');
    
    // Foreign key
    table.foreign('transaction_id').references('transactions.id').onDelete('CASCADE');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('transaction_retries');
}; 