exports.up = async function(knex) {
    await knex.schema.createTable('bank_deposit_references', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users');
      table.string('reference_code', 50).notNullable().unique();
      table.decimal('amount', 20, 2).notNullable();
      table.string('currency', 3).notNullable();
      table.string('status', 20).defaultTo('pending');
      table.string('bank_account_id', 100).notNullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('expires_at', { useTz: true }).notNullable();
      table.timestamp('processed_at', { useTz: true });
    });
  
    await knex.schema.createTable('webhook_events', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('event_type', 50).notNullable();
      table.string('reference_code', 50);
      table.decimal('amount', 20, 2);
      table.string('currency', 3);
      table.string('bank_reference', 100);
      table.jsonb('raw_data');
      table.boolean('processed').defaultTo(false);
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  };
  
  exports.down = async function(knex) {
    await knex.schema.dropTableIfExists('webhook_events');
    await knex.schema.dropTableIfExists('bank_deposit_references');
  }; 