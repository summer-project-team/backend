/**
 * Migration to allow NULL sender_phone and recipient_phone for bank-to-bank transfers
 */
exports.up = async function(knex) {
  // Check if transactions table exists
  const hasTransactions = await knex.schema.hasTable('transactions');
  
  if (hasTransactions) {
    // Alter the transactions table to allow NULL phone numbers
    await knex.schema.alterTable('transactions', table => {
      table.string('sender_phone').nullable().alter();
      table.string('recipient_phone').nullable().alter();
    });
  }
};

exports.down = async function(knex) {
  // Check if transactions table exists
  const hasTransactions = await knex.schema.hasTable('transactions');
  
  if (hasTransactions) {
    // Revert the changes - make phone numbers required again
    await knex.schema.alterTable('transactions', table => {
      table.string('sender_phone').notNullable().alter();
      table.string('recipient_phone').notNullable().alter();
    });
  }
}; 