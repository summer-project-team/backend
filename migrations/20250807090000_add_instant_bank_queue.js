/**
 * Migration to add instant_bank_queue table for processing bank transfers
 */

exports.up = function(knex) {
  return knex.schema.createTable('instant_bank_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('transaction_id').notNullable().references('id').inTable('transactions');
    table.decimal('amount', 15, 2).notNullable();
    table.string('currency', 10).notNullable();
    table.jsonb('bank_details').notNullable();
    table.enum('status', ['pending', 'processing', 'completed', 'failed']).defaultTo('pending');
    table.enum('priority', ['low', 'normal', 'high', 'urgent']).defaultTo('normal');
    table.string('bank_reference').nullable();
    table.text('error_message').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamp('scheduled_at').notNullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('failed_at').nullable();
    table.timestamps(true, true);
    
    // Indexes for performance
    table.index(['status', 'priority', 'created_at']);
    table.index('transaction_id');
    table.index('scheduled_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('instant_bank_queue');
};
