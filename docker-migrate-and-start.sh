#!/bin/bash

# Migration startup script for Docker
# This script resets migration state and runs fresh migrations

set -e

echo "🚀 CrossBridge Migration Startup"
echo "================================"

# Function to run SQL commands
run_sql() {
    local sql="$1"
    echo "🔧 Executing: $sql"
    psql "$DATABASE_URL" -c "$sql" 2>/dev/null || true
}

# Function to check if table exists
table_exists() {
    local table_name="$1"
    local result=$(psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table_name');" 2>/dev/null | tr -d ' \n')
    echo "$result"
}

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until pg_isready -h postgres -p 5432 -U postgres; do
    echo "Waiting for postgres..."
    sleep 2
done

echo "✅ Database is ready!"

# Check if migration tables exist and have old migration records
if [ "$(table_exists 'knex_migrations')" = "t" ]; then
    echo "🔍 Checking existing migrations..."
    
    # Count migrations that don't exist as files
    MISSING_COUNT=$(psql "$DATABASE_URL" -t -c "
        SELECT COUNT(*) FROM knex_migrations 
        WHERE name NOT LIKE '%20250803100327_initial_complete_schema%' 
        AND name NOT LIKE '%20250805000000_add_ussd_tables%'
    " 2>/dev/null | tr -d ' \n')
    
    if [ "$MISSING_COUNT" -gt "0" ]; then
        echo "⚠️  Found $MISSING_COUNT old migration records that don't have corresponding files"
        echo "🧹 Cleaning up migration state..."
        
        # Drop migration tracking tables
        run_sql "DROP TABLE IF EXISTS knex_migrations CASCADE;"
        run_sql "DROP TABLE IF EXISTS knex_migrations_lock CASCADE;"
        
        echo "✅ Migration state cleaned up"
    else
        echo "ℹ️  Migration state looks good"
    fi
else
    echo "ℹ️  No existing migration table found"
fi

# Run migrations
echo "📦 Running migrations..."
npx knex migrate:latest

echo "✅ Migrations completed successfully!"

# Start the application
echo "🚀 Starting application..."
exec npm start
