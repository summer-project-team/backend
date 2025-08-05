#!/bin/bash

# CrossBridge Migration Reset Script
# This script cleans up migration state and starts fresh with the new complete schema

set -e

echo "🔄 CrossBridge Migration Reset Script"
echo "======================================"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Set default database URL if not provided
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/crossbridge"}

echo "📡 Database URL: $DATABASE_URL"
echo ""

# Function to run SQL commands
run_sql() {
    local sql="$1"
    echo "🔧 Executing: $sql"
    psql "$DATABASE_URL" -c "$sql"
}

# Function to check if table exists
table_exists() {
    local table_name="$1"
    local result=$(psql "$DATABASE_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table_name');")
    echo "$result" | tr -d ' \n'
}

echo "🧹 Step 1: Cleaning up migration tracking tables..."

# Drop migration tracking tables if they exist
if [ "$(table_exists 'knex_migrations')" = "t" ]; then
    run_sql "DROP TABLE IF EXISTS knex_migrations CASCADE;"
    echo "✅ Dropped knex_migrations table"
else
    echo "ℹ️  knex_migrations table doesn't exist"
fi

if [ "$(table_exists 'knex_migrations_lock')" = "t" ]; then
    run_sql "DROP TABLE IF EXISTS knex_migrations_lock CASCADE;"
    echo "✅ Dropped knex_migrations_lock table"
else
    echo "ℹ️  knex_migrations_lock table doesn't exist"
fi

echo ""
echo "🏗️  Step 2: Checking existing schema..."

# Check if we need to drop existing tables
EXISTING_TABLES=$(psql "$DATABASE_URL" -t -c "SELECT string_agg(table_name, ', ') FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

if [ -n "$EXISTING_TABLES" ] && [ "$EXISTING_TABLES" != "" ]; then
    echo "⚠️  Found existing tables: $EXISTING_TABLES"
    echo ""
    echo "Choose an option:"
    echo "1) Drop all existing tables and recreate (DESTRUCTIVE - will lose all data)"
    echo "2) Keep existing tables and just reset migration tracking"
    echo "3) Cancel and exit"
    echo ""
    read -p "Enter your choice (1/2/3): " choice
    
    case $choice in
        1)
            echo "🗑️  Dropping all existing tables..."
            # Get all table names and drop them
            psql "$DATABASE_URL" -t -c "SELECT 'DROP TABLE IF EXISTS \"' || table_name || '\" CASCADE;' FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | psql "$DATABASE_URL"
            echo "✅ All tables dropped"
            ;;
        2)
            echo "ℹ️  Keeping existing tables, will only reset migration tracking"
            ;;
        3)
            echo "❌ Operation cancelled"
            exit 0
            ;;
        *)
            echo "❌ Invalid choice. Exiting."
            exit 1
            ;;
    esac
else
    echo "ℹ️  No existing tables found"
fi

echo ""
echo "🚀 Step 3: Running fresh migrations..."

# Navigate to the backend directory
cd "$(dirname "$0")"

# Run migrations
echo "📦 Running knex migrate:latest..."
npx knex migrate:latest

echo ""
echo "🌱 Step 4: Running seeds (optional)..."
echo "Do you want to run database seeds?"
read -p "Run seeds? (y/n): " run_seeds

if [ "$run_seeds" = "y" ] || [ "$run_seeds" = "Y" ]; then
    echo "🌱 Running knex seed:run..."
    npx knex seed:run
    echo "✅ Seeds completed"
else
    echo "⏭️  Skipping seeds"
fi

echo ""
echo "🎉 Migration reset completed successfully!"
echo ""
echo "📋 Summary:"
echo "- Migration tracking tables reset"
echo "- Fresh schema applied from 20250803100327_initial_complete_schema.js"
echo "- Database is now ready for use"
echo ""
echo "🔍 To verify, you can run:"
echo "   npx knex migrate:status"
echo "
