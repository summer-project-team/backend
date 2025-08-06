/**
 * Migration: Add monitoring and error logging tables
 * For Series A production readiness
 */

exports.up = function(knex) {
  return Promise.all([
    // Error logs table for structured error monitoring
    knex.schema.createTable('error_logs', function(table) {
      table.increments('id').primary();
      table.string('error_id', 36).notNullable().unique(); // UUID
      table.enum('type', [
        'validation',
        'authentication', 
        'authorization',
        'payment',
        'blockchain',
        'external_api',
        'database',
        'rate_limit',
        'system'
      ]).notNullable();
      table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
      table.integer('status_code').notNullable();
      table.text('message').notNullable();
      table.text('stack');
      table.json('request_data');
      table.timestamps(true, true);
      
      // Indexes for performance
      table.index(['type', 'severity']);
      table.index(['created_at']);
      table.index(['status_code']);
    }),

    // Alerts table for critical error notifications
    knex.schema.createTable('alerts', function(table) {
      table.increments('id').primary();
      table.string('alert_id', 36).notNullable().unique(); // UUID
      table.enum('type', [
        'critical_error',
        'payment_failure',
        'system_outage',
        'security_breach',
        'rate_limit_exceeded'
      ]).notNullable();
      table.string('error_id', 36); // References error_logs.error_id
      table.text('message').notNullable();
      table.enum('status', ['triggered', 'acknowledged', 'resolved']).defaultTo('triggered');
      table.timestamp('acknowledged_at');
      table.timestamp('resolved_at');
      table.timestamps(true, true);
      
      // Indexes
      table.index(['type', 'status']);
      table.index(['created_at']);
      table.foreign('error_id').references('error_logs.error_id');
    }),

    // System metrics table for health monitoring
    knex.schema.createTable('system_metrics', function(table) {
      table.increments('id').primary();
      table.string('metric_name', 100).notNullable();
      table.decimal('value', 15, 4);
      table.string('unit', 20);
      table.json('metadata');
      table.timestamp('recorded_at').defaultTo(knex.fn.now());
      
      // Indexes for time-series queries
      table.index(['metric_name', 'recorded_at']);
      table.index(['recorded_at']);
    }),

    // API performance tracking
    knex.schema.createTable('api_performance', function(table) {
      table.increments('id').primary();
      table.string('endpoint', 255).notNullable();
      table.string('method', 10).notNullable();
      table.integer('response_time_ms').notNullable();
      table.integer('status_code').notNullable();
      table.string('user_id', 36);
      table.string('ip_address', 45);
      table.timestamp('recorded_at').defaultTo(knex.fn.now());
      
      // Indexes for performance analytics
      table.index(['endpoint', 'method']);
      table.index(['recorded_at']);
      table.index(['status_code']);
    }),

    // USSD sessions table (if not exists)
    knex.schema.hasTable('ussd_sessions').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_sessions', function(table) {
          table.increments('id').primary();
          table.string('session_id', 36).notNullable().unique();
          table.integer('user_id').unsigned();
          table.string('network_code', 10);
          table.enum('status', ['active', 'completed', 'expired', 'cancelled']).defaultTo('active');
          table.timestamps(true, true);
          
          table.foreign('user_id').references('users.id');
          table.index(['session_id']);
          table.index(['user_id']);
        });
      }
    }),

    // USSD transactions table (if not exists)  
    knex.schema.hasTable('ussd_transactions').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_transactions', function(table) {
          table.increments('id').primary();
          table.string('session_id', 36);
          table.integer('transaction_id').unsigned();
          table.enum('status', ['success', 'failed', 'error']).notNullable();
          table.text('error_message');
          table.timestamps(true, true);
          
          table.foreign('session_id').references('ussd_sessions.session_id');
          table.foreign('transaction_id').references('transactions.id');
        });
      }
    }),

    // USSD callbacks table (if not exists)
    knex.schema.hasTable('ussd_callbacks').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_callbacks', function(table) {
          table.increments('id').primary();
          table.string('session_id', 36);
          table.string('network_code', 10);
          table.text('input_text');
          table.timestamps(true, true);
          
          table.foreign('session_id').references('ussd_sessions.session_id');
        });
      }
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTableIfExists('ussd_callbacks'),
    knex.schema.dropTableIfExists('ussd_transactions'),
    knex.schema.dropTableIfExists('ussd_sessions'),
    knex.schema.dropTableIfExists('api_performance'),
    knex.schema.dropTableIfExists('system_metrics'),
    knex.schema.dropTableIfExists('alerts'),
    knex.schema.dropTableIfExists('error_logs')
  ]);
};
