-- CrossBridge Migration Cleanup Script
-- This script removes all old migration records and resets migration state

-- Show current migration records before cleanup
SELECT 'Current migration records:' as info;
SELECT name, migration_time FROM knex_migrations ORDER BY id;

-- Count total migrations
SELECT 'Total migration records: ' || COUNT(*) as count FROM knex_migrations;

-- Show which migrations don't have corresponding files
SELECT 'Missing migration files:' as info;
SELECT name FROM knex_migrations 
WHERE name NOT IN (
    '20250803100327_initial_complete_schema',
    '20250805000000_add_ussd_tables'
);

-- Clean up migration state completely
SELECT 'Cleaning up migration state...' as info;

-- Drop migration tracking tables
DROP TABLE IF EXISTS knex_migrations CASCADE;
DROP TABLE IF EXISTS knex_migrations_lock CASCADE;

SELECT 'Migration state cleaned up successfully!' as result;
SELECT 'You can now run: npx knex migrate:latest' as next_step;
