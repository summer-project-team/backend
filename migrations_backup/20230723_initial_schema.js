/**
 * Initial database schema for CrossBridge
 */

exports.up = async function(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Users table
  const hasUsersTable = await knex.schema.hasTable('users');
  if (!hasUsersTable) {
    await knex.schema.createTable('users', function(table) { 
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('phone_number').notNullable().unique();
      table.string('country_code', 2).notNullable();
      table.string('email').notNullable().unique();
      table.string('password_hash').notNullable();
      table.string('first_name').notNullable();
      table.string('last_name').notNullable();
      table.enum('kyc_status', ['pending', 'verified', 'rejected']).defaultTo('pending');
      table.jsonb('kyc_data').nullable();
      table.timestamps(true, true);
    });
  }

  // Wallets table
  const hasWalletsTable = await knex.schema.hasTable('wallets');
  if (!hasWalletsTable) {
    await knex.schema.createTable('wallets', function(table) { 
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('balance_ngn', 20, 2).notNullable().defaultTo(0);
      table.decimal('balance_gbp', 20, 2).notNullable().defaultTo(0);
      table.decimal('balance_usd', 20, 2).notNullable().defaultTo(0);
      table.decimal('cbusd_balance', 20, 2).notNullable().defaultTo(0);
      table.string('wallet_address').notNullable().unique();
      table.timestamps(true, true);
    });
  }

  // Phone-wallet mapping table
  const hasPhoneWalletMappingTable = await knex.schema.hasTable('phone_wallet_mapping');
  if (!hasPhoneWalletMappingTable) {
    await knex.schema.createTable('phone_wallet_mapping', function(table) { 
      table.increments('id').primary();
      table.string('phone_number').notNullable().unique();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('wallet_id').notNullable().references('id').inTable('wallets').onDelete('CASCADE');
      table.timestamps(true, true);
    });
  }

  // Exchange rates table
  const hasExchangeRatesTable = await knex.schema.hasTable('exchange_rates');
  if (!hasExchangeRatesTable) {
    await knex.schema.createTable('exchange_rates', function(table) { 
      table.increments('id').primary();
      table.string('from_currency', 3).notNullable();
      table.string('to_currency', 3).notNullable();
      table.decimal('rate', 20, 8).notNullable();
      table.decimal('fee_percentage', 5, 2).notNullable();
      table.timestamps(true, true);
      table.unique(['from_currency', 'to_currency']);
    });
  }

  // Transactions table
  const hasTransactionsTable = await knex.schema.hasTable('transactions');
  if (!hasTransactionsTable) {
    await knex.schema.createTable('transactions', function(table) { 
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('sender_id').notNullable().references('id').inTable('users');
      table.uuid('recipient_id').notNullable().references('id').inTable('users');
      table.string('sender_phone').notNullable();
      table.string('recipient_phone').notNullable();
      table.decimal('amount', 20, 2).notNullable();
      table.string('currency_from', 3).notNullable();
      table.string('currency_to', 3).notNullable();
      table.decimal('exchange_rate', 20, 8).notNullable();
      table.decimal('fee', 20, 2).notNullable();
      table.decimal('converted_amount', 20, 2).notNullable();
      table.enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled']).notNullable();
      table.enum('transaction_type', ['app_transfer', 'deposit', 'withdrawal']).notNullable();
      table.string('reference').notNullable().unique();
      table.jsonb('metadata').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('completed_at').nullable();
    });
  }

  // Bank accounts table
  const hasBankAccountsTable = await knex.schema.hasTable('bank_accounts');
  if (!hasBankAccountsTable) {
    await knex.schema.createTable('bank_accounts', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('bank_name').notNullable();
      table.string('account_number').notNullable();
      table.string('account_name').notNullable();
      table.string('country_code', 2).notNullable();
      table.string('currency', 3).notNullable();
      table.boolean('verified').notNullable().defaultTo(false);
      table.timestamps(true, true);
      table.unique(['user_id', 'bank_name', 'account_number']);
    });
  }
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('bank_accounts')
    .dropTableIfExists('transactions')
    .dropTableIfExists('exchange_rates')
    .dropTableIfExists('phone_wallet_mapping')
    .dropTableIfExists('wallets')
    .dropTableIfExists('users');
};
