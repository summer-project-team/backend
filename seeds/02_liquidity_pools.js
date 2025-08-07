/**
 * Seed data for liquidity pools
 */

exports.seed = async function(knex) {
  // Delete existing entries (if any)
  await knex('liquidity_pools').del();

  // Insert initial liquidity pool data
  await knex('liquidity_pools').insert([
    {
      id: knex.raw('gen_random_uuid()'),
      currency: 'USD',
      current_balance: 50000.00,
      target_balance: 50000.00,
      min_threshold: 10000.00,
      max_threshold: 100000.00,
      usd_rate: 1.0,
      rebalance_frequency_hours: 24,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: knex.raw('gen_random_uuid()'),
      currency: 'GBP',
      current_balance: 40000.00,
      target_balance: 40000.00,
      min_threshold: 8000.00,
      max_threshold: 80000.00,
      usd_rate: 0.8,
      rebalance_frequency_hours: 24,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: knex.raw('gen_random_uuid()'),
      currency: 'NGN',
      current_balance: 50000000.00,
      target_balance: 50000000.00,
      min_threshold: 10000000.00,
      max_threshold: 100000000.00,
      usd_rate: 1500.0,
      rebalance_frequency_hours: 24,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: knex.raw('gen_random_uuid()'),
      currency: 'CBUSD',
      current_balance: 100000.00,
      target_balance: 100000.00,
      min_threshold: 20000.00,
      max_threshold: 200000.00,
      usd_rate: 1.0,
      rebalance_frequency_hours: 24,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
};
