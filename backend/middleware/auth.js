import { nanoid } from 'nanoid';
import { getLocalDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { unlockDevice, getStatus } from '../services/luksManager.js';

/**
 * Determine if cookies should use the secure flag.
 * Checks for HTTPS protocol or explicit configuration.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function shouldUseSecureCookies(req) {
  // Check if explicitly configured
  if (typeof config.security.secureCookies === 'boolean') {
    return config.security.secureCookies;
  }

  // Auto-detect based on protocol
  return req.protocol === 'https' || req.get('X-Forwarded-Proto') === 'https';
}

const SESSION_COOKIE = 'vault_session';

/**
 * Redact session ID for safe logging - returns first 8 characters followed by asterisks
 * @param {string} sessionId
 * @returns {string} redacted session ID
 */
function redactSessionId(sessionId) {
  if (!sessionId || sessionId.length < 8) {
    return '********';
  }
  return sessionId.substring(0, 8) + '*'.repeat(Math.max(0, sessionId.length - 8));
}

/**
 * Create a new session after successful LUKS unlock.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string} sessionId
 */
export function createSession(req, res) {
  const db = getLocalDatabase();
  const sessionId = nanoid();
  const expiresAt = new Date(Date.now() + config.security.sessionTtlMinutes * 60 * 1000).toISOString();

  db.prepare('INSERT INTO sessions (id, data, expires_at) VALUES (?, ?, ?)')
    .run(sessionId, '{}', expiresAt);

  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: 'strict',
    maxAge: config.security.sessionTtlMinutes * 60 * 1000,
  });

  logger.info({ sessionId: redactSessionId(sessionId) }, 'Session created');
  return sessionId;
}

/**
 * Clear session cookie and invalidate in database.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function destroySession(req, res) {
  const sessionId = req.cookies?.[SESSION_COOKIE] || req.headers.authorization?.replace('Bearer ', '');

  if (sessionId) {
    const db = getLocalDatabase();
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    logger.info({ sessionId: redactSessionId(sessionId) }, 'Session destroyed');
  }

  res.clearCookie(SESSION_COOKIE);
}

/**
 * Validate session from cookie or Authorization header.
 * @param {import('express').Request} req
 * @returns {{valid: boolean, sessionId: string|null}}
 */
function validateSession(req) {
  const sessionId = req.cookies?.[SESSION_COOKIE] || req.headers.authorization?.replace('Bearer ', '');

  if (!sessionId) {
    return { valid: false, sessionId: null };
  }

  const db = getLocalDatabase();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")')
    .get(sessionId);

  if (!session) {
    return { valid: false, sessionId };
  }

  return { valid: true, sessionId };
}

/**
 * Middleware: require valid session AND mounted vault.
 */
export function requireAuth(req, res, next) {
  const { valid, sessionId } = validateSession(req);

  if (!valid) {
    logger.warn({ ip: req.ip, path: req.path }, 'Unauthorized request');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Valid session required. Please log in.' },
    });
  }

  req.sessionId = sessionId;
  next();
}

/**
 * Middleware: check vault is mounted (session optional but recommended).
 */
export async function requireVaultMounted(req, res, next) {
  const status = await getStatus();

  if (status.state !== 'mounted') {
    return res.status(403).json({
      success: false,
      error: { code: 'VAULT_LOCKED', message: 'Vault is not mounted. Please unlock first.' },
    });
  }

  next();
}

/**
 * Login handler: validate passphrase against LUKS, create session.
 */
export async function loginHandler(req, res) {
  const { passphrase } = req.body;

  if (!passphrase || typeof passphrase !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_PASSPHRASE', message: 'Passphrase is required' },
    });
  }

  // Attempt LUKS unlock
  const unlockResult = await unlockDevice(passphrase);

  if (!unlockResult.success) {
    logger.warn({ ip: req.ip }, 'Failed login attempt');
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_PASSPHRASE', message: 'Authentication failed. Please check your passphrase and try again.' },
    });
  }

  // Destroy any existing session to prevent session fixation
  destroySession(req, res);

  // Create new session after successful authentication
  const sessionId = createSession(req, res);

  logger.info({ ip: req.ip, sessionId: redactSessionId(sessionId) }, 'User logged in');

  return res.json({
    success: true,
    data: { message: 'Logged in successfully' },
  });
}

/**
 * Logout handler: destroy session, optionally lock vault.
 */
export async function logoutHandler(req, res) {
  const { lock } = req.body;

  destroySession(req, res);

  if (lock) {
    const { lockDevice } = await import('../services/luksManager.js');
    const lockResult = await lockDevice();
    logger.info({ locked: lockResult.success }, 'Vault locked on logout');
  }

  return res.json({ success: true, data: { message: 'Logged out successfully' } });
}

/**
 * Get auth status.
 */
export async function statusHandler(req, res) {
  const { valid } = validateSession(req);
  const vaultStatus = await getStatus();

  return res.json({
    success: true,
    data: {
      authenticated: valid,
      vaultMounted: vaultStatus.state === 'mounted',
      vaultState: vaultStatus.state,
    },
  });
}

/**
 * Cleanup expired sessions (can be called periodically).
 */
export function cleanupSessions() {
  const db = getLocalDatabase();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < datetime("now")').run();
  if (result.changes > 0) {
    logger.info({ count: result.changes }, 'Cleaned up expired sessions');
  }
}
