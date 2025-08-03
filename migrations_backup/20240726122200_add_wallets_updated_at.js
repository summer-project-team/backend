// 20240726122300_add_transactions_reference_id.js
exports.up = function(knex) {
  return knex.schema.table('transactions', function(table) {
    table.string('reference_id').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('transactions', function(table) {
    table.dropColumn('reference_id');
  });
};