exports.up = async function(knex) {
  // Add missing columns to webhook_events table
  try {
    const hasTable = await knex.schema.hasTable('webhook_events');
    if (hasTable) {
      const hasPriority = await knex.schema.hasColumn('webhook_events', 'priority');
      if (!hasPriority) {
        await knex.schema.alterTable('webhook_events', function(table) {
          table.integer('priority').defaultTo(5);
        });
        console.log('✅ Added priority column to webhook_events');
      }
    }
  } catch (error) {
    console.log('Priority column might already exist:', error.message);
  }

  // Add missing columns to transactions table
  try {
    const hasTransactionsTable = await knex.schema.hasTable('transactions');
    if (hasTransactionsTable) {
      const hasExternal = await knex.schema.hasColumn('transactions', 'external_reference');
      if (!hasExternal) {
        await knex.schema.alterTable('transactions', function(table) {
          table.string('external_reference', 100).nullable();
          table.index('external_reference');
        });
        console.log('✅ Added external_reference column to transactions');
      }

      const hasProvider = await knex.schema.hasColumn('transactions', 'provider');
      if (!hasProvider) {
        await knex.schema.alterTable('transactions', function(table) {
          table.string('provider', 50).nullable();
        });
        console.log('✅ Added provider column to transactions');
      }
    }
  } catch (error) {
    console.log('Transaction columns might already exist:', error.message);
  }
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.alterTable('webhook_events', function(table) {
      table.dropColumn('priority');
    }).catch(() => {}), // Ignore errors if column doesn't exist
    knex.schema.alterTable('transactions', function(table) {
      table.dropColumn('external_reference');
      table.dropColumn('provider');
    }).catch(() => {}) // Ignore errors if columns don't exist
  ]);
};
