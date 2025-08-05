#!/bin/bash

# Quick Migration State Reset
# This script forcefully removes all migration tracking

set -e

echo "🧹 Quick Migration State Reset"
echo "=============================="

# Set database URL if not provided
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/crossbridge"}

echo "📡 Database: $DATABASE_URL"
echo ""

# Function to run SQL
run_sql() {
    psql "$DATABASE_URL" -c "$1"
}

echo "🔍 Checking current migration state..."
run_sql "SELECT COUNT(*) as migration_count FROM information_schema.tables WHERE table_name = 'knex_migrations';" || echo "No migration table found"

echo ""
echo "🗑️  Removing migration tracking tables..."
run_sql "DROP TABLE IF EXISTS knex_migrations CASCADE;" 
run_sql "DROP TABLE IF EXISTS knex_migrations_lock CASCADE;"

echo ""
echo "✅ Migration state reset complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: npx knex migrate:latest"
echo "2. Or rebuild your Docker container"
echo ""
echo "Your current migration files:"
ls -la migrations/ | grep -E '\.(js|ts)$' || echo "No migration files found"
