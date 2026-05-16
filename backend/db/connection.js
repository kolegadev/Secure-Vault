import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let localDb = null;
let vaultDb = null;

/**
 * Get the local database instance (sessions, vault status).
 * @returns {Database.Database}
 */
export function getLocalDatabase() {
  if (!localDb) {
    throw new Error('Local database not initialized. Call initializeDatabase() first.');
  }
  return localDb;
}

/**
 * Get the vault database instance (env vars, skills, services, activity).
 * Returns null if vault is not mounted or not initialized.
 * @returns {Database.Database|null}
 */
export function getVaultDatabase() {
  // Try to initialize vault DB if not already done
  if (!vaultDb) {
    try {
      initializeVaultDatabase();
    } catch (error) {
      logger.debug('Vault database not available');
      return null;
    }
  }
  return vaultDb;
}

/**
 * Legacy compatibility: maps to Vault Database for sensitive operations.
 * @deprecated Use getLocalDatabase() or getVaultDatabase() explicitly.
 */
export function getDatabase() {
  return getVaultDatabase() || getLocalDatabase();
}

/**
 * Initialize the local SQLite database.
 */
export function initializeDatabase() {
  if (localDb) return localDb;

  const localPath = process.env.LOCAL_DATABASE_PATH || path.resolve(__dirname, '../data/local.db');
  const dbDir = path.dirname(localPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  localDb = new Database(localPath);
  applyPragmas(localDb);

  logger.info({ path: localPath }, 'Local database initialized');

  // Also try to initialize vault DB if already mounted
  try {
    initializeVaultDatabase();
  } catch {
    // Ignore, vault might not be mounted yet
  }

  return localDb;
}

/**
 * Initialize the vault SQLite database on the mounted LUKS volume.
 */
export function initializeVaultDatabase() {
  if (vaultDb) return vaultDb;

  const vaultPath = path.join(config.luks.mountPoint, config.paths.vaultDb);

  // Check if mount point is accessible
  if (!fs.existsSync(config.luks.mountPoint)) {
    throw new Error('Vault mount point not found');
  }

  vaultDb = new Database(vaultPath);
  applyPragmas(vaultDb);

  logger.info({ path: vaultPath }, 'Vault database initialized');
  return vaultDb;
}

/**
 * Apply performance and reliability pragmas.
 * @param {Database.Database} db
 */
function applyPragmas(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache
}

/**
 * Close both database connections.
 */
export function closeDatabase() {
  if (localDb) {
    localDb.close();
    localDb = null;
  }
  if (vaultDb) {
    vaultDb.close();
    vaultDb = null;
  }
}

/**
 * Run a function inside a vault database transaction.
 */
export function withVaultTransaction(fn) {
  const db = getVaultDatabase();
  if (!db) throw new Error('Vault database not available for transaction');
  return db.transaction(fn)(db);
}

/**
 * Run a function inside a local database transaction.
 */
export function withLocalTransaction(fn) {
  const db = getLocalDatabase();
  return db.transaction(fn)(db);
}
