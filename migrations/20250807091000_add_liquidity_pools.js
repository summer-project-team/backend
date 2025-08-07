/**
 * Migration to add liquidity_pools table for instant settlement
 */

exports.up = function(knex) {
  return knex.schema.createTable('liquidity_pools', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('currency', 10).notNullable().unique();
    table.decimal('available_balance', 15, 2).defaultTo(0);
    table.decimal('reserved_balance', 15, 2).defaultTo(0);
    table.decimal('target_balance', 15, 2).notNullable();
    table.decimal('minimum_balance', 15, 2).notNullable();
    table.decimal('maximum_balance', 15, 2).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_rebalanced_at').nullable();
    table.timestamps(true, true);
    
    // Indexes for performance
    table.index('currency');
    table.index('is_active');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('liquidity_pools');
};
