import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, initializeVaultDatabase, closeDatabase } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function migrate() {
  console.log('Starting database migration...');

  try {
    // 1. Migrate Local Database
    console.log('Migrating local database...');
    const localDb = initializeDatabase();
    const schemaLocalPath = path.join(__dirname, 'schema_local.sql');
    const schemaLocal = fs.readFileSync(schemaLocalPath, 'utf-8');
    localDb.exec(schemaLocal);
    console.log('Local database migration completed');

    // 2. Migrate Vault Database (if mounted)
    try {
      console.log('Attempting to migrate vault database...');
      const vaultDb = initializeVaultDatabase();
      const schemaVaultPath = path.join(__dirname, 'schema_vault.sql');
      const schemaVault = fs.readFileSync(schemaVaultPath, 'utf-8');
      vaultDb.exec(schemaVault);
      console.log('Vault database migration completed');
    } catch (error) {
      console.log('Skipping vault database migration (not mounted or accessible):', error.message);
    }

    console.log('Database migration process finished');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

migrate();
