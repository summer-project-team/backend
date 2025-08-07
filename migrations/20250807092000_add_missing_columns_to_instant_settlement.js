/**
 * Migration to add missing columns to existing instant settlement tables
 */

exports.up = function(knex) {
  return Promise.all([
    // Add missing columns to liquidity_pools table
    knex.schema.hasTable('liquidity_pools').then(exists => {
      if (exists) {
        return knex.schema.alterTable('liquidity_pools', (table) => {
          // Check if columns don't exist before adding them
          return knex.schema.hasColumn('liquidity_pools', 'available_balance').then(hasAvailable => {
            if (!hasAvailable) {
              table.decimal('available_balance', 15, 2).defaultTo(0);
            }
            return knex.schema.hasColumn('liquidity_pools', 'reserved_balance').then(hasReserved => {
              if (!hasReserved) {
                table.decimal('reserved_balance', 15, 2).defaultTo(0);
              }
              return knex.schema.hasColumn('liquidity_pools', 'currency').then(hasCurrency => {
                if (!hasCurrency) {
                  table.string('currency', 10).notNullable();
                }
                return knex.schema.hasColumn('liquidity_pools', 'created_at').then(hasCreatedAt => {
                  if (!hasCreatedAt) {
                    table.timestamps(true, true);
                  }
                });
              });
            });
          });
        });
      }
    }),

    // Add missing columns to instant_settlement_eligibility table
    knex.schema.hasTable('instant_settlement_eligibility').then(exists => {
      if (exists) {
        return knex.schema.alterTable('instant_settlement_eligibility', (table) => {
          return knex.schema.hasColumn('instant_settlement_eligibility', 'daily_limit').then(hasLimit => {
            if (!hasLimit) {
              table.decimal('daily_limit', 15, 2).defaultTo(1000);
            }
            return knex.schema.hasColumn('instant_settlement_eligibility', 'daily_used').then(hasUsed => {
              if (!hasUsed) {
                table.decimal('daily_used', 15, 2).defaultTo(0);
              }
              return knex.schema.hasColumn('instant_settlement_eligibility', 'reset_date').then(hasReset => {
                if (!hasReset) {
                  table.date('reset_date').defaultTo(knex.raw('CURRENT_DATE'));
                }
                return knex.schema.hasColumn('instant_settlement_eligibility', 'is_active').then(hasActive => {
                  if (!hasActive) {
                    table.boolean('is_active').defaultTo(true);
                  }
                });
              });
            });
          });
        });
      }
    }),

    // Create liquidity_events table if it doesn't exist
    knex.schema.hasTable('liquidity_events').then(exists => {
      if (!exists) {
        return knex.schema.createTable('liquidity_events', (table) => {
          table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
          table.string('event_type', 50).notNullable();
          table.string('currency', 10).notNullable();
          table.decimal('amount', 15, 2).notNullable();
          table.decimal('pool_before', 15, 2).nullable();
          table.decimal('pool_after', 15, 2).nullable();
          table.uuid('transaction_id').nullable().references('id').inTable('transactions');
          table.uuid('user_id').nullable().references('id').inTable('users');
          table.jsonb('metadata').nullable();
          table.timestamps(true, true);
          
          table.index(['event_type', 'currency']);
          table.index('transaction_id');
          table.index('created_at');
        });
      }
    }),

    // Create pool_rebalance_queue table if it doesn't exist
    knex.schema.hasTable('pool_rebalance_queue').then(exists => {
      if (!exists) {
        return knex.schema.createTable('pool_rebalance_queue', (table) => {
          table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
          table.string('currency', 10).notNullable();
          table.decimal('current_balance', 15, 2).notNullable();
          table.decimal('target_balance', 15, 2).notNullable();
          table.enum('priority', ['low', 'normal', 'high', 'urgent']).defaultTo('normal');
          table.enum('status', ['pending', 'processing', 'completed', 'failed']).defaultTo('pending');
          table.timestamp('scheduled_at').notNullable();
          table.timestamp('started_at').nullable();
          table.timestamp('completed_at').nullable();
          table.text('error_message').nullable();
          table.timestamps(true, true);
          
          table.index(['status', 'priority', 'scheduled_at']);
          table.index('currency');
        });
      }
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    // Remove added columns from liquidity_pools
    knex.schema.alterTable('liquidity_pools', (table) => {
      table.dropColumn('available_balance');
      table.dropColumn('reserved_balance');
      table.dropColumn('currency');
    }),

    // Remove added columns from instant_settlement_eligibility
    knex.schema.alterTable('instant_settlement_eligibility', (table) => {
      table.dropColumn('daily_limit');
      table.dropColumn('daily_used');
      table.dropColumn('reset_date');
      table.dropColumn('is_active');
    }),

    // Drop created tables
    knex.schema.dropTableIfExists('pool_rebalance_queue'),
    knex.schema.dropTableIfExists('liquidity_events')
  ]);
};
