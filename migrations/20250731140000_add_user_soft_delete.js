/**
 * Add soft delete support to users table
 */
exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.timestamp('deleted_at').nullable();
    table.index(['deleted_at'], 'idx_users_deleted_at');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropIndex(['deleted_at'], 'idx_users_deleted_at');
    table.dropColumn('deleted_at');
  });
};
