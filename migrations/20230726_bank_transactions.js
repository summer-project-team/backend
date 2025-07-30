/**
 * Migration to add bank_transactions table
 */

exports.up = function(knex) {
  return knex.schema.hasTable('bank_transactions').then(function(exists) {
    if (!exists) {
      return knex.schema.createTable('bank_transactions', function(table) {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('transaction_id').notNullable();
        table.string('sender_bank_name', 100).notNullable();
        table.string('recipient_bank_name', 100).notNullable();
        table.string('sender_account_number', 50).notNullable();
        table.string('recipient_account_number', 50).notNullable();
        table.string('sender_account_name', 100);
        table.string('recipient_account_name', 100);
        table.decimal('amount', 20, 8).notNullable();
        table.string('currency', 10).notNullable();
        table.string('swift_code', 20);
        table.string('routing_number', 50);
        table.string('reference', 100);
        table.string('status', 20).notNullable().defaultTo('initiated');
        table.jsonb('metadata').defaultTo('{}');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      });
    }
    return Promise.resolve();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('bank_transactions');
}; 