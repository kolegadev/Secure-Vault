import { initializeDatabase, closeDatabase } from '../../db/connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VaultProviderFactory } from '../../services/VaultProviderFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize an in-memory SQLite database with the full schema for testing.
 * @returns {Database.Database}
 */
export function setupTestDb() {
  const db = initializeDatabase(':memory:');
  const schemaPath = path.join(__dirname, '../../db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  return db;
}

/**
 * Close the in-memory database and reset the factory cache.
 */
export function teardownTestDb() {
  closeDatabase();
  VaultProviderFactory.reset();
}

/**
 * Reset environment variables and factory cache between tests.
 */
export function resetEnv() {
  delete process.env.VAULT_PROVIDER;
  VaultProviderFactory.reset();
}
