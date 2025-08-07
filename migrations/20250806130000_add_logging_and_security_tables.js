// Add missing logging and security tables
exports.up = async function(knex) {
  // Security events table for logging security-related events
  const hasSecurityEvents = await knex.schema.hasTable('security_events');
  if (!hasSecurityEvents) {
    await knex.schema.createTable('security_events', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.string('event_type', 50).notNullable();
      table.jsonb('metadata');
      table.string('ip_address', 45);
      table.text('user_agent');
      table.timestamps(true, true);
      
      table.index(['user_id', 'event_type']);
      table.index(['event_type', 'created_at']);
      table.index(['created_at']);
    });
  }

  // Error logs table for application error logging
  const hasErrorLogs = await knex.schema.hasTable('error_logs');
  if (!hasErrorLogs) {
    await knex.schema.createTable('error_logs', function(table) {
      table.uuid('error_id').primary();
      table.string('type', 50).notNullable();
      table.string('severity', 20).notNullable();
      table.integer('status_code');
      table.text('message').notNullable();
      table.text('stack');
      table.jsonb('request_data');
      table.timestamps(true, true);
      
      table.index(['type', 'severity']);
      table.index(['created_at']);
      table.index(['severity']);
    });
  }

  // Alerts table for system alerts
  const hasAlerts = await knex.schema.hasTable('alerts');
  if (!hasAlerts) {
    await knex.schema.createTable('alerts', function(table) {
      table.uuid('alert_id').primary();
      table.uuid('error_id').references('error_id').inTable('error_logs').onDelete('CASCADE');
      table.string('type', 50).notNullable();
      table.text('message').notNullable();
      table.string('status', 20).defaultTo('open'); // 'open', 'acknowledged', 'resolved'
      table.timestamps(true, true);
      
      table.index(['type', 'status']);
      table.index(['created_at']);
      table.index(['status']);
    });
  }

  // API rate limit logs table
  const hasRateLimitLogs = await knex.schema.hasTable('rate_limit_logs');
  if (!hasRateLimitLogs) {
    await knex.schema.createTable('rate_limit_logs', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('ip_address', 45).notNullable();
      table.string('endpoint', 255).notNullable();
      table.string('method', 10).notNullable();
      table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.integer('requests_count').defaultTo(1);
      table.timestamp('window_start').notNullable();
      table.boolean('limit_exceeded').defaultTo(false);
      table.timestamps(true, true);
      
      table.index(['ip_address', 'endpoint']);
      table.index(['user_id', 'endpoint']);
      table.index(['window_start']);
      table.index(['limit_exceeded']);
    });
  }

  // System health logs table
  const hasSystemHealthLogs = await knex.schema.hasTable('system_health_logs');
  if (!hasSystemHealthLogs) {
    await knex.schema.createTable('system_health_logs', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('service_name', 100).notNullable();
      table.string('status', 20).notNullable(); // 'healthy', 'degraded', 'unhealthy'
      table.jsonb('metrics');
      table.text('message');
      table.timestamp('checked_at').notNullable();
      table.timestamps(true, true);
      
      table.index(['service_name', 'status']);
      table.index(['checked_at']);
      table.index(['status']);
    });
  }
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('system_health_logs')
    .dropTableIfExists('rate_limit_logs')
    .dropTableIfExists('alerts')
    .dropTableIfExists('error_logs')
    .dropTableIfExists('security_events');
};
