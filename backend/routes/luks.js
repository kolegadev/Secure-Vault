/**
 * @deprecated Use backend/routes/vault.js instead.
 * This file provides backward compatibility for /api/luks/* endpoints.
 * It re-exports the vault router so both /api/luks/* and /api/vault/*
 * respond identically. Deprecated in v2; will be removed in v3.
 */
export { default } from './vault.js';
