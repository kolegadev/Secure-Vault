/**
 * In-memory holder for per-session decryption keys.
 *
 * The derived key exists ONLY here, in the running process. It is never
 * persisted — sessions in the database store just the session id. Keys
 * are cleared on logout/expiry and swept periodically.
 */

/** @type {Map<string, Buffer>} */
const sessionKeys = new Map();

/**
 * @param {string} sessionId
 * @param {Buffer} key
 */
export function putSessionKey(sessionId, key) {
  sessionKeys.set(sessionId, key);
}

/**
 * @param {string} sessionId
 * @returns {Buffer|undefined}
 */
export function getSessionKey(sessionId) {
  return sessionKeys.get(sessionId);
}

/**
 * @param {string} sessionId
 */
export function clearSessionKey(sessionId) {
  sessionKeys.delete(sessionId);
}

/**
 * Drop keys for sessions that are no longer valid (expired/removed).
 * @param {Set<string>} validSessionIds
 */
export function sweepSessionKeys(validSessionIds) {
  for (const id of sessionKeys.keys()) {
    if (!validSessionIds.has(id)) {
      sessionKeys.delete(id);
    }
  }
}

/**
 * Periodically align the in-memory map with the sessions table.
 * @param {import('better-sqlite3').Database} db
 */
export function sweepSessionKeysFromDb(db) {
  const rows = db.prepare("SELECT id FROM sessions WHERE expires_at > datetime('now')").all();
  const valid = new Set(rows.map((r) => r.id));
  sweepSessionKeys(valid);
}
