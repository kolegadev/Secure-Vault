import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  getMountPoint,
  resolveVaultPath,
  requireMounted,
} from './vaultPaths.js';

/**
 * Read a file from the vault.
 * @param {string} filePath
 * @returns {string}
 */
export function readFile(filePath) {
  const fullPath = resolveVaultPath(filePath);
  requireMounted();
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Write a file to the vault.
 * @param {string} filePath
 * @param {string} content
 */
export function writeFile(filePath, content) {
  const fullPath = resolveVaultPath(filePath);
  requireMounted();

  // Additional security check: ensure path is within allowed subdirectories.
  const relativePath = path.relative(getMountPoint(), fullPath);
  const pathParts = relativePath.split(path.sep).filter(p => p);
  const configuredDirs = Object.entries(config.paths)
    .filter(([k]) => k.endsWith('Dir'))
    .map(([, v]) => v);
  const allowedDirs = new Set([
    ...configuredDirs,
    'documents', 'exports', 'uploads', 'backups', 'user-files',
    'env', 'services', // Legacy V1 directory names for backward compatibility
  ]);

  if (pathParts.length > 0 && !allowedDirs.has(pathParts[0])) {
    throw new Error('Write path not in allowed directory');
  }

  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  }

  // Write file with restrictive permissions
  fs.writeFileSync(fullPath, content, { mode: 0o640 });
  logger.info({ path: filePath }, 'File written to vault');
}

/**
 * Protected files that cannot be deleted.
 * These are critical system files required for vault operation.
 */
const PROTECTED_FILES = [
  'vault.db',           // Main database file
  'vault.db-shm',       // SQLite shared memory file
  'vault.db-wal',       // SQLite write-ahead log
  '.vault-config',      // Vault configuration
  '.vault-metadata',    // Vault metadata
  '.system/',           // System directory
];

/**
 * Protected directories that cannot be deleted.
 * These are critical system directories.
 */
const PROTECTED_DIRECTORIES = [
  '.system',
  'lost+found',         // Filesystem recovery directory
];

/**
 * Check if a file path is protected from deletion.
 * @param {string} filePath - The relative file path
 * @returns {boolean} True if the file is protected
 */
function isProtectedPath(filePath) {
  const normalizedPath = path.normalize(filePath).replace(/^\/+/, '');

  // Check exact matches for protected files
  for (const protectedFile of PROTECTED_FILES) {
    if (normalizedPath === protectedFile || normalizedPath.endsWith('/' + protectedFile)) {
      return true;
    }
  }

  // Check if path starts with protected directory
  for (const protectedDir of PROTECTED_DIRECTORIES) {
    if (normalizedPath === protectedDir || normalizedPath.startsWith(protectedDir + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Delete a file from the vault with protection checks.
 * @param {string} filePath
 * @throws {Error} If the file is protected or operation fails
 */
export function deleteFile(filePath) {
  // Check if file is protected
  if (isProtectedPath(filePath)) {
    const error = new Error(`Cannot delete protected file: ${filePath}`);
    error.code = 'PROTECTED_FILE';
    logger.warn({ path: filePath }, 'Attempted deletion of protected file');
    throw error;
  }

  const fullPath = resolveVaultPath(filePath);
  requireMounted();

  // Verify file exists before attempting deletion
  if (!fs.existsSync(fullPath)) {
    const error = new Error(`File not found: ${filePath}`);
    error.code = 'ENOENT';
    throw error;
  }

  // Check if it's a directory and prevent accidental directory deletion
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    const error = new Error(`Cannot delete directory with file deletion endpoint: ${filePath}`);
    error.code = 'EISDIR';
    throw error;
  }

  fs.unlinkSync(fullPath);
  logger.info({ path: filePath }, 'File deleted from vault');
}

/**
 * List directory contents.
 * @param {string} [dirPath]
 * @returns {{name: string, type: 'file'|'directory', size: number, mtime: string}[]}
 */
export function listDirectory(dirPath = '') {
  const fullPath = resolveVaultPath(dirPath);
  requireMounted();

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  return entries.map(entry => {
    const stat = fs.statSync(path.join(fullPath, entry.name));
    return {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  });
}

/**
 * Check if a path exists in the vault.
 * @param {string} filePath
 * @returns {boolean}
 */
export function exists(filePath) {
  try {
    const fullPath = resolveVaultPath(filePath);
    return fs.existsSync(fullPath);
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists.
 * @param {string} dirPath
 */
export function ensureDir(dirPath) {
  const fullPath = resolveVaultPath(dirPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}
