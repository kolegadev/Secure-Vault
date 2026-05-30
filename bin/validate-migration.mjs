#!/usr/bin/env node
/**
 * Migration Validation Helper
 *
 * Validates a migrated VeraCrypt vault by invoking VeraCryptProvider.validateVaultStructure
 * and checking for the presence of vault-manifest.json.
 *
 * Usage:
 *   node validate-migration.mjs <mount-point>
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the VeraCryptProvider module relative to this script
const providerPath = path.resolve(__dirname, '../backend/services/providers/VeraCryptProvider.js');

let VeraCryptProvider;
try {
  const mod = await import(providerPath);
  VeraCryptProvider = mod.VeraCryptProvider;
} catch (err) {
  console.error('Failed to import VeraCryptProvider:', err.message);
  console.error('Falling back to manual directory validation.');
  process.exit(1);
}

const mountPoint = process.argv[2];
if (!mountPoint) {
  console.error('Usage: validate-migration.mjs <mount-point>');
  process.exit(1);
}

const config = {
  luks: { mountPoint },
  paths: {
    configDir: 'config',
    secretsDir: 'secrets',
    skillsDir: 'skills',
    cryptoDir: 'crypto',
    exportsDir: 'exports',
    auditDir: 'audit',
  },
  vault: { mountTimeoutMs: 30000 },
};

const provider = new VeraCryptProvider(config);

try {
  await provider.validateVaultStructure(mountPoint);

  const manifest = await provider.readVaultManifest(mountPoint);
  if (!manifest) {
    console.error('ERROR: vault-manifest.json is missing or unreadable.');
    process.exit(1);
  }

  console.log('Validation passed.');
  console.log('Canonical directories present.');
  console.log('Manifest version:', manifest.version || 'unknown');
  process.exit(0);
} catch (err) {
  console.error('Validation failed:', err.message);
  process.exit(1);
}
