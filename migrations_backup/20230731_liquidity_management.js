/**
 * Migration for liquidity management tables
 */
exports.up = function(knex) {
  return knex.schema
    // Create liquidity pools table
    .createTable('liquidity_pools', function(table) {
      table.uuid('id').primary();
      table.string('currency', 10).notNullable().unique();
      table.decimal('target_balance', 24, 8).notNullable();
      table.decimal('current_balance', 24, 8).notNullable().defaultTo(0);
      table.decimal('min_threshold', 24, 8).notNullable();
      table.decimal('max_threshold', 24, 8).notNullable();
      table.decimal('usd_rate', 24, 8).notNullable().defaultTo(1);
      table.integer('rebalance_frequency_hours').notNullable().defaultTo(24);
      table.timestamp('last_rebalance_at');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').notNullable();
      table.timestamp('updated_at').notNullable();
      
      // Indexes
      table.index('currency');
      table.index('is_active');
    })
    // Create liquidity movements table
    .createTable('liquidity_movements', function(table) {
      table.uuid('id').primary();
      table.uuid('pool_id').notNullable();
      table.decimal('amount', 24, 8).notNullable();
      table.decimal('previous_balance', 24, 8).notNullable();
      table.decimal('new_balance', 24, 8).notNullable();
      table.string('reason').notNullable();
      table.uuid('transaction_id');
      table.timestamp('created_at').notNullable();
      
      // Indexes
      table.index('pool_id');
      table.index('transaction_id');
      table.index('created_at');
      
      // Foreign key
      table.foreign('pool_id').references('liquidity_pools.id').onDelete('CASCADE');
    })
    // Create liquidity alerts table
    .createTable('liquidity_alerts', function(table) {
      table.uuid('id').primary();
      table.uuid('pool_id').notNullable();
      table.string('currency', 10).notNullable();
      table.string('level', 20).notNullable(); // critical, warning, info
      table.string('message').notNullable();
      table.decimal('current_balance', 24, 8).notNullable();
      table.decimal('target_balance', 24, 8).notNullable();
      table.decimal('percent_of_target', 24, 8).notNullable();
      table.boolean('is_resolved').notNullable().defaultTo(false);
      table.string('resolution');
      table.uuid('resolved_by');
      table.timestamp('resolved_at');
      table.timestamp('created_at').notNullable();
      
      // Indexes
      table.index('pool_id');
      table.index('currency');
      table.index('level');
      table.index('is_resolved');
      table.index('created_at');
      
      // Foreign key
      table.foreign('pool_id').references('liquidity_pools.id').onDelete('CASCADE');
    })
    // Create liquidity rebalances table
    .createTable('liquidity_rebalances', function(table) {
      table.uuid('id').primary();
      table.string('action_type', 20).notNullable(); // transfer, add, remove
      table.string('from_currency', 10);
      table.string('to_currency', 10);
      table.decimal('amount', 24, 8).notNullable();
      table.uuid('executed_by');
      table.json('execution_result');
      table.timestamp('created_at').notNullable();
      
      // Indexes
      table.index('action_type');
      table.index('from_currency');
      table.index('to_currency');
      table.index('created_at');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTable('liquidity_rebalances')
    .dropTable('liquidity_alerts')
    .dropTable('liquidity_movements')
    .dropTable('liquidity_pools');
}; 