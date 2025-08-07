/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return Promise.all([
    // USSD Sessions table
    knex.schema.hasTable('ussd_sessions').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_sessions', function(table) {
          table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
          table.uuid('session_id').notNullable().unique().index();
          table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
          table.string('phone_number', 20).notNullable().index();
          table.string('network_code', 10).notNullable();
          table.string('ussd_code', 50);
          table.enum('status', ['active', 'completed', 'expired', 'terminated']).defaultTo('active');
          table.json('session_data');
          table.timestamp('created_at').defaultTo(knex.fn.now());
          table.timestamp('updated_at').defaultTo(knex.fn.now());
          table.timestamp('expires_at');
          
          table.index(['user_id', 'status']);
          table.index(['phone_number', 'status']);
        });
      }
    }),

    // USSD Transactions table
    knex.schema.hasTable('ussd_transactions').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_transactions', function(table) {
          table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
          table.uuid('session_id').notNullable().references('session_id').inTable('ussd_sessions').onDelete('CASCADE');
          table.uuid('transaction_id').nullable().references('id').inTable('transactions').onDelete('SET NULL');
          table.enum('status', ['pending', 'success', 'failed', 'error']).notNullable();
          table.enum('status', ['pending', 'success', 'failed', 'error']).notNullable();
          table.string('error_message', 500);
          table.json('transaction_data');
          table.timestamp('created_at').defaultTo(knex.fn.now());
          
          table.index(['session_id']);
          table.index(['transaction_id']);
          table.index(['status', 'created_at']);
        });
      }
    }),

    // USSD Callbacks table  
    knex.schema.hasTable('ussd_callbacks').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_callbacks', function(table) {
          table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
          table.uuid('session_id').notNullable().references('session_id').inTable('ussd_sessions').onDelete('CASCADE');
          table.string('network_code', 10).notNullable();
          table.text('input_text');
          table.text('response_text');
          table.json('callback_data');
          table.timestamp('created_at').defaultTo(knex.fn.now());
          
          table.index(['session_id', 'created_at']);
          table.index(['network_code']);
        });
      }
    }),

    // USSD Analytics table
    knex.schema.hasTable('ussd_analytics').then(function(exists) {
      if (!exists) {
        return knex.schema.createTable('ussd_analytics', function(table) {
          table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
          table.date('date').notNullable();
          table.string('network_code', 10).notNullable();
          table.integer('total_sessions').defaultTo(0);
          table.integer('successful_transactions').defaultTo(0);
          table.integer('failed_transactions').defaultTo(0);
          table.decimal('total_transaction_amount', 15, 2).defaultTo(0);
          table.integer('unique_users').defaultTo(0);
          table.decimal('average_session_duration', 8, 2); // in seconds
          table.timestamp('created_at').defaultTo(knex.fn.now());
          table.timestamp('updated_at').defaultTo(knex.fn.now());
          
          table.unique(['date', 'network_code']);
          table.index(['date']);
          table.index(['network_code']);
        });
      }
    })
  ]);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return Promise.all([
    knex.schema.dropTableIfExists('ussd_analytics'),
    knex.schema.dropTableIfExists('ussd_callbacks'),
    knex.schema.dropTableIfExists('ussd_transactions'),
    knex.schema.dropTableIfExists('ussd_sessions')
  ]);
};
