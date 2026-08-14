/**
 * Field-level encryption for sensitive backend data (env var values).
 *
 * Values stored in vault.db are encrypted at rest with AES-256-GCM.
 * The key is derived from the VeraCrypt vault passphrase via scrypt at
 * login time and held ONLY in process memory for the lifetime of the
 * session — it is never written to disk.
 *
 * Stored format: `enc:v1:<base64(iv(12) || authTag(16) || ciphertext)>`
 *
 * NOTE: changing the VeraCrypt vault passphrase produces a different
 * derived key and makes previously encrypted values unreadable. Export
 * (or re-encrypt with both keys) before changing the passphrase.
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

// scrypt cost factors: ~50-100ms per derivation on typical hardware.
const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/**
 * Derive a 32-byte AES key from the vault passphrase + stored salt.
 * @param {string} passphrase
 * @param {string} saltHex
 * @returns {Buffer}
 */
export function deriveKey(passphrase, saltHex) {
  return crypto.scryptSync(passphrase, Buffer.from(saltHex, 'hex'), KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // 128*N*r bytes are required; the Node default maxmem (32 MiB) sits
    // exactly on that edge for these parameters, so set it explicitly.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
}

/** @returns {string} random hex salt */
export function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Encrypt a plaintext value with the session key.
 * @param {string} plaintext
 * @param {Buffer} key
 * @returns {string} `enc:v1:...` string for storage
 */
export function encryptValue(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt a stored value. Returns null when the value is not encrypted
 * (legacy plaintext) or the key does not match.
 * @param {string} stored
 * @param {Buffer} key
 * @returns {string|null}
 */
export function decryptValue(stored, key) {
  if (!isEncrypted(stored)) return null;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** @param {string} value @returns {boolean} */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * One-time migration: encrypt any plaintext rows with the session key.
 * Runs on every successful login; encrypted rows are skipped.
 * @param {import('better-sqlite3').Database} db
 * @param {Buffer} key
 * @returns {number} rows encrypted
 */
export function migratePlaintextValues(db, key) {
  const rows = db.prepare('SELECT id, value FROM env_vars').all();
  const update = db.prepare(
    'UPDATE env_vars SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  let encrypted = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      if (isEncrypted(row.value)) continue;
      update.run(encryptValue(row.value, key), row.id);
      encrypted += 1;
    }
  });
  run();
  return encrypted;
}

/**
 * Get (or create) the per-install scrypt salt from the settings table.
 * @param {import('better-sqlite3').Database} db
 * @returns {string} salt hex
 */
export function getOrCreateSalt(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'crypto_salt'").get();
  if (row) return row.value;
  const salt = newSalt();
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('crypto_salt', salt);
  return salt;
}
