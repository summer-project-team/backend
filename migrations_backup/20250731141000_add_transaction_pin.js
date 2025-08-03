/**
 * Add PIN authentication support to users table
 */
exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.string('transaction_pin_hash', 255).nullable();
    table.boolean('pin_enabled').defaultTo(false);
    table.timestamp('pin_created_at').nullable();
    table.timestamp('pin_last_used').nullable();
    table.integer('pin_failed_attempts').defaultTo(0);
    table.timestamp('pin_locked_until').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('transaction_pin_hash');
    table.dropColumn('pin_enabled');
    table.dropColumn('pin_created_at');
    table.dropColumn('pin_last_used');
    table.dropColumn('pin_failed_attempts');
    table.dropColumn('pin_locked_until');
  });
};
