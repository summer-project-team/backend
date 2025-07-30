exports.up = function(knex) {
    return knex.schema.hasColumn('wallets', 'updated_at').then(exists => {
      if (!exists) {
        return knex.schema.table('wallets', function(table) {
          table.timestamp('updated_at').nullable();
        });
      }
    });
  };
  
  exports.down = function(knex) {
    return knex.schema.table('wallets', function(table) {
      table.dropColumn('updated_at');
    });
  };