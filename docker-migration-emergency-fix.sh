#!/bin/bash

# Docker Migration Emergency Fix
# Run this when your Docker container has migration corruption

echo "🚨 Docker Migration Emergency Fix"
echo "================================="

# Stop containers
echo "🛑 Stopping containers..."
docker-compose down

# Remove any stuck containers
docker-compose rm -f api postgres || true

# Clean up migration state in database
echo "🧹 Cleaning up database migration state..."

# Start only postgres
docker-compose up -d postgres

# Wait for postgres
echo "⏳ Waiting for postgres..."
sleep 5

# Execute cleanup directly in postgres container
echo "🗑️  Removing migration tracking tables..."
docker-compose exec -T postgres psql -U postgres -d crossbridge << 'EOF'
DROP TABLE IF EXISTS knex_migrations CASCADE;
DROP TABLE IF EXISTS knex_migrations_lock CASCADE;
\q
EOF

echo "✅ Migration state cleaned up!"

# Stop postgres
docker-compose down

echo ""
echo "🚀 Ready to restart with clean migration state!"
echo ""
echo "Now run:"
echo "  docker-compose up --build"
echo ""
echo "This will:"
echo "1. Build the container with the updated migration script"
echo "2. Start with clean migration state"
echo "3. Run only your current migration files"
