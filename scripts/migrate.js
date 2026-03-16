#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../public/content.db');
const MIGRATIONS_DIR = path.join(__dirname, '../src/data/migrations');

async function runMigrations() {
  console.log('Running database migrations...\n');

  // Check if database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error('Error: Database file not found at', DB_PATH);
    console.error('Run `npm run db:create` first to create the database.');
    process.exit(1);
  }

  // Load SQL.js
  const SQL = await initSqlJs();
  
  // Load existing database
  const dbBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(dbBuffer);

  // Get all migration files
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found.');
    process.exit(0);
  }

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure migrations run in order

  if (migrationFiles.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  console.log(`Found ${migrationFiles.length} migration file(s):\n`);

  // Run each migration
  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    console.log(`Running migration: ${file}`);
    
    try {
      const sql = fs.readFileSync(filePath, 'utf8');
      
      // Split by semicolons and run each statement
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          db.run(statement);
        } catch (err) {
          console.error(`  Error executing statement: ${err.message}`);
          console.error(`  Statement: ${statement.substring(0, 100)}...`);
        }
      }
      
      console.log(`  ✓ Migration ${file} completed`);
    } catch (err) {
      console.error(`  ✗ Error reading migration file: ${err.message}`);
      process.exit(1);
    }
  }

  // Save the database
  const data = db.export();
  fs.writeFileSync(DB_PATH, data);
  db.close();

  console.log('\n✓ All migrations completed successfully!');
  console.log(`Database saved to: ${DB_PATH}`);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
