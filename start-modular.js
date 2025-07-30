/**
 * CrossBridge API - Modular Architecture Startup Script
 * 
 * This script launches the modular version of the API (src/app.js),
 * handling potential migration issues and providing a smooth transition.
 */

require('dotenv').config();
const path = require('path');
const { spawn } = require('child_process');

console.log('Starting CrossBridge API in modular architecture mode...');

// Check environment
const NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Environment: ${NODE_ENV}`);

// Set up environment variables
const env = {
  ...process.env,
  // Disable migrations temporarily for first run if needed
  // SKIP_MIGRATIONS: 'true',
  NODE_PATH: path.resolve(__dirname),
  NODE_ENV
};

// Start the server with the modular architecture
const server = spawn('node', ['src/app.js'], {
  env,
  stdio: 'inherit'
});

// Handle server process events
server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

server.on('exit', (code, signal) => {
  if (code !== 0) {
    console.log(`Server process exited with code ${code}`);
  }
  if (signal) {
    console.log(`Server was killed with signal ${signal}`);
  }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down server gracefully...');
  server.kill('SIGINT');
});

console.log(`CrossBridge API server starting at http://localhost:${process.env.PORT || 3000}`); 