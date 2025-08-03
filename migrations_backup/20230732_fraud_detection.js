/**
 * Migration for fraud detection tables
 */
exports.up = function(knex) {
  return Promise.all([
    // Fraud alerts table
    knex.schema.createTable('fraud_alerts', function(table) {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable();
      table.uuid('transaction_id').notNullable();
      table.integer('risk_score').notNullable();
      table.string('risk_level', 20).notNullable();
      table.json('risk_factors');
      table.string('status', 20).notNullable().defaultTo('open');
      table.text('resolution');
      table.uuid('resolved_by');
      table.timestamp('resolved_at');
      table.timestamp('created_at').notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.index('user_id');
      table.index('transaction_id');
      table.index('status');
      table.index('risk_level');
      table.index('created_at');
      
      table.foreign('user_id').references('users.id').onDelete('CASCADE');
      table.foreign('transaction_id').references('transactions.id').onDelete('CASCADE');
    }),
    
    // User devices table
    knex.schema.createTable('user_devices', function(table) {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable();
      table.string('device_fingerprint', 255).notNullable();
      table.string('device_name', 100);
      table.json('device_info');
      table.boolean('is_trusted').defaultTo(false);
      table.timestamp('created_at').notNullable();
      table.timestamp('last_used').notNullable();
      
      table.index('user_id');
      table.index('device_fingerprint');
      table.index('created_at');
      
      table.unique(['user_id', 'device_fingerprint']);
      table.foreign('user_id').references('users.id').onDelete('CASCADE');
    }),
    
    // User logins table
    knex.schema.createTable('user_logins', function(table) {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable();
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
      
      table.foreign('user_id').references('users.id').onDelete('CASCADE');
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTableIfExists('fraud_alerts'),
    knex.schema.dropTableIfExists('user_devices'),
    knex.schema.dropTableIfExists('user_logins')
  ]);
}; 