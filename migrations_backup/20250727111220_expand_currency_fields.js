/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.alterTable('transactions', function(table) {
      // Expand currency fields to support longer currency codes like CBUSD
      table.string('source_currency', 10).alter();
      table.string('target_currency', 10).alter();
    })
    .then(() => {
      // Check if currency_from and currency_to columns exist before altering
      return knex.schema.hasColumn('transactions', 'currency_from').then(exists => {
        if (exists) {
          return knex.schema.alterTable('transactions', function(table) {
            table.string('currency_from', 10).alter();
          });
        }
      });
    })
    .then(() => {
      return knex.schema.hasColumn('transactions', 'currency_to').then(exists => {
        if (exists) {
          return knex.schema.alterTable('transactions', function(table) {
            table.string('currency_to', 10).alter();
          });
        }
      });
    })
    .then(() => {
      // Skip wallets table currency column since it doesn't exist
      // The wallets table uses separate balance columns instead
      console.log('Skipping wallets.currency - column does not exist');
      return Promise.resolve();
    })
    .then(() => {
      // Update bank_deposit_references table currency field
      return knex.schema.alterTable('bank_deposit_references', function(table) {
        table.string('currency', 10).alter();
      });
    })
    .then(() => {
      // Update exchange_rates table if it exists
      return knex.schema.hasTable('exchange_rates').then(exists => {
        if (exists) {
          return knex.schema.alterTable('exchange_rates', function(table) {
            table.string('from_currency', 10).alter();
            table.string('to_currency', 10).alter();
          });
        }
      });
    })
    .then(() => {
      // Update bank_transactions_proxy table if it exists
      return knex.schema.hasTable('bank_transactions_proxy').then(exists => {
        if (exists) {
          return knex.schema.alterTable('bank_transactions_proxy', function(table) {
            table.string('source_currency', 10).alter();
            table.string('target_currency', 10).alter();
          });
        }
      });
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function(knex) {
    // Rollback changes - be careful as this might truncate data
    return knex.schema.alterTable('transactions', function(table) {
      // Revert to original 3 character limit
      table.string('source_currency', 3).alter();
      table.string('target_currency', 3).alter();
    })
    .then(() => {
      return knex.schema.hasColumn('transactions', 'currency_from').then(exists => {
        if (exists) {
          return knex.schema.alterTable('transactions', function(table) {
            table.string('currency_from', 3).alter();
          });
        }
      });
    })
    .then(() => {
      return knex.schema.hasColumn('transactions', 'currency_to').then(exists => {
        if (exists) {
          return knex.schema.alterTable('transactions', function(table) {
            table.string('currency_to', 3).alter();
          });
        }
      });
    })
    .then(() => {
      // Skip wallets table - no currency column to revert
      return Promise.resolve();
    })
    .then(() => {
      return knex.schema.alterTable('bank_deposit_references', function(table) {
        table.string('currency', 3).alter();
      });
    })
    .then(() => {
      return knex.schema.hasTable('exchange_rates').then(exists => {
        if (exists) {
          return knex.schema.alterTable('exchange_rates', function(table) {
            table.string('from_currency', 3).alter();
            table.string('to_currency', 3).alter();
          });
        }
      });
    })
    .then(() => {
      return knex.schema.hasTable('bank_transactions_proxy').then(exists => {
        if (exists) {
          return knex.schema.alterTable('bank_transactions_proxy', function(table) {
            table.string('source_currency', 3).alter();
            table.string('target_currency', 3).alter();
          });
        }
      });
    });
  };