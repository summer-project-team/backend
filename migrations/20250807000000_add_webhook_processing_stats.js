exports.up = function(knex) {
  return knex.schema.createTable('webhook_processing_stats', function(table) {
    table.increments('id').primary();
    table.integer('batch_size').notNullable();
    table.integer('processing_time_ms').notNullable();
    table.integer('successful_count').notNullable();
    table.decimal('avg_time_per_webhook', 10, 2).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('webhook_processing_stats');
};
