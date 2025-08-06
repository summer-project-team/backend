/**
 * Migration: Add security enhancement tables
 * For advanced fraud detection, device management, and API security
 */

exports.up = function(knex) {
  return Promise.all([
    // User devices table for device fingerprinting
    knex.schema.createTable('user_devices', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('fingerprint_hash', 64).notNullable();
      table.string('device_name', 100);
      table.text('user_agent');
      table.string('ip_address', 45);
      table.string('platform', 50);
      table.enum('trust_level', ['low', 'medium', 'high']).defaultTo('medium');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('first_seen').defaultTo(knex.fn.now());
      table.timestamp('last_seen').defaultTo(knex.fn.now());
      table.timestamps(true, true);
      
      table.foreign('user_id').references('users.id');
      table.index(['user_id', 'fingerprint_hash']);
      table.index(['fingerprint_hash']);
      table.index(['last_seen']);
    }),

    // Security events logging
    knex.schema.createTable('security_events', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned();
      table.string('event_type', 50).notNullable();
      table.json('metadata');
      table.string('ip_address', 45);
      table.text('user_agent');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.foreign('user_id').references('users.id');
      table.index(['user_id', 'event_type']);
      table.index(['event_type', 'created_at']);
      table.index(['created_at']);
    }),

    // API keys management
    knex.schema.createTable('api_keys', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned();
      table.string('key_hash', 64).notNullable().unique();
      table.string('name', 100).notNullable();
      table.json('permissions').defaultTo('[]');
      table.json('allowed_endpoints').defaultTo('["*"]');
      table.json('rate_limit').defaultTo('{}');
      table.boolean('is_active').defaultTo(true);
      table.integer('usage_count').defaultTo(0);
      table.timestamp('last_used');
      table.timestamp('expires_at');
      table.timestamps(true, true);
      
      table.foreign('user_id').references('users.id');
      table.index(['key_hash']);
      table.index(['user_id', 'is_active']);
    }),

    // User locations for geographic anomaly detection
    knex.schema.createTable('user_locations', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.decimal('latitude', 10, 8);
      table.decimal('longitude', 11, 8);
      table.string('country', 2);
      table.string('city', 100);
      table.string('ip_address', 45);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.foreign('user_id').references('users.id');
      table.index(['user_id', 'created_at']);
    }),

    // Fraud detection rules
    knex.schema.createTable('fraud_rules', function(table) {
      table.increments('id').primary();
      table.string('rule_name', 100).notNullable();
      table.string('rule_type', 50).notNullable();
      table.json('conditions').notNullable();
      table.integer('risk_score').notNullable();
      table.string('action', 20).notNullable(); // block, flag, review
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      
      table.index(['rule_type', 'is_active']);
    }),

    // Transaction risk assessments
    knex.schema.createTable('transaction_risk_assessments', function(table) {
      table.increments('id').primary();
      table.integer('transaction_id').unsigned();
      table.integer('user_id').unsigned().notNullable();
      table.string('risk_level', 20).notNullable();
      table.integer('risk_score').notNullable();
      table.json('risk_factors').defaultTo('[]');
      table.json('triggered_rules').defaultTo('[]');
      table.string('action_taken', 20);
      table.timestamp('assessed_at').defaultTo(knex.fn.now());
      
      table.foreign('transaction_id').references('transactions.id');
      table.foreign('user_id').references('users.id');
      table.index(['transaction_id']);
      table.index(['user_id', 'risk_level']);
      table.index(['assessed_at']);
    }),

    // Rate limiting tracking
    knex.schema.createTable('rate_limit_violations', function(table) {
      table.increments('id').primary();
      table.string('identifier', 100).notNullable(); // user_id, ip_address, etc.
      table.string('limit_type', 50).notNullable();
      table.integer('attempts').notNullable();
      table.integer('limit_threshold').notNullable();
      table.string('ip_address', 45);
      table.timestamp('violated_at').defaultTo(knex.fn.now());
      table.timestamp('reset_at');
      
      table.index(['identifier', 'limit_type']);
      table.index(['violated_at']);
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTableIfExists('rate_limit_violations'),
    knex.schema.dropTableIfExists('transaction_risk_assessments'),
    knex.schema.dropTableIfExists('fraud_rules'),
    knex.schema.dropTableIfExists('user_locations'),
    knex.schema.dropTableIfExists('api_keys'),
    knex.schema.dropTableIfExists('security_events'),
    knex.schema.dropTableIfExists('user_devices')
  ]);
};
