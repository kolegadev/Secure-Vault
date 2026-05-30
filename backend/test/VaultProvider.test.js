import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { VaultProvider } from '../services/VaultProvider.js';
import { VaultError, ValidationError } from '../services/errors.js';
import { setupTestDb, teardownTestDb } from './helpers/test-setup.js';

/**
 * Minimal concrete subclass for testing the abstract base.
 */
class TestProvider extends VaultProvider {
  constructor(config) {
    super(config);
    this.providerName = 'test';
  }

  async detectDevices() {
    return [];
  }

  async getStatus() {
    return { state: 'locked', provider: this.providerName };
  }

  async mountVault(devicePath, mountPoint, password) {
    return { success: true, message: 'mounted' };
  }

  async unmountVault(mountPoint) {
    return { success: true, message: 'unmounted' };
  }
}

describe('VaultProvider (abstract base)', () => {
  before(() => setupTestDb());
  after(() => teardownTestDb());

  it('cannot be instantiated directly', () => {
    assert.throws(
      () => new VaultProvider({}),
      (err) => err instanceof VaultError && err.message.includes('abstract')
    );
  });

  it('subclass can be instantiated', () => {
    const provider = new TestProvider({});
    assert.strictEqual(provider.providerName, 'test');
  });

  it('abstract methods throw when not overridden', async () => {
    class BrokenProvider extends VaultProvider {
      constructor() {
        super({});
      }
    }
    const p = new BrokenProvider();
    await assert.rejects(() => p.detectDevices(), VaultError);
    await assert.rejects(() => p.getStatus(), VaultError);
    await assert.rejects(() => p.mountVault(), VaultError);
    await assert.rejects(() => p.unmountVault(), VaultError);
  });
});

describe('VaultProvider._validatePathComponent', () => {
  it('allows safe path components', () => {
    const p = new TestProvider({});
    assert.strictEqual(p._validatePathComponent('secrets'), 'secrets');
    assert.strictEqual(p._validatePathComponent('my-file.txt'), 'my-file.txt');
    assert.strictEqual(p._validatePathComponent('dir_2'), 'dir_2');
  });

  it('rejects traversal attempts', () => {
    const p = new TestProvider({});
    assert.strictEqual(p._validatePathComponent('../../etc/passwd'), null);
    assert.strictEqual(p._validatePathComponent('..'), null);
    assert.strictEqual(p._validatePathComponent('/absolute'), null);
  });

  it('rejects null and empty inputs', () => {
    const p = new TestProvider({});
    assert.strictEqual(p._validatePathComponent(''), null);
    assert.strictEqual(p._validatePathComponent(null), null);
    assert.strictEqual(p._validatePathComponent(undefined), null);
  });

  it('rejects control characters', () => {
    const p = new TestProvider({});
    assert.strictEqual(p._validatePathComponent('foo\x00bar'), null);
    assert.strictEqual(p._validatePathComponent('foo\nbar'), null);
  });
});

describe('VaultProvider.validateVaultStructure', () => {
  let tmpDir;
  let provider;

  before(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
    provider = new TestProvider({
      paths: {
        envDir: 'secrets',
        skillsDir: 'skills',
        servicesDir: 'config',
      },
    });
  });

  after(() => {
    teardownTestDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates missing canonical directories', async () => {
    await provider.validateVaultStructure(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'secrets')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'config')));
  });

  it('throws if mount point does not exist', async () => {
    await assert.rejects(
      () => provider.validateVaultStructure('/nonexistent/path'),
      ValidationError
    );
  });

  it('skips invalid directory names', async () => {
    const p = new TestProvider({
      paths: {
        badDir: '../../etc',
        goodDir: 'exports',
      },
    });
    await p.validateVaultStructure(tmpDir);
    // The bad directory should be skipped; only exports is created
    assert.ok(fs.existsSync(path.join(tmpDir, 'exports')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'etcpasswd')));
  });
});

describe('VaultProvider.readVaultManifest', () => {
  let tmpDir;
  let provider;

  before(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
    provider = new TestProvider({});
  });

  after(() => {
    teardownTestDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses valid manifest', async () => {
    const manifest = { version: '2.0.0', createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(tmpDir, 'vault-manifest.json'), JSON.stringify(manifest));
    const result = await provider.readVaultManifest(tmpDir);
    assert.deepStrictEqual(result, manifest);
  });

  it('returns null if manifest is missing', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-empty-'));
    const result = await provider.readVaultManifest(emptyDir);
    assert.strictEqual(result, null);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('returns null for malformed JSON', async () => {
    fs.writeFileSync(path.join(tmpDir, 'vault-manifest-bad.json'), 'not json');
    // We need a separate dir because the good manifest is already there
    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-bad-'));
    fs.writeFileSync(path.join(badDir, 'vault-manifest.json'), '{ invalid');
    const result = await provider.readVaultManifest(badDir);
    assert.strictEqual(result, null);
    fs.rmSync(badDir, { recursive: true, force: true });
  });
});

describe('VaultProvider.listSecrets and listSkills', () => {
  let tmpDir;
  let provider;

  before(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
    provider = new TestProvider({
      paths: { envDir: 'secrets', skillsDir: 'skills' },
    });
    fs.mkdirSync(path.join(tmpDir, 'secrets'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'skills', 'skill-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'skills', 'skill-b'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'secrets', 'api.env'), 'KEY=val');
    fs.writeFileSync(path.join(tmpDir, 'secrets', 'notes.txt'), 'hello');
    fs.writeFileSync(path.join(tmpDir, 'skills', 'readme.md'), '# skills');
  });

  after(() => {
    teardownTestDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists .env files and extensionless files in env dir', async () => {
    const secrets = await provider.listSecrets(tmpDir);
    assert.ok(secrets.includes('api.env'));
    // notes.txt has a dot and is therefore excluded by listSecrets
    assert.ok(!secrets.includes('notes.txt'));
  });

  it('lists skill directories only', async () => {
    const skills = await provider.listSkills(tmpDir);
    assert.ok(skills.includes('skill-a'));
    assert.ok(skills.includes('skill-b'));
    assert.ok(!skills.includes('readme.md'));
  });
});

describe('VaultProvider DB helpers', () => {
  before(() => setupTestDb());
  after(() => teardownTestDb());

  it('reads default vault status from DB', () => {
    const p = new TestProvider({});
    const status = p._getVaultStatusDb();
    assert.strictEqual(status.state, 'locked');
  });

  it('updates vault status in DB', () => {
    const p = new TestProvider({});
    p._updateVaultStatusDb({ state: 'mounted', device_path: '/dev/sdb1', mount_point: '/mnt/securevault' });
    const status = p._getVaultStatusDb();
    assert.strictEqual(status.state, 'mounted');
    assert.strictEqual(status.device_path, '/dev/sdb1');
    assert.strictEqual(status.mount_point, '/mnt/securevault');
  });

  it('tracks unlock and lock timestamps', () => {
    const p = new TestProvider({});
    p._updateVaultStatusDb({ state: 'mounted' });
    const s1 = p._getVaultStatusDb();
    assert.ok(s1.last_unlocked_at);

    p._updateVaultStatusDb({ state: 'locked' });
    const s2 = p._getVaultStatusDb();
    assert.ok(s2.last_locked_at);
  });
});
