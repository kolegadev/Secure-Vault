import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { VeraCryptProvider } from '../../services/providers/VeraCryptProvider.js';
import { setupTestDb, teardownTestDb } from '../helpers/test-setup.js';

describe('Integration: vault unlock → read → lock cycle', () => {
  let tmpDir;
  let mountPoint;
  let devicePath;
  let provider;

  before(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-lifecycle-'));
    mountPoint = path.join(tmpDir, 'mount');
    devicePath = path.join(tmpDir, 'device.bin');
    fs.mkdirSync(mountPoint, { recursive: true });
    fs.writeFileSync(devicePath, 'fake-veracrypt-device');

    provider = new VeraCryptProvider({
      vault: { devicePath, mountPoint },
      paths: {
        envDir: 'secrets',
        skillsDir: 'skills',
        servicesDir: 'config',
        exportsDir: 'exports',
      },
    });
  });

  after(() => {
    teardownTestDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full cycle: mount → validate → list → unmount', async () => {
    // 1. Mock mount success and isMounted so the provider thinks the vault is active
    let spawnCalls = [];
    let mounted = false;
    provider._execVc = async (args, input, command) => {
      spawnCalls.push({ args, hasInput: !!input, command });
      return { stdout: '', stderr: '', code: 0 };
    };
    const originalIsMounted = provider.isMounted.bind(provider);
    provider.isMounted = () => mounted;

    // 2. Mount vault (starts unmounted so _execVc is actually called)
    const mountResult = await provider.mountVault(null, null, 'integration-test-password');
    mounted = true;
    assert.strictEqual(mountResult.success, true);
    assert.ok(mountResult.message.includes('mounted'));

    // Verify password was passed via stdin (hasInput true) and not in args
    const mountCall = spawnCalls.find((c) =>
      c.args.some((a) => a.includes('--mount') || a.includes('mount'))
    );
    assert.ok(mountCall, 'Expected a mount spawn call');
    assert.strictEqual(mountCall.hasInput, true, 'Password should be passed via stdin');
    assert.ok(
      !mountCall.args.some((a) => a.includes('integration-test-password')),
      'Password must not appear in CLI args'
    );

    // 3. Validate vault structure (idempotent)
    await provider.validateVaultStructure(mountPoint);
    assert.ok(fs.existsSync(path.join(mountPoint, 'secrets')));
    assert.ok(fs.existsSync(path.join(mountPoint, 'skills')));
    assert.ok(fs.existsSync(path.join(mountPoint, 'config')));
    assert.ok(fs.existsSync(path.join(mountPoint, 'exports')));

    // 4. Create a secret and a skill, then list them
    fs.writeFileSync(path.join(mountPoint, 'secrets', 'api.env'), 'API_KEY=secret-value');
    fs.mkdirSync(path.join(mountPoint, 'skills', 'integration-skill'), { recursive: true });

    const secrets = await provider.listSecrets(mountPoint);
    assert.ok(secrets.includes('api.env'));

    const skills = await provider.listSkills(mountPoint);
    assert.ok(skills.includes('integration-skill'));

    // 5. Read manifest (should be null, we didn't create one)
    const manifest = await provider.readVaultManifest(mountPoint);
    assert.strictEqual(manifest, null);

    // 6. Create a manifest and read it back
    const expectedManifest = { version: '2.0.0-alpha', directories: ['secrets', 'skills'] };
    fs.writeFileSync(path.join(mountPoint, 'vault-manifest.json'), JSON.stringify(expectedManifest));
    const manifest2 = await provider.readVaultManifest(mountPoint);
    assert.deepStrictEqual(manifest2, expectedManifest);

    // 7. Unmount (keep mounted=true so unmountVault actually calls _execVc)
    const unmountResult = await provider.unmountVault();
    mounted = false;
    provider.isMounted = originalIsMounted;
    assert.strictEqual(unmountResult.success, true);
    assert.ok(unmountResult.message.includes('unmounted'));

    // 8. Verify DB state transitions
    const dbStatus = provider._getVaultStatusDb();
    assert.strictEqual(dbStatus.state, 'locked');
    assert.ok(dbStatus.last_locked_at);
    assert.ok(dbStatus.last_unlocked_at);
  });
});
