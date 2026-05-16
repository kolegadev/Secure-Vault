import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getDatabase } from '../db/connection.js';

/**
 * Execute a command and return stdout/stderr.
 * @param {string} command
 * @param {string[]} args
 * @param {string} [input]
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function execCommand(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    child.on('error', (err) => {
      reject(err);
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Get current vault status from database.
 * @returns {{state: string, device_path: string|null, mount_point: string|null, mapper_name: string|null}}
 */
function getVaultStatusDb() {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM vault_status WHERE id = 1').get();
  return row || { state: 'locked', device_path: null, mount_point: null, mapper_name: null };
}

/**
 * Update vault status in database.
 * @param {Partial<{state: string, device_path: string, mount_point: string, mapper_name: string}>} updates
 */
function updateVaultStatusDb(updates) {
  const db = getDatabase();
  const current = getVaultStatusDb();
  const merged = { ...current, ...updates, updated_at: new Date().toISOString() };

  if (updates.state === 'unlocked' || updates.state === 'mounted') {
    merged.last_unlocked_at = new Date().toISOString();
  } else if (updates.state === 'locked') {
    merged.last_locked_at = new Date().toISOString();
  }

  db.prepare(`
    UPDATE vault_status SET
      state = ?,
      device_path = ?,
      mount_point = ?,
      mapper_name = ?,
      last_unlocked_at = ?,
      last_locked_at = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    merged.state,
    merged.device_path,
    merged.mount_point,
    merged.mapper_name,
    merged.last_unlocked_at,
    merged.last_locked_at,
    merged.updated_at
  );
}

/**
 * Check if the LUKS device exists at the configured path.
 * @returns {boolean}
 */
export function deviceExists() {
  try {
    fs.accessSync(config.luks.devicePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the mapper device is active.
 * @param {string} [mapperName]
 * @returns {boolean}
 */
export function isMapperActive(mapperName = config.luks.mapperName) {
  return fs.existsSync(`/dev/mapper/${mapperName}`);
}

/**
 * Check if the vault is mounted.
 * @param {string} [mountPoint]
 * @returns {boolean}
 */
export function isMounted(mountPoint = config.luks.mountPoint) {
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf-8');
    return mounts.split('\n').some(line => line.includes(mountPoint));
  } catch {
    return false;
  }
}

/**
 * Get LUKS device info via luksDump.
 * @returns {Promise<{uuid: string|null, cipher: string|null, keySlots: number, totalSlots: number, isLuks: boolean}>}
 */
export async function getDeviceInfo() {
  if (!deviceExists()) {
    return { uuid: null, cipher: null, keySlots: 0, totalSlots: 0, isLuks: false };
  }

  try {
    const result = await execCommand('sudo', ['cryptsetup', 'luksDump', config.luks.devicePath]);
    if (result.code !== 0) {
      return { uuid: null, cipher: null, keySlots: 0, totalSlots: 0, isLuks: false };
    }

    const uuidMatch = result.stdout.match(/UUID:\s+([a-f0-9-]+)/i);
    const cipherMatch = result.stdout.match(/Cipher:\s+(\S+)/);
    const enabledSlots = result.stdout.match(/Key Slot \d+: ENABLED/g) || [];
    const allSlots = result.stdout.match(/Key Slot \d+:/g) || [];

    return {
      uuid: uuidMatch?.[1] ?? null,
      cipher: cipherMatch?.[1] ?? null,
      keySlots: enabledSlots.length,
      totalSlots: allSlots.length,
      isLuks: true,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get LUKS device info');
    return { uuid: null, cipher: null, keySlots: 0, totalSlots: 0, isLuks: false };
  }
}

/**
 * Format a device with LUKS2.
 * @param {string} passphrase
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function formatDevice(passphrase) {
  if (!deviceExists()) {
    return { success: false, message: `Device ${config.luks.devicePath} not found` };
  }

  try {
    const result = await execCommand(
      'sudo',
      ['cryptsetup', '--type', 'luks2', '--cipher', 'aes-xts-plain64', '--key-size', '512', '--hash', 'sha256', 'luksFormat', config.luks.devicePath, '-'],
      passphrase
    );

    if (result.code !== 0) {
      logger.error({ stderr: result.stderr }, 'LUKS format failed');
      return { success: false, message: `Format failed: ${result.stderr}` };
    }

    logger.info({ device: config.luks.devicePath }, 'LUKS device formatted');
    return { success: true, message: 'Device formatted successfully' };
  } catch (error) {
    logger.error({ error }, 'LUKS format error');
    return { success: false, message: error.message };
  }
}

/**
 * Unlock and mount the LUKS device.
 * @param {string} passphrase
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function unlockDevice(passphrase) {
  const mapperName = config.luks.mapperName;
  const mountPoint = config.luks.mountPoint;

  // Already unlocked?
  if (isMapperActive(mapperName)) {
    if (isMounted(mountPoint)) {
      updateVaultStatusDb({ state: 'mounted', device_path: config.luks.devicePath, mount_point: mountPoint, mapper_name: mapperName });
      return { success: true, message: 'Vault is already unlocked and mounted' };
    }
    // Mapper active but not mounted — just mount
    return await mountVault();
  }

  if (!deviceExists()) {
    return { success: false, message: `Device ${config.luks.devicePath} not found` };
  }

  try {
    // Unlock with passphrase via stdin
    const openResult = await execCommand(
      'sudo',
      ['cryptsetup', 'open', config.luks.devicePath, mapperName, '--type', 'luks2'],
      passphrase
    );

    if (openResult.code !== 0) {
      logger.error({ stderr: openResult.stderr }, 'LUKS unlock failed');
      return { success: false, message: `Unlock failed: ${openResult.stderr}` };
    }

    logger.info({ device: config.luks.devicePath, mapperName }, 'LUKS device unlocked');

    // Update status to unlocked (not yet mounted)
    updateVaultStatusDb({ state: 'unlocked', device_path: config.luks.devicePath, mapper_name: mapperName });

    // Mount the filesystem
    return await mountVault();
  } catch (error) {
    logger.error({ error }, 'LUKS unlock error');
    return { success: false, message: error.message };
  }
}

/**
 * Mount the unlocked vault filesystem.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function mountVault() {
  const mountPoint = config.luks.mountPoint;
  const mapperPath = `/dev/mapper/${config.luks.mapperName}`;

  if (isMounted(mountPoint)) {
    updateVaultStatusDb({ state: 'mounted', mount_point: mountPoint });
    return { success: true, message: 'Vault is already mounted' };
  }

  if (!isMapperActive()) {
    return { success: false, message: 'Cannot mount: vault is not unlocked' };
  }

  // Ensure mount point exists
  if (!fs.existsSync(mountPoint)) {
    fs.mkdirSync(mountPoint, { recursive: true });
  }

  try {
    const result = await execCommand('sudo', ['mount', mapperPath, mountPoint]);
    if (result.code !== 0) {
      logger.error({ stderr: result.stderr }, 'Mount failed');
      return { success: false, message: `Mount failed: ${result.stderr}` };
    }

    // Ensure subdirectories exist
    const dirs = [config.paths.envDir, config.paths.skillsDir, config.paths.servicesDir, config.paths.exportsDir];
    for (const dir of dirs) {
      const fullPath = path.join(mountPoint, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    updateVaultStatusDb({ state: 'mounted', mount_point: mountPoint });
    logger.info({ mountPoint }, 'Vault mounted');
    return { success: true, message: 'Vault mounted successfully' };
  } catch (error) {
    logger.error({ error }, 'Mount error');
    return { success: false, message: error.message };
  }
}

/**
 * Unmount and lock the vault.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function lockDevice() {
  const mapperName = config.luks.mapperName;
  const mountPoint = config.luks.mountPoint;

  try {
    // Unmount if mounted
    if (isMounted(mountPoint)) {
      const umountResult = await execCommand('sudo', ['umount', mountPoint]);
      if (umountResult.code !== 0) {
        logger.error({ stderr: umountResult.stderr }, 'Unmount failed');
        return { success: false, message: `Unmount failed: ${umountResult.stderr}` };
      }
      logger.info({ mountPoint }, 'Vault unmounted');
    }

    // Close mapper if active
    if (isMapperActive(mapperName)) {
      const closeResult = await execCommand('sudo', ['cryptsetup', 'close', mapperName]);
      if (closeResult.code !== 0) {
        logger.error({ stderr: closeResult.stderr }, 'LUKS close failed');
        return { success: false, message: `Lock failed: ${closeResult.stderr}` };
      }
      logger.info({ mapperName }, 'LUKS device closed');
    }

    updateVaultStatusDb({ state: 'locked', device_path: null, mount_point: null, mapper_name: null });
    return { success: true, message: 'Vault locked successfully' };
  } catch (error) {
    logger.error({ error }, 'Lock error');
    return { success: false, message: error.message };
  }
}

/**
 * Add a new LUKS key slot.
 * @param {string} oldPassphrase
 * @param {string} newPassphrase
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function addKeySlot(oldPassphrase, newPassphrase) {
  if (!deviceExists()) {
    return { success: false, message: `Device ${config.luks.devicePath} not found` };
  }

  try {
    const result = await execCommand(
      'sudo',
      ['cryptsetup', 'luksAddKey', config.luks.devicePath, '-'],
      `${oldPassphrase}\n${newPassphrase}`
    );

    if (result.code !== 0) {
      return { success: false, message: `Add key failed: ${result.stderr}` };
    }

    logger.info({ device: config.luks.devicePath }, 'LUKS key slot added');
    return { success: true, message: 'Key slot added successfully' };
  } catch (error) {
    logger.error({ error }, 'Add key slot error');
    return { success: false, message: error.message };
  }
}

/**
 * Remove a LUKS key slot (requires remaining passphrase).
 * @param {string} passphrase
 * @param {number} slotIndex
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function removeKeySlot(passphrase, slotIndex) {
  if (!deviceExists()) {
    return { success: false, message: `Device ${config.luks.devicePath} not found` };
  }

  try {
    const result = await execCommand(
      'sudo',
      ['cryptsetup', 'luksKillSlot', config.luks.devicePath, String(slotIndex)],
      passphrase
    );

    if (result.code !== 0) {
      return { success: false, message: `Remove key failed: ${result.stderr}` };
    }

    logger.info({ device: config.luks.devicePath, slot: slotIndex }, 'LUKS key slot removed');
    return { success: true, message: 'Key slot removed successfully' };
  } catch (error) {
    logger.error({ error }, 'Remove key slot error');
    return { success: false, message: error.message };
  }
}

/**
 * Get complete vault status.
 * @returns {Promise<{state: string, device_present: boolean, mapper_active: boolean, mounted: boolean, device_info: object|null}>}
 */
export async function getStatus() {
  const dbStatus = getVaultStatusDb();
  const mapperActive = isMapperActive();
  const mountActive = isMounted();
  const present = deviceExists();
  const info = await getDeviceInfo();

  let state = dbStatus.state;

  // Reconcile actual state with DB state
  if (!mapperActive && !mountActive) {
    state = 'locked';
  } else if (mapperActive && !mountActive) {
    state = 'unlocked';
  } else if (mapperActive && mountActive) {
    state = 'mounted';
  }

  return {
    state,
    device_present: present,
    mapper_active: mapperActive,
    mounted: mountActive,
    device_path: config.luks.devicePath,
    mount_point: config.luks.mountPoint,
    mapper_name: config.luks.mapperName,
    device_info: info,
    last_unlocked_at: dbStatus.last_unlocked_at,
    last_locked_at: dbStatus.last_locked_at,
  };
}

/**
 * Backup the LUKS header.
 * @param {string} outputPath
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function backupHeader(outputPath) {
  if (!deviceExists()) {
    return { success: false, message: `Device ${config.luks.devicePath} not found` };
  }

  try {
    const result = await execCommand(
      'sudo',
      ['cryptsetup', 'luksHeaderBackup', config.luks.devicePath, '--header-backup-file', outputPath]
    );

    if (result.code !== 0) {
      return { success: false, message: `Header backup failed: ${result.stderr}` };
    }

    logger.info({ outputPath }, 'LUKS header backed up');
    return { success: true, message: 'Header backed up successfully' };
  } catch (error) {
    logger.error({ error }, 'Header backup error');
    return { success: false, message: error.message };
  }
}
