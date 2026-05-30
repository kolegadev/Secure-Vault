import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { LuksProvider } from '../../services/providers/LuksProvider.js';
import { setupTestDb, teardownTestDb } from '../helpers/test-setup.js';

describe('LuksProvider', () => {
  let provider;
  let tmpDir;
  let mockDevicePath;
  let mockMountPoint;

  before(() => {
    setupTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luks-test-'));
    mockDevicePath = path.join(tmpDir, 'mock-device');
    mockMountPoint = path.join(tmpDir, 'mock-mount');
    fs.writeFileSync(mockDevicePath, 'fake device');
    fs.mkdirSync(mockMountPoint, { recursive: true });

    provider = new LuksProvider({
      luks: {
        devicePath: mockDevicePath,
        mountPoint: mockMountPoint,
        mapperName: 'test-mapper',
      },
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
    const p = new LuksProvider({
      luks: { devicePath: '/dev/nonexistent', mountPoint: '/mnt/x', mapperName: 'x' },
    });
    assert.strictEqual(p.deviceExists(), false);
  });

  it('getStatus returns locked when nothing is active', async () => {
    const status = await provider.getStatus();
    assert.strictEqual(status.state, 'locked');
    assert.strictEqual(status.device_present, true);
    assert.strictEqual(status.provider, 'luks');
    assert.strictEqual(status.mapper_name, 'test-mapper');
  });

  it('mountVault succeeds when already mounted', async () => {
    // Mock isMounted to return true and isMapperActive to return true
    const originalIsMounted = provider.isMounted.bind(provider);
    const originalIsMapperActive = provider.isMapperActive.bind(provider);
    provider.isMounted = () => true;
    provider.isMapperActive = () => true;

    const result = await provider.mountVault(null, null, 'secret123');
    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('already'));

    provider.isMounted = originalIsMounted;
    provider.isMapperActive = originalIsMapperActive;
  });

  it('mountVault fails when device does not exist', async () => {
    const p = new LuksProvider({
      luks: { devicePath: '/dev/noexist', mountPoint: '/mnt/x', mapperName: 'x' },
    });
    const result = await p.mountVault(null, null, 'secret123');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('unmountVault reports success when not mounted', async () => {
    const result = await provider.unmountVault();
    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('locked'));
  });

  it('formatDevice fails when device does not exist', async () => {
    const p = new LuksProvider({
      luks: { devicePath: '/dev/noexist', mountPoint: '/mnt/x', mapperName: 'x' },
    });
    const result = await p.formatDevice('pass');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('addKeySlot fails when device does not exist', async () => {
    const p = new LuksProvider({
      luks: { devicePath: '/dev/noexist', mountPoint: '/mnt/x', mapperName: 'x' },
    });
    const result = await p.addKeySlot('old', 'new');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('removeKeySlot fails when device does not exist', async () => {
    const p = new LuksProvider({
      luks: { devicePath: '/dev/noexist', mountPoint: '/mnt/x', mapperName: 'x' },
    });
    const result = await p.removeKeySlot('pass', 0);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('not found'));
  });

  it('backupHeader validates dangerous characters in path', async () => {
    const p = new LuksProvider({
      luks: { devicePath: mockDevicePath, mountPoint: '/mnt/x', mapperName: 'x' },
    });
    // Even though device exists, the path validation should reject bad chars
    const result = await p.backupHeader('/tmp/test;rm -rf /');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Invalid output path'));
  });

  it('_validateOutputPath rejects shell metacharacters', () => {
    assert.strictEqual(provider._validateOutputPath('/safe/path.txt'), '/safe/path.txt');
    assert.strictEqual(provider._validateOutputPath('/unsafe;cmd'), null);
    assert.strictEqual(provider._validateOutputPath('/unsafe|cmd'), null);
    assert.strictEqual(provider._validateOutputPath('/unsafe`cmd'), null);
  });

  it('getDeviceInfo returns empty object when device missing', async () => {
    const p = new LuksProvider({
      luks: { devicePath: '/dev/noexist', mountPoint: '/mnt/x', mapperName: 'x' },
    });
    const info = await p.getDeviceInfo();
    assert.strictEqual(info.isLuks, false);
    assert.strictEqual(info.uuid, null);
  });
});
