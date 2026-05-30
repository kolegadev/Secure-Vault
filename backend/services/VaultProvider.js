import fs from 'fs';
import path from 'path';
import { VaultError, ValidationError } from './errors.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Abstract base class defining the VaultProvider interface.
 * All encryption backends (LUKS, VeraCrypt, etc.) must extend this class.
 *
 * Design note: filesystem helpers (validateVaultStructure, readVaultManifest,
 * listSecrets, listSkills) are implemented here because they are provider-agnostic.
 */
export class VaultProvider {
  constructor(config) {
    if (new.target === VaultProvider) {
      throw new VaultError('VaultProvider is abstract and cannot be instantiated directly');
    }
    this.config = config;
    this.providerName = 'unknown';
  }

  /* ------------------------------------------------------------------ */
  /*  Abstract methods — must be implemented by subclasses               */
  /* ------------------------------------------------------------------ */

  /** @returns {Promise<Array<{name: string, path: string}>>} */
  async detectDevices() {
    throw new VaultError('detectDevices() not implemented');
  }

  /**
   * Get current vault status.
   * Must return an object compatible with the existing UI expectations.
   * @returns {Promise<object>}
   */
  async getStatus() {
    throw new VaultError('getStatus() not implemented');
  }

  /**
   * Mount (or unlock-and-mount) the vault.
   * @param {string|null} devicePath
   * @param {string|null} mountPoint
   * @param {string} password
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async mountVault(devicePath, mountPoint, password) {
    throw new VaultError('mountVault() not implemented');
  }

  /**
   * Unmount (and lock) the vault.
   * @param {string|null} mountPoint
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async unmountVault(mountPoint) {
    throw new VaultError('unmountVault() not implemented');
  }

  /* ------------------------------------------------------------------ */
  /*  Shared filesystem helpers                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Validate and sanitize a path component to prevent directory traversal.
   * @param {string} pathComponent
   * @returns {string|null}
   */
  _validatePathComponent(pathComponent) {
    if (!pathComponent || typeof pathComponent !== 'string') {
      return null;
    }
    const sanitized = pathComponent.replace(/\.\./g, '').replace(/[/\\]/g, '');
    const allowedChars = /^[a-zA-Z0-9.\-_]+$/;
    if (!allowedChars.test(sanitized)) return null;
    if (sanitized.includes('\0') || /[\x00-\x1F\x7F]/.test(sanitized)) return null;
    if (sanitized.trim() === '') return null;
    return sanitized;
  }

  _getDefaultMountPoint() {
    return this.config.luks?.mountPoint || '/mnt/openclaw-vault';
  }

  /**
   * Check that expected subdirectories exist under the mount point.
   * Creates them if missing (idempotent).
   * @param {string|null} mountPoint
   * @returns {Promise<boolean>}
   */
  async validateVaultStructure(mountPoint) {
    const mp = mountPoint || this._getDefaultMountPoint();
    if (!fs.existsSync(mp)) {
      throw new ValidationError(`Mount point does not exist: ${mp}`);
    }

    const dirKeys = Object.keys(this.config.paths || {});
    for (const key of dirKeys) {
      const dirName = this._validatePathComponent(this.config.paths[key]);
      if (!dirName) {
        logger.warn({ key }, 'Skipping invalid directory path component');
        continue;
      }
      const fullPath = path.join(mp, dirName);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
    return true;
  }

  /**
   * Read and parse vault-manifest.json from the mount point.
   * @param {string|null} mountPoint
   * @returns {Promise<object|null>}
   */
  async readVaultManifest(mountPoint) {
    const mp = mountPoint || this._getDefaultMountPoint();
    const manifestPath = path.join(mp, 'vault-manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      logger.warn({ err }, 'Failed to parse vault-manifest.json');
      return null;
    }
  }

  /**
   * List environment file names under the mount point's env directory.
   * @param {string|null} mountPoint
   * @returns {Promise<string[]>}
   */
  async listSecrets(mountPoint) {
    const mp = mountPoint || this._getDefaultMountPoint();
    const envDir = this._validatePathComponent(this.config.paths?.envDir || 'env');
    const fullPath = path.join(mp, envDir);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath).filter(f => f.endsWith('.env') || !f.includes('.'));
  }

  /**
   * List skill folder names under the mount point's skills directory.
   * @param {string|null} mountPoint
   * @returns {Promise<string[]>}
   */
  async listSkills(mountPoint) {
    const mp = mountPoint || this._getDefaultMountPoint();
    const skillsDir = this._validatePathComponent(this.config.paths?.skillsDir || 'skills');
    const fullPath = path.join(mp, skillsDir);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath).filter(f => {
      const itemPath = path.join(fullPath, f);
      return fs.statSync(itemPath).isDirectory();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Database helpers (shared across providers)                         */
  /* ------------------------------------------------------------------ */

  _getVaultStatusDb() {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM vault_status WHERE id = 1').get();
    return row || { state: 'locked', device_path: null, mount_point: null, mapper_name: null };
  }

  _updateVaultStatusDb(updates) {
    const db = getDatabase();
    const current = this._getVaultStatusDb();
    const merged = { ...current, ...updates, updated_at: new Date().toISOString() };

    if (updates.state === 'unlocked' || updates.state === 'mounted') {
      merged.last_unlocked_at = new Date().toISOString();
    } else if (updates.state === 'locked') {
      merged.last_locked_at = new Date().toISOString();
    }

    db.prepare(`
      UPDATE vault_status SET
        state = ?,
        device_path = ?,
        mount_point = ?,
        mapper_name = ?,
        last_unlocked_at = ?,
        last_locked_at = ?,
        updated_at = ?
      WHERE id = 1
    `).run(
      merged.state,
      merged.device_path,
      merged.mount_point,
      merged.mapper_name,
      merged.last_unlocked_at,
      merged.last_locked_at,
      merged.updated_at
    );
  }
}
