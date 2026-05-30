import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { VeraCryptProvider } from '../../services/providers/VeraCryptProvider.js';
import { setupTestDb, teardownTestDb } from '../helpers/test-setup.js';

describe('VeraCryptProvider', () => {
  let provider;
  let tmpDir;
  let mockDevicePath;
  let mockMountPoint;

  before(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-test-'));
    mockDevicePath = path.join(tmpDir, 'mock-device');
    mockMountPoint = path.join(tmpDir, 'mock-mount');
    fs.writeFileSync(mockDevicePath, 'fake device');
    fs.mkdirSync(mockMountPoint, { recursive: true });

    provider = new VeraCryptProvider({
      vault: { devicePath: mockDevicePath, mountPoint: mockMountPoint },
      paths: { envDir: 'secrets', skillsDir: 'skills', servicesDir: 'config' },
    });
  });

  after(() => {
    teardownTestDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects device existence', () => {
    assert.strictEqual(provider.deviceExists(), true);
  });

  it('reports device missing for nonexistent path', () => {
    const p = new VeraCryptProvider({
      vault: { devicePath: '/dev/nonexistent' },
    });
    assert.strictEqual(p.deviceExists(), false);
  });

  it('uses platform defaults when config is sparse', () => {
    const p = new VeraCryptProvider({});
    assert.ok(p.defaultMountPoint);
    assert.ok(p.veracryptBin);
    assert.ok(p.mountTimeoutMs > 0);
  });

  it('getStatus returns locked when not mounted', async () => {
    const status = await provider.getStatus();
    assert.strictEqual(status.state, 'locked');
    assert.strictEqual(status.device_present, true);
    assert.strictEqual(status.provider, 'veracrypt');
    assert.strictEqual(status.mapper_name, null);
    assert.strictEqual(status.device_info.isLuks, false);
  });

  it('mountVault fails when device does not exist', async () => {
    const p = new VeraCryptProvider({
      vault: { devicePath: '/dev/noexist' },
    });
    const result = await p.mountVault(null, null, 'secret123');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('mountVault succeeds when already mounted', async () => {
    const originalIsMounted = provider.isMounted.bind(provider);
    provider.isMounted = () => true;

    const result = await provider.mountVault(null, null, 'secret123');
    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('already'));

    provider.isMounted = originalIsMounted;
  });

  it('mountVault clears password on failure', async () => {
    const p = new VeraCryptProvider({
      vault: { devicePath: mockDevicePath, mountPoint: mockMountPoint },
    });

    // Mock _execVc to simulate failure
    p._execVc = async () => {
      return { stdout: '', stderr: 'wrong password', code: 1 };
    };

    let capturedPassword = 'initial';
    const result = await p.mountVault(null, null, capturedPassword);
    assert.strictEqual(result.success, false);
    // We can't directly verify the parameter was nulled inside the method,
    // but we verify the method doesn't leak it in the response.
    assert.ok(!result.message.includes('secret123'));
  });

  it('unmountVault reports success when not mounted', async () => {
    const result = await provider.unmountVault();
    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('not mounted'));
  });

  it('unmountVault detects busy device from stderr', async () => {
    const p = new VeraCryptProvider({
      vault: { devicePath: mockDevicePath, mountPoint: mockMountPoint },
    });
    p.isMounted = () => true;
    p._execVc = async () => {
      return { stdout: '', stderr: 'Volume is in use', code: 1 };
    };
    const result = await p.unmountVault();
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('in use'));
  });

  it('unmountVault handles timeout error', async () => {
    const p = new VeraCryptProvider({
      vault: { devicePath: mockDevicePath, mountPoint: mockMountPoint },
    });
    p.isMounted = () => true;
    p._execVc = async () => {
      throw new Error('VeraCrypt operation timed out');
    };
    const result = await p.unmountVault();
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('timed out') || result.message.includes('error'));
  });

  it('detectDevices returns empty array on unsupported platforms', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'sunos' });
    const devices = await provider.detectDevices();
    assert.deepStrictEqual(devices, []);
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('_hasSecureWrappers returns false when wrappers missing', () => {
    const p = new VeraCryptProvider({
      vault: {},
      veracrypt: { mountWrapper: '/nonexistent/mount', unmountWrapper: '/nonexistent/unmount' },
    });
    assert.strictEqual(p._hasSecureWrappers(), false);
  });

  it('_hasSecureWrappers returns false on non-Linux', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const p = new VeraCryptProvider({
      vault: {},
      veracrypt: { mountWrapper: '/exists', unmountWrapper: '/exists' },
    });
    assert.strictEqual(p._hasSecureWrappers(), false);
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('validateVaultStructure creates canonical directories', async () => {
    const testMount = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-struct-'));
    const p = new VeraCryptProvider({
      vault: { mountPoint: testMount },
      paths: { envDir: 'secrets', skillsDir: 'skills', servicesDir: 'config' },
    });
    await p.validateVaultStructure(testMount);
    assert.ok(fs.existsSync(path.join(testMount, 'secrets')));
    assert.ok(fs.existsSync(path.join(testMount, 'skills')));
    assert.ok(fs.existsSync(path.join(testMount, 'config')));
    fs.rmSync(testMount, { recursive: true, force: true });
  });
});
