/**
 * CrossBridge API - Migration Script
 * 
 * This script helps migrate from the monolithic app.js structure we used earlier
 * to the modular structure in src/app.js.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Starting CrossBridge API migration to modular structure...');

// Step 1: Check if we have both files
const monolithicPath = path.join(__dirname, 'app.js');
const modularPath = path.join(__dirname, 'src', 'app.js');

if (!fs.existsSync(monolithicPath)) {
  console.error('Error: Monolithic app.js not found!');
  process.exit(1);
}

if (!fs.existsSync(modularPath)) {
  console.error('Error: Modular src/app.js not found!');
  process.exit(1);
}

// Step 2: Create backup of app.js if app.legacy.js doesn't exist
const legacyPath = path.join(__dirname, 'app.legacy.js');
if (!fs.existsSync(legacyPath)) {
  console.log('Creating backup of app.js as app.legacy.js...');
  fs.copyFileSync(monolithicPath, legacyPath);
  console.log('Backup created successfully.');
}

// Step 3: Update package.json
console.log('Updating package.json...');
const packagePath = path.join(__dirname, 'package.json');
const packageData = require(packagePath);

packageData.main = 'src/app.js';
packageData.scripts.start = 'node src/app.js';
packageData.scripts.dev = 'nodemon src/app.js';

fs.writeFileSync(
  packagePath,
  JSON.stringify(packageData, null, 2),
  'utf8'
);
console.log('Package.json updated successfully.');

// Step 4: Install any missing dependencies
console.log('Checking for missing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('Dependencies updated successfully.');
} catch (error) {
  console.error('Error updating dependencies:', error.message);
}

// Step 5: Provide guidance
console.log('\n--- Migration Guide ---');
console.log('The migration to the modular API structure has been prepared.');
console.log('Key changes:');
console.log('1. package.json has been updated to use src/app.js');
console.log('2. app.js has been backed up as app.legacy.js');
console.log('\nNext steps:');
console.log('1. Start the server with: npm run dev');
console.log('2. Test all endpoints to ensure they work correctly');
console.log('3. If there are any issues, you can revert to the monolithic version by changing package.json back');
console.log('\nIf you need to add missing functionality, check these files:');
console.log('- src/routes/alias.js - Backward compatibility routes');
console.log('- src/routes/wallet.js - Wallet-related routes');
console.log('- src/routes/websocket.js - WebSocket token endpoint');
console.log('- src/routes/dashboard.js - User dashboard endpoint');
console.log('\nHappy coding!'); 