require('dotenv').config();
const knex = require('knex');
const path = require('path');

// Knex configuration
const knexConfig = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },
};

// Initialize knex instance
const db = knex(knexConfig);

async function setupDatabase() {
  try {
    console.log('Running migrations...');
    await db.migrate.latest();
    console.log('Migrations completed successfully');
    
    console.log('Running seeds...');
    await db.seed.run();
    console.log('Seeds completed successfully');
    
    console.log('Database setup completed');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase(); 