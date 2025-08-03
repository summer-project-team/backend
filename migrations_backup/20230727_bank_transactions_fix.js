/**
 * Migration to add bank_transactions_proxy table for non-UUID bank IDs
 */
exports.up = async function(knex) {
  // Create bank_transactions_proxy table if it doesn't exist
  const hasBankTransactionsProxy = await knex.schema.hasTable('bank_transactions_proxy');
  if (!hasBankTransactionsProxy) {
    await knex.schema.createTable('bank_transactions_proxy', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions').onDelete('CASCADE');
      table.string('sender_bank_id').notNullable();
      table.string('recipient_bank_id').notNullable();
      table.decimal('amount', 20, 8).notNullable();
      table.string('source_currency', 3).notNullable();
      table.string('target_currency', 3).notNullable();
      table.enum('status', ['initiated', 'processing', 'completed', 'failed', 'cancelled']).notNullable().defaultTo('initiated');
      table.decimal('exchange_rate', 20, 8).notNullable();
      table.decimal('fee', 20, 8).notNullable();
      table.decimal('settled_amount', 20, 8).nullable();
      table.string('reference').notNullable();
      table.string('failure_reason').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      
      // Indexes for faster lookups
      table.index('transaction_id');
      table.index('sender_bank_id');
      table.index('recipient_bank_id');
      table.index('status');
      table.index('reference');
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('bank_transactions_proxy');
}; 