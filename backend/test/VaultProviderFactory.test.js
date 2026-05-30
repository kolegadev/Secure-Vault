import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { VaultProviderFactory } from '../services/VaultProviderFactory.js';
import { LuksProvider } from '../services/providers/LuksProvider.js';
import { VeraCryptProvider } from '../services/providers/VeraCryptProvider.js';
import { setupTestDb, teardownTestDb, resetEnv } from './helpers/test-setup.js';

describe('VaultProviderFactory', () => {
  beforeEach(() => {
    setupTestDb();
    resetEnv();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('returns LuksProvider by default', () => {
    const provider = VaultProviderFactory.getProvider();
    assert.ok(provider instanceof LuksProvider);
    assert.strictEqual(provider.providerName, 'luks');
  });

  it('returns VeraCryptProvider when VAULT_PROVIDER=veracrypt', () => {
    process.env.VAULT_PROVIDER = 'veracrypt';
    VaultProviderFactory.reset();
    const provider = VaultProviderFactory.getProvider();
    assert.ok(provider instanceof VeraCryptProvider);
    assert.strictEqual(provider.providerName, 'veracrypt');
  });

  it('caches the provider instance', () => {
    const p1 = VaultProviderFactory.getProvider();
    const p2 = VaultProviderFactory.getProvider();
    assert.strictEqual(p1, p2);
  });

  it('reset() clears the cache', () => {
    const p1 = VaultProviderFactory.getProvider();
    VaultProviderFactory.reset();
    const p2 = VaultProviderFactory.getProvider();
    assert.notStrictEqual(p1, p2);
  });

  it('is case-insensitive for provider name', () => {
    process.env.VAULT_PROVIDER = 'VERACRYPT';
    VaultProviderFactory.reset();
    const provider = VaultProviderFactory.getProvider();
    assert.ok(provider instanceof VeraCryptProvider);
  });
});
