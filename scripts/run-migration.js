// Simple script to run a migration file
// Usage: node scripts/run-migration.js migrations/add_notification_preferences.sql

const fs = require('fs');
const path = require('path');

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  process.exit(1);
}

const filePath = path.join(__dirname, '..', migrationFile);

if (!fs.existsSync(filePath)) {
  console.error(`Migration file not found: ${filePath}`);
  process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf8');
console.log('Migration SQL:');
console.log(sql);
console.log('\nPlease run this SQL in your Supabase SQL Editor or via psql.');

