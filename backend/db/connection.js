import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

/**
 * Get the database instance. Must call initializeDatabase() first.
 * @returns {Database.Database}
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Initialize the SQLite database with WAL mode and performance pragmas.
 * @param {string} [dbPath] - Optional path to database file
 * @returns {Database.Database}
 */
export function initializeDatabase(dbPath) {
  if (db) {
    return db;
  }

  const targetPath = dbPath || process.env.DATABASE_PATH || path.resolve(__dirname, '../data/vault.db');
  const dbDir = path.dirname(targetPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(targetPath);

  // Performance and reliability pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache

  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run a function inside a database transaction.
 * @template T
 * @param {(db: Database.Database) => T} fn
 * @returns {T}
 */
export function withTransaction(fn) {
  const database = getDatabase();
  return database.transaction(fn)(database);
}
