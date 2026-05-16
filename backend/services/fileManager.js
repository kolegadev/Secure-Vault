import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Resolve a path within the vault mount point.
 * Rejects paths that escape the vault directory.
 * @param {string} relativePath
 * @returns {string}
 * @throws {Error} If path traversal is detected
 */
function resolveVaultPath(relativePath) {
  const mountPoint = config.luks.mountPoint;
  const resolved = path.resolve(mountPoint, relativePath);
  const normalizedMount = path.resolve(mountPoint);

  if (!resolved.startsWith(normalizedMount)) {
    throw new Error('Path traversal detected: path escapes vault directory');
  }

  return resolved;
}

/**
 * Check if vault is mounted before file operations.
 * @throws {Error} If vault is not mounted
 */
function requireMounted() {
  try {
    fs.accessSync(config.luks.mountPoint, fs.constants.F_OK);
  } catch {
    throw new Error('Vault is not mounted');
  }
}

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

  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf-8');
  logger.info({ path: filePath }, 'File written to vault');
}

/**
 * Delete a file from the vault.
 * @param {string} filePath
 */
export function deleteFile(filePath) {
  const fullPath = resolveVaultPath(filePath);
  requireMounted();
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
