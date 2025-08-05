#!/bin/bash

# Docker Migration Reset Script
# Run this script to reset migrations in your Docker environment

set -e

echo "🐳 Docker Migration Reset Script"
echo "================================"

# Stop containers if running
echo "🛑 Stopping Docker containers..."
docker-compose down

# Remove postgres volume to start fresh
echo "🗑️  Removing postgres volume (this will delete all data)..."
read -p "⚠️  This will delete ALL database data. Continue? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "❌ Operation cancelled"
    exit 0
fi

docker volume rm backend_postgres_data 2>/dev/null || echo "Volume doesn't exist or already removed"

# Start postgres container first to let it initialize
echo "🚀 Starting postgres container..."
docker-compose up -d postgres

# Wait for postgres to be ready
echo "⏳ Waiting for postgres to be ready..."
sleep 10

# Check postgres health
echo "🏥 Checking postgres health..."
until docker-compose exec -T postgres pg_isready -U postgres -d crossbridge; do
    echo "Waiting for postgres..."
    sleep 2
done

echo "✅ Postgres is ready!"

# Now start the API container
echo "🚀 Starting API container..."
docker-compose up -d api

echo ""
echo "🎉 Docker migration reset completed!"
echo ""
echo "📋 What happened:"
echo "- Stopped all containers"
echo "- Removed postgres volume (deleted old data)"
echo "- Started fresh postgres container"
echo "- Started API container (migrations will run automatically)"
echo ""
echo "🔍 To check status:"
echo "   docker-compose logs api"
echo "   docker-compose ps"
