const knex = require('knex');
const path = require('path');

// Knex configuration
const knexConfig = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.join(__dirname, '../../migrations'),
  },
  seeds: {
    directory: path.join(__dirname, '../../seeds'),
  },
};

// Initialize knex instance
const db = knex(knexConfig);

/**
 * Initialize database connection and run migrations
 */
const initializeDatabase = async () => {
  try {
    // Test connection
    await db.raw('SELECT 1');
    console.log('PostgreSQL connected');
    
    // Run migrations if in development mode
    if (process.env.NODE_ENV === 'development') {
      try {
        await db.migrate.latest();
        console.log('Migrations completed');
      } catch (migrationError) {
        console.warn('Warning: Migration error encountered:', migrationError.message);
        console.log('Continuing with server startup despite migration issues...');
        
        // Check if we have basic schema in place
        const hasBasicSchema = await db.schema.hasTable('users')
          .then(exists => exists);
        
        if (!hasBasicSchema) {
          throw new Error('Critical database tables missing. Cannot continue.');
        }
      }
    }
    
    return db;
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};

module.exports = {
  db,
  initializeDatabase,
}; 