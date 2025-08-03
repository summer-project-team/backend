/**
 * Migration to fix the database schema
 */
exports.up = async function(knex) {
  // Check if tables exist and create them if they don't
  const hasUsers = await knex.schema.hasTable('users');
  const hasWallets = await knex.schema.hasTable('wallets');
  const hasTransactions = await knex.schema.hasTable('transactions');
  const hasExchangeRates = await knex.schema.hasTable('exchange_rates');
  const hasBankAccounts = await knex.schema.hasTable('bank_accounts');
  const hasKnexMigrations = await knex.schema.hasTable('knex_migrations');
  
  // Create knex_migrations table if it doesn't exist
  if (!hasKnexMigrations) {
    await knex.schema.createTable('knex_migrations', table => {
      table.increments('id').primary();
      table.string('name');
      table.integer('batch');
      table.timestamp('migration_time');
    });
  }

  // Create knex_migrations_lock table if it doesn't exist
  const hasKnexMigrationsLock = await knex.schema.hasTable('knex_migrations_lock');
  if (!hasKnexMigrationsLock) {
    await knex.schema.createTable('knex_migrations_lock', table => {
      table.increments('index').primary();
      table.integer('is_locked');
    });
  }

  // Create users table if it doesn't exist
  if (!hasUsers) {
    await knex.schema.createTable('users', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.string('phone_number').notNullable();
      table.string('country_code', 2).notNullable();
      table.string('email').notNullable();
      table.string('password_hash').notNullable();
      table.string('first_name').notNullable();
      table.string('last_name').notNullable();
      table.enu('kyc_status', ['pending', 'verified', 'rejected']).defaultTo('pending');
      table.jsonb('kyc_data').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    });
  }

  // Create wallets table if it doesn't exist
  if (!hasWallets) {
    await knex.schema.createTable('wallets', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('currency', 3).notNullable();
      table.decimal('balance', 20, 8).defaultTo(0).notNullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.unique(['user_id', 'currency']);
    });
  }

  // Create transactions table if it doesn't exist
  if (!hasTransactions) {
    await knex.schema.createTable('transactions', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.uuid('sender_id').references('id').inTable('users');
      table.uuid('recipient_id').references('id').inTable('users');
      table.string('sender_phone').notNullable();
      table.string('recipient_phone').notNullable();
      table.string('sender_country_code', 2).notNullable();
      table.string('recipient_country_code', 2).notNullable();
      table.decimal('amount', 20, 8).notNullable();
      table.string('source_currency', 3).notNullable();
      table.string('target_currency', 3).notNullable();
      table.decimal('exchange_rate', 20, 8).notNullable();
      table.decimal('fee', 20, 8).notNullable();
      table.enu('status', ['pending', 'completed', 'failed', 'cancelled']).defaultTo('pending');
      table.string('reference_id').notNullable();
      table.jsonb('metadata').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('completed_at').nullable();
    });
  }

  // Create exchange_rates table if it doesn't exist
  if (!hasExchangeRates) {
    await knex.schema.createTable('exchange_rates', table => {
      table.increments('id').primary();
      table.string('source_currency', 3).notNullable();
      table.string('target_currency', 3).notNullable();
      table.decimal('rate', 20, 8).notNullable();
      table.decimal('fee_percentage', 5, 2).defaultTo(0).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
      table.unique(['source_currency', 'target_currency']);
    });
  }

  // Create bank_accounts table if it doesn't exist
  if (!hasBankAccounts) {
    await knex.schema.createTable('bank_accounts', table => {
      table.uuid('id').defaultTo(knex.raw('uuid_generate_v4()')).primary();
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('bank_name').notNullable();
      table.string('account_number').notNullable();
      table.string('account_holder_name').notNullable();
      table.string('currency', 3).notNullable();
      table.string('country_code', 2).notNullable();
      table.boolean('is_verified').defaultTo(false);
      table.boolean('is_primary').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    });
  }

  // Create a record in the knex_migrations table for the previous migrations
  const existingMigrations = await knex('knex_migrations').select('name');
  const migrationNames = existingMigrations.map(m => m.name);
  
  if (!migrationNames.includes('20230701000000_initial_schema.js')) {
    await knex('knex_migrations').insert({
      name: '20230701000000_initial_schema.js',
      batch: 1,
      migration_time: new Date()
    });
  }
  
  if (!migrationNames.includes('20230723_initial_schema.js')) {
    await knex('knex_migrations').insert({
      name: '20230723_initial_schema.js',
      batch: 1,
      migration_time: new Date()
    });
  }
};

exports.down = function(knex) {
  // We don't want to drop tables in the down migration
  return Promise.resolve();
}; 