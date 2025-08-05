# Migration Reset Guide

## Problem
You replaced faulty migration files with a new complete schema migration (`20250803100327_initial_complete_schema.js`), but Knex.js is still looking for the old migration files because they're recorded in the database's migration tracking table.

## Root Cause
Knex.js tracks migration history in a `knex_migrations` table. Even though you've replaced the migration files, the database still has records of the old migrations that no longer exist.

## Solutions

### Solution 1: Quick Docker Reset (Recommended for Development)

**Use this if you're okay with losing all database data and starting fresh:**

```bash
# Run the Docker reset script
./docker-reset-migrations.sh
```

This script will:
1. Stop all Docker containers
2. Remove the postgres volume (deletes all data)
3. Start fresh containers
4. Automatically run the new migration

### Solution 2: Updated Dockerfile (Automatic Reset)

**The Dockerfile has been updated to automatically handle migration resets.**

Your container will now:
1. Check for orphaned migration records
2. Clean up migration state if needed
3. Run fresh migrations
4. Start the application

Just rebuild and restart your containers:

```bash
# Rebuild the container with the new Dockerfile
docker-compose build api

# Start containers
docker-compose up
```

### Solution 3: Manual Database Reset

**Use this if you want more control over the process:**

```bash
# Run the migration reset script
./reset-migrations.sh
```

This interactive script will:
1. Clean up migration tracking tables
2. Optionally drop existing tables
3. Run fresh migrations
4. Optionally run seeds

### Solution 4: Manual SQL Commands

**If you prefer to run SQL commands directly:**

```sql
-- Connect to your database and run these commands:

-- Drop migration tracking tables
DROP TABLE IF EXISTS knex_migrations CASCADE;
DROP TABLE IF EXISTS knex_migrations_lock CASCADE;

-- Then run migrations
-- npx knex migrate:latest
```

## Files Created

1. **`docker-reset-migrations.sh`** - Complete Docker environment reset
2. **`reset-migrations.sh`** - Interactive migration reset script
3. **`docker-migrate-and-start.sh`** - Smart startup script for Docker
4. **Updated `Dockerfile`** - Automatically handles migration issues

## What Changed in Your Setup

### Old Dockerfile Command:
```dockerfile
CMD ["sh", "-c", "npx knex migrate:latest && npm start"]
```

### New Dockerfile Command:
```dockerfile
CMD ["./docker-migrate-and-start.sh"]
```

The new startup script:
- Waits for database to be ready
- Checks for orphaned migration records
- Cleans up migration state if needed
- Runs migrations
- Starts the application

## Migration Files Structure

### Current (Working) Migrations:
- `migrations/20250803100327_initial_complete_schema.js` - Complete schema
- `migrations/20250805000000_add_ussd_tables.js` - Additional USSD tables

### Backup (Old/Faulty) Migrations:
- `migrations_backup/` - Contains all the old migration files

## Testing the Fix

### For Docker:
```bash
# Check if the warning is gone
docker-compose logs api

# Should see something like:
# ✅ Database is ready!
# 📦 Running migrations...
# ✅ Migrations completed successfully!
# 🚀 Starting application...
```

### For Local Development:
```bash
# Check migration status
npx knex migrate:status

# Should show only your new migrations
```

## Prevention for Future

1. **Always backup your database** before major migration changes
2. **Test migrations in development** before applying to production
3. **Use migration rollbacks** instead of deleting migration files
4. **Keep migration files in version control** to maintain history

## Troubleshooting

### If you still get migration warnings:

1. **Check migration status:**
   ```bash
   npx knex migrate:status
   ```

2. **Manually clean migration table:**
   ```sql
   DELETE FROM knex_migrations WHERE name NOT LIKE '%20250803100327_initial_complete_schema%' AND name NOT LIKE '%20250805000000_add_ussd_tables%';
   ```

3. **Force rebuild Docker container:**
   ```bash
   docker-compose down
   docker-compose build --no-cache api
   docker-compose up
   ```

### If database schema is corrupted:

1. **Use the complete reset:**
   ```bash
   ./docker-reset-migrations.sh
   ```

2. **Or manually drop all tables:**
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   ```

## Migration Best Practices

1. **Never delete migration files** that have been run in production
2. **Use rollback migrations** to undo changes
3. **Create new migrations** to fix issues instead of modifying existing ones
4. **Test migrations thoroughly** in development
5. **Backup production databases** before running migrations

## Next Steps

1. Choose one of the solutions above
2. Test in your development environment
3. Verify the warning is gone
4. Document the change for your team
5. Apply the same fix to other environments if needed
