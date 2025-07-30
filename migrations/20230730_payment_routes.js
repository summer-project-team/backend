/**
 * Migration for payment routes tracking
 */
exports.up = function(knex) {
  return knex.schema.createTable('payment_route_events', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('route_id').notNullable();
    table.string('provider', 100).notNullable();
    table.string('corridor_key', 100).notNullable();
    table.boolean('success').notNullable();
    table.integer('duration_ms').notNullable();
    table.text('failure_reason');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('provider');
    table.index('corridor_key');
    table.index('success');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('payment_route_events');
}; 