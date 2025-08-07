// Add missing monitoring and security tables
exports.up = async function(knex) {
  // Security events table for logging security-related events
  const hasSecurityEvents = await knex.schema.hasTable('security_events');
  if (!hasSecurityEvents) {
    await knex.schema.createTable('security_events', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.string('event_type', 50).notNullable();
      table.string('ip_address', 45);
      table.text('user_agent');
      table.jsonb('metadata');
      table.timestamps(true, true);
      
      table.index(['user_id', 'event_type']);
      table.index(['event_type', 'created_at']);
      table.index(['created_at']);
    });
  }

  // Error logs table for application error tracking
  const hasErrorLogs = await knex.schema.hasTable('error_logs');
  if (!hasErrorLogs) {
    await knex.schema.createTable('error_logs', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('error_id', 100).notNullable().unique();
      table.string('type', 50).notNullable(); // 'system', 'validation', 'authentication', etc.
      table.string('severity', 20).notNullable(); // 'low', 'medium', 'high', 'critical'
      table.integer('status_code');
      table.text('message').notNullable();
      table.text('stack');
      table.jsonb('request_data');
      table.timestamps(true, true);
      
      table.index(['type', 'severity']);
      table.index(['severity', 'created_at']);
      table.index(['created_at']);
      table.index(['error_id']);
    });
  }

  // Alerts table for system alerts and notifications
  const hasAlerts = await knex.schema.hasTable('alerts');
  if (!hasAlerts) {
    await knex.schema.createTable('alerts', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('alert_id', 100).notNullable().unique();
      table.string('type', 50).notNullable(); // 'error', 'warning', 'info'
      table.string('status', 20).defaultTo('active'); // 'active', 'resolved', 'suppressed'
      table.text('message').notNullable();
      table.string('error_id', 100).references('error_id').inTable('error_logs').onDelete('SET NULL');
      table.timestamps(true, true);
      
      table.index(['type', 'status']);
      table.index(['status', 'created_at']);
      table.index(['created_at']);
      table.index(['alert_id']);
    });
  }

  // System metrics table for performance monitoring
  const hasSystemMetrics = await knex.schema.hasTable('system_metrics');
  if (!hasSystemMetrics) {
    await knex.schema.createTable('system_metrics', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('metric_name', 100).notNullable();
      table.string('metric_type', 50).notNullable(); // 'counter', 'gauge', 'histogram'
      table.decimal('value', 20, 8).notNullable();
      table.string('unit', 20); // 'ms', 'count', 'bytes', etc.
      table.jsonb('tags'); // Additional metadata
      table.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);
      
      table.index(['metric_name', 'recorded_at']);
      table.index(['metric_type', 'recorded_at']);
      table.index(['recorded_at']);
    });
  }

  // Performance logs table for API performance tracking
  const hasPerformanceLogs = await knex.schema.hasTable('performance_logs');
  if (!hasPerformanceLogs) {
    await knex.schema.createTable('performance_logs', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('endpoint', 255).notNullable();
      table.string('method', 10).notNullable();
      table.integer('status_code').notNullable();
      table.integer('response_time_ms').notNullable();
      table.integer('memory_usage_mb');
      table.integer('cpu_usage_percent');
      table.string('user_id', 100);
      table.string('request_id', 100);
      table.timestamps(true, true);
      
      table.index(['endpoint', 'created_at']);
      table.index(['status_code', 'created_at']);
      table.index(['response_time_ms', 'created_at']);
      table.index(['created_at']);
    });
  }
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('performance_logs')
    .dropTableIfExists('system_metrics')
    .dropTableIfExists('alerts')
    .dropTableIfExists('error_logs')
    .dropTableIfExists('security_events');
};
