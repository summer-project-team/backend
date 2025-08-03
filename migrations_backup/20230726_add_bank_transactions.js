/**
 * Migration to add bank_transactions table and update existing schema
 */
exports.up = function(knex) {
  return Promise.all([
    // Create bank_transactions table if it doesn't exist
    knex.schema.hasTable('bank_transactions').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('bank_transactions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('transaction_id').notNullable().references('id').inTable('transactions');
      table.uuid('sender_bank_id').notNullable();
      table.uuid('recipient_bank_id').notNullable();
      table.decimal('amount', 20, 8).notNullable();
      table.string('source_currency', 10).notNullable();
      table.string('target_currency', 10).notNullable();
      table.string('status', 20).notNullable().defaultTo('initiated');
      table.decimal('exchange_rate', 20, 8).notNullable();
      table.decimal('fee', 20, 8).notNullable();
      table.decimal('settled_amount', 20, 8);
      table.string('reference', 100).notNullable();
      table.string('failure_reason', 255);
      table.timestamp('completed_at');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        });
      }
      return Promise.resolve();
    }),
    
    // Add transaction_type column to transactions table if it doesn't exist
    knex.schema.hasColumn('transactions', 'transaction_type').then(function(exists) {
      if (!exists) {
        return knex.schema.table('transactions', function(table) {
          table.string('transaction_type', 20).defaultTo('app_transfer');
        });
      }
      return Promise.resolve();
    }),
    
    // Create bank_integrations table if it doesn't exist
    knex.schema.hasTable('bank_integrations').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('bank_integrations', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('bank_name', 100).notNullable();
      table.string('bank_code', 20).notNullable();
      table.string('swift_code', 20);
      table.string('country_code', 5).notNullable();
      table.string('api_key', 255).notNullable();
      table.string('api_secret', 255).notNullable();
      table.jsonb('integration_settings').defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.boolean('supports_b2b').defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        });
      }
      return Promise.resolve();
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    // Drop bank_transactions table
    knex.schema.dropTableIfExists('bank_transactions'),
    
    // Remove transaction_type column if added
    knex.schema.hasColumn('transactions', 'transaction_type').then(function(exists) {
      if (exists) {
        return knex.schema.table('transactions', function(table) {
          table.dropColumn('transaction_type');
        });
      }
      return Promise.resolve();
    }),
    
    // Drop bank_integrations table
    knex.schema.dropTableIfExists('bank_integrations')
  ]);
}; 