exports.up = function(knex) {
  return Promise.all([
    // Add missing columns to webhook_events table
    knex.schema.hasTable('webhook_events').then(exists => {
      if (exists) {
        return knex.schema.alterTable('webhook_events', function(table) {
          // Check if priority column doesn't exist before adding it
          return knex.schema.hasColumn('webhook_events', 'priority').then(hasPriority => {
            if (!hasPriority) {
              table.integer('priority').defaultTo(5); // 1=highest, 10=lowest
            }
            return knex.schema.hasColumn('webhook_events', 'processed').then(hasProcessed => {
              if (!hasProcessed) {
                table.boolean('processed').defaultTo(false);
              }
            });
          });
        });
      }
    }),

    // Add missing columns to transactions table
    knex.schema.hasTable('transactions').then(exists => {
      if (exists) {
        return knex.schema.alterTable('transactions', function(table) {
          // Check if external_reference column doesn't exist before adding it
          return knex.schema.hasColumn('transactions', 'external_reference').then(hasExternal => {
            if (!hasExternal) {
              table.string('external_reference', 100).nullable();
              table.index('external_reference');
            }
            return knex.schema.hasColumn('transactions', 'provider').then(hasProvider => {
              if (!hasProvider) {
                table.string('provider', 50).nullable(); // 'stripe', 'flutterwave', etc.
              }
            });
          });
        });
      }
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.alterTable('webhook_events', function(table) {
      table.dropColumn('priority');
      table.dropColumn('processed');
    }),
    knex.schema.alterTable('transactions', function(table) {
      table.dropColumn('external_reference');
      table.dropColumn('provider');
    })
  ]);
};
