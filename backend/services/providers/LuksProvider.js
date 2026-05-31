import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { VaultProvider } from '../VaultProvider.js';
import { logger } from '../../utils/logger.js';

/**
 * LUKS-backed VaultProvider adapter.
 * Implements the generic VaultProvider interface plus LUKS-specific
 * operations (format, keyslot management, header backup).
 *
 * This class is a drop-in replacement for the legacy luksManager.js module.
 */
export class LuksProvider extends VaultProvider {
  constructor(config) {
    super(config);
    this.providerName = 'luks';
  }

  /* ------------------------------------------------------------------ */
  /*  Low-level helpers                                                  */
  /* ------------------------------------------------------------------ */

  _devicePath() {
    return this.config.luks?.devicePath;
  }

  _mountPoint() {
    return this.config.luks?.mountPoint;
  }

  _mapperName() {
    return this.config.luks?.mapperName;
  }

  _mapperPath() {
    return `/dev/mapper/${this._mapperName()}`;
  }

  /**
   * Execute a command and return stdout/stderr.
   * Passphrase is NEVER logged.
   */
  _exec(command, args, input) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });

      child.on('error', (err) => reject(err));

      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      } else {
        child.stdin.end();
      }
    });
  }

  deviceExists() {
    try {
      fs.accessSync(this._devicePath(), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  isMapperActive() {
    return fs.existsSync(this._mapperPath());
  }

  isMounted(mountPoint = this._mountPoint()) {
    try {
      const mounts = fs.readFileSync('/proc/mounts', 'utf-8');
      return mounts.split('\n').some(line => line.includes(mountPoint));
    } catch {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  VaultProvider interface                                            */
  /* ------------------------------------------------------------------ */

  async detectDevices() {
    const candidates = [];
    try {
      const diskById = '/dev/disk/by-id';
      if (!fs.existsSync(diskById)) return candidates;

      const entries = fs.readdirSync(diskById).filter(e => e.includes('usb'));
      for (const entry of entries) {
        const fullPath = fs.realpathSync(path.join(diskById, entry));
        // Verify it's a LUKS device
        const check = await this._exec('sudo', ['cryptsetup', 'isLuks', fullPath]);
        if (check.code === 0) {
          candidates.push({ name: entry, path: fullPath });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'LUKS device detection failed');
    }
    return candidates;
  }

  async getStatus() {
    const dbStatus = this._getVaultStatusDb();
    const mapperActive = this.isMapperActive();
    const mountActive = this.isMounted();
    const present = this.deviceExists();
    const info = await this.getDeviceInfo();

    let state = dbStatus.state;
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
      device_path: this._devicePath(),
      mount_point: this._mountPoint(),
      mapper_name: this._mapperName(),
      device_info: info,
      last_unlocked_at: dbStatus.last_unlocked_at,
      last_locked_at: dbStatus.last_locked_at,
      provider: this.providerName,
    };
  }

  async mountVault(devicePath, mountPoint, password) {
    const dp = devicePath || this._devicePath();
    const mp = mountPoint || this._mountPoint();
    const mapper = this._mapperName();

    // Already active?
    if (this.isMapperActive()) {
      if (this.isMounted(mp)) {
        this._updateVaultStatusDb({
          state: 'mounted',
          device_path: dp,
          mount_point: mp,
          mapper_name: mapper,
        });
        return { success: true, message: 'Vault is already unlocked and mounted' };
      }
      return this._performMount(dp, mp);
    }

    if (!this.deviceExists()) {
      return { success: false, message: `Device ${dp} not found` };
    }

    try {
      const openResult = await this._exec(
        'sudo',
        ['cryptsetup', 'open', dp, mapper, '--type', 'luks2'],
        password
      );

      if (openResult.code !== 0) {
        logger.error({ stderr: openResult.stderr }, 'LUKS unlock failed');
        return { success: false, message: `Unlock failed: ${openResult.stderr}` };
      }

      logger.info({ device: dp, mapper }, 'LUKS device unlocked');
      this._updateVaultStatusDb({ state: 'unlocked', device_path: dp, mapper_name: mapper });
      return this._performMount(dp, mp);
    } catch (error) {
      logger.error({ error }, 'LUKS unlock error');
      return { success: false, message: error.message };
    }
  }

  async _performMount(devicePath, mountPoint) {
    const mp = mountPoint || this._mountPoint();
    const mapperPath = this._mapperPath();

    if (this.isMounted(mp)) {
      this._updateVaultStatusDb({ state: 'mounted', mount_point: mp });
      return { success: true, message: 'Vault is already mounted' };
    }

    if (!this.isMapperActive()) {
      return { success: false, message: 'Cannot mount: vault is not unlocked' };
    }

    if (!fs.existsSync(mp)) {
      fs.mkdirSync(mp, { recursive: true });
    }

    try {
      const result = await this._exec('sudo', ['mount', mapperPath, mp]);
      if (result.code !== 0) {
        logger.error({ stderr: result.stderr }, 'Mount failed');
        return { success: false, message: `Mount failed: ${result.stderr}` };
      }

      // Ensure subdirectories exist (idempotent)
      await this.validateVaultStructure(mp);

      this._updateVaultStatusDb({ state: 'mounted', mount_point: mp });
      logger.info({ mountPoint: mp }, 'Vault mounted');
      return { success: true, message: 'Vault mounted successfully' };
    } catch (error) {
      logger.error({ error }, 'Mount error');
      return { success: false, message: error.message };
    }
  }

  async unmountVault(mountPoint) {
    const mp = mountPoint || this._mountPoint();
    const mapper = this._mapperName();

    try {
      if (this.isMounted(mp)) {
        const umountResult = await this._exec('sudo', ['umount', mp]);
        if (umountResult.code !== 0) {
          logger.error({ stderr: umountResult.stderr }, 'Unmount failed');
          return { success: false, message: `Unmount failed: ${umountResult.stderr}` };
        }
        logger.info({ mountPoint: mp }, 'Vault unmounted');
      }

      if (this.isMapperActive(mapper)) {
        const closeResult = await this._exec('sudo', ['cryptsetup', 'close', mapper]);
        if (closeResult.code !== 0) {
          logger.error({ stderr: closeResult.stderr }, 'LUKS close failed');
          return { success: false, message: `Lock failed: ${closeResult.stderr}` };
        }
        logger.info({ mapper }, 'LUKS device closed');
      }

      this._updateVaultStatusDb({ state: 'locked', device_path: null, mount_point: null, mapper_name: null });
      return { success: true, message: 'Vault locked successfully' };
    } catch (error) {
      logger.error({ error }, 'Lock error');
      return { success: false, message: error.message };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  LUKS-specific operations                                           */
  /* ------------------------------------------------------------------ */

  async getDeviceInfo() {
    if (!this.deviceExists()) {
      return { uuid: null, cipher: null, keySlots: 0, totalSlots: 0, isLuks: false };
    }
    try {
      const result = await this._exec('sudo', ['cryptsetup', 'luksDump', this._devicePath()]);
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

  async formatDevice(passphrase) {
    if (!this.deviceExists()) {
      return { success: false, message: `Device ${this._devicePath()} not found` };
    }
    try {
      const result = await this._exec(
        'sudo',
        ['cryptsetup', '--type', 'luks2', '--cipher', 'aes-xts-plain64', '--key-size', '512', '--hash', 'sha256', 'luksFormat', this._devicePath(), '-'],
        passphrase
      );
      if (result.code !== 0) {
        logger.error({ stderr: result.stderr }, 'LUKS format failed');
        return { success: false, message: `Format failed: ${result.stderr}` };
      }
      logger.info({ device: this._devicePath() }, 'LUKS device formatted');
      return { success: true, message: 'Device formatted successfully' };
    } catch (error) {
      logger.error({ error }, 'LUKS format error');
      return { success: false, message: error.message };
    }
  }

  async addKeySlot(oldPassphrase, newPassphrase) {
    if (!this.deviceExists()) {
      return { success: false, message: `Device ${this._devicePath()} not found` };
    }
    try {
      const result = await this._exec(
        'sudo',
        ['cryptsetup', 'luksAddKey', this._devicePath(), '-'],
        `${oldPassphrase}\n${newPassphrase}`
      );
      if (result.code !== 0) {
        return { success: false, message: `Add key failed: ${result.stderr}` };
      }
      logger.info({ device: this._devicePath() }, 'LUKS key slot added');
      return { success: true, message: 'Key slot added successfully' };
    } catch (error) {
      logger.error({ error }, 'Add key slot error');
      return { success: false, message: error.message };
    }
  }

  async removeKeySlot(passphrase, slotIndex) {
    if (!this.deviceExists()) {
      return { success: false, message: `Device ${this._devicePath()} not found` };
    }
    try {
      const result = await this._exec(
        'sudo',
        ['cryptsetup', 'luksKillSlot', this._devicePath(), String(slotIndex)],
        passphrase
      );
      if (result.code !== 0) {
        return { success: false, message: `Remove key failed: ${result.stderr}` };
      }
      logger.info({ device: this._devicePath(), slot: slotIndex }, 'LUKS key slot removed');
      return { success: true, message: 'Key slot removed successfully' };
    } catch (error) {
      logger.error({ error }, 'Remove key slot error');
      return { success: false, message: error.message };
    }
  }

  async backupHeader(userSuggestedName) {
    if (!this.deviceExists()) {
      return { success: false, message: `Device ${this._devicePath()} not found` };
    }
    const secureBackupPath = this._generateSecureBackupPath(userSuggestedName);
    try {
      const result = await this._exec(
        'sudo',
        ['cryptsetup', 'luksHeaderBackup', this._devicePath(), '--header-backup-file', secureBackupPath]
      );
      if (result.code !== 0) {
        return { success: false, message: `Header backup failed: ${result.stderr}` };
      }
      logger.info({ backupPath: secureBackupPath }, 'LUKS header backed up');
      return { 
        success: true, 
        message: `Header backed up successfully to: ${secureBackupPath}`,
        backupPath: secureBackupPath
      };
    } catch (error) {
      logger.error({ error }, 'Header backup error');
      return { success: false, message: error.message };
    }
  }

  _generateSecureBackupPath(userSuggestedName) {
    // Create temp directory if it doesn't exist
    const tempDir = '/tmp/luks-backups';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { mode: 0o700 }); // Only owner can access
    }

    // Sanitize user-suggested name to prevent any path issues
    let sanitizedName = 'luks-header';
    if (userSuggestedName && typeof userSuggestedName === 'string') {
      // Only allow alphanumeric, dots, hyphens, underscores
      const cleaned = userSuggestedName.replace(/[^a-zA-Z0-9.\-_]/g, '');
      if (cleaned && cleaned.length > 0 && cleaned.length <= 100) {
        sanitizedName = cleaned;
      }
    }

    // Generate unique filename with timestamp to prevent conflicts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sanitizedName}-${timestamp}.backup`;
    
    return path.join(tempDir, filename);
  }
}
