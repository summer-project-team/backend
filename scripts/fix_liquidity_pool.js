const knex = require('knex')(require('./knexfile').development);

async function fixLiquidityPools() {
    try {
        // Check if pools already exist
        const existingPools = await knex('liquidity_pools').select('*');
        
        if (existingPools.length > 0) {
            console.log('💰 Liquidity pools already exist:', existingPools.length, 'pools');
            existingPools.forEach(pool => {
                console.log('  ✓', pool.currency, '- Balance:', pool.current_balance);
            });
            return;
        }
        
        console.log('💰 Creating initial liquidity pools with proper UUIDs...');
        
        await knex('liquidity_pools').insert([
            {
                id: knex.raw('gen_random_uuid()'),
                currency: 'USD',
                target_balance: 100000,
                current_balance: 50000,
                min_threshold: 5000,
                max_threshold: 10000,
                usd_rate: 1
            },
            {
                id: knex.raw('gen_random_uuid()'),
                currency: 'NGN', 
                target_balance: 150000000,
                current_balance: 75000000,
                min_threshold: 7500000,
                max_threshold: 15000000,
                usd_rate: 1650
            },
            {
                id: knex.raw('gen_random_uuid()'),
                currency: 'GBP',
                target_balance: 80000,
                current_balance: 40000,
                min_threshold: 4000,
                max_threshold: 8000,
                usd_rate: 0.79
            }
        ]);
        
        console.log('✅ Liquidity pools created successfully!');
        
        // Verify creation
        const newPools = await knex('liquidity_pools').select('*');
        console.log('💰 Created', newPools.length, 'liquidity pools:');
        newPools.forEach(pool => {
            console.log('  ✓', pool.currency, '- Balance:', pool.current_balance);
        });
        
    } catch (error) {
        console.error('❌ Liquidity pool setup error:', error.message);
    }
    
    process.exit(0);
}

fixLiquidityPools();
