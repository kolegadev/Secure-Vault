import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { VaultProvider } from '../VaultProvider.js';
import { MountError, ValidationError } from '../errors.js';
import { getPlatformDefaults } from '../../config/platforms.js';
import { logger } from '../../utils/logger.js';

/**
 * VeraCrypt-backed VaultProvider.
 * Supports Linux, macOS, and Windows via the VeraCrypt CLI.
 *
 * Security rules enforced:
 * - Password is passed via stdin ONLY; never as a CLI argument.
 * - Password is never logged.
 * - The local password variable is overwritten after use.
 */
export class VeraCryptProvider extends VaultProvider {
  constructor(config) {
    super(config);
    this.providerName = 'veracrypt';
    this.platform = process.platform;
    const defaults = getPlatformDefaults();
    this.veracryptBin = config.veracrypt?.binaryPath || defaults.veracryptBin;
    this.defaultMountPoint = config.veracrypt?.mountPoint || defaults.defaultMountPoint;
    this.mountWrapper = config.veracrypt?.mountWrapper || defaults.mountWrapper;
    this.unmountWrapper = config.veracrypt?.unmountWrapper || defaults.unmountWrapper;
    this.mountTimeoutMs = config.vault?.mountTimeoutMs || 30000;
  }

  /* ------------------------------------------------------------------ */
  /*  Low-level helpers                                                  */
  /* ------------------------------------------------------------------ */

  _devicePath() {
    return this.config.luks?.devicePath;
  }

  _mountPoint(mountPoint) {
    return mountPoint || this.config.luks?.mountPoint || this.defaultMountPoint;
  }

  /**
   * Check if secure sudo wrappers are installed and available.
   * Used on Linux to avoid granting blanket sudo access to veracrypt.
   * @returns {boolean}
   */
  _hasSecureWrappers() {
    if (this.platform !== 'linux') return false;
    try {
      return !!(
        this.mountWrapper &&
        fs.existsSync(this.mountWrapper) &&
        this.unmountWrapper &&
        fs.existsSync(this.unmountWrapper)
      );
    } catch {
      return false;
    }
  }

  /**
   * Spawn VeraCrypt CLI (or a wrapper) with the given args.
   * Does NOT log args that could contain sensitive data (defense in depth).
   * @param {string[]} args
   * @param {string|null} input
   * @param {string} [command] — override command (defaults to veracrypt binary)
   */
  _spawnVc(args, input, command = this.veracryptBin) {
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

  /**
   * Execute a VeraCrypt command with timeout support.
   * @param {string[]} args
   * @param {string|null} input
   * @param {string} [command]
   */
  async _execVc(args, input, command) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new MountError('VeraCrypt operation timed out', 'MOUNT_TIMEOUT'));
      }, this.mountTimeoutMs);
    });

    const execPromise = this._spawnVc(args, input, command);
    return Promise.race([execPromise, timeoutPromise]);
  }

  deviceExists() {
    try {
      fs.accessSync(this._devicePath(), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  isMounted(mountPoint) {
    const mp = this._mountPoint(mountPoint);
    if (this.platform === 'linux') {
      try {
        const mounts = fs.readFileSync('/proc/mounts', 'utf-8');
        return mounts.split('\n').some(line => line.includes(mp));
      } catch {
        return false;
      }
    }
    if (this.platform === 'darwin') {
      try {
        const result = this._spawnVc(['--text', '--list']);
        // --list returns mounted volumes; check if mp appears
        // Synchronous fallback for isMounted checks:
        return fs.existsSync(mp);
      } catch {
        return fs.existsSync(mp);
      }
    }
    if (this.platform === 'win32') {
      return fs.existsSync(mp + '\\');
    }
    return fs.existsSync(mp);
  }

  /* ------------------------------------------------------------------ */
  /*  VaultProvider interface                                            */
  /* ------------------------------------------------------------------ */

  async detectDevices() {
    const candidates = [];

    if (this.platform === 'linux') {
      try {
        const diskById = '/dev/disk/by-id';
        if (!fs.existsSync(diskById)) return candidates;
        const entries = fs.readdirSync(diskById).filter(e => e.includes('usb'));
        for (const entry of entries) {
          const fullPath = fs.realpathSync(path.join(diskById, entry));
          candidates.push({ name: entry, path: fullPath });
        }
      } catch (err) {
        logger.warn({ err }, 'VeraCrypt device detection failed on Linux');
      }
      return candidates;
    }

    if (this.platform === 'darwin') {
      try {
        const result = await this._spawnVc([], null);
        // VeraCrypt on macOS doesn't have a direct list-removable CLI.
        // Fallback: use diskutil to enumerate external disks.
        const diskutil = spawn('diskutil', ['list', 'external', 'physical']);
        let stdout = '';
        diskutil.stdout.on('data', (d) => { stdout += d.toString(); });
        await new Promise((resolve) => diskutil.on('close', resolve));
        const lines = stdout.split('\n');
        for (const line of lines) {
          const match = line.match(/^(\/dev\/disk\d+)/);
          if (match) {
            candidates.push({ name: `external-${path.basename(match[1])}`, path: match[1] });
          }
        }
      } catch (err) {
        logger.warn({ err }, 'VeraCrypt device detection failed on macOS');
      }
      return candidates;
    }

    if (this.platform === 'win32') {
      try {
        // PowerShell one-liner to get removable drives
        const ps = spawn('powershell.exe', [
          '-NoProfile', '-Command',
          'Get-Disk | Where-Object {$_.BusType -eq "USB"} | Select-Object Number, FriendlyName | ConvertTo-Json -Compress'
        ]);
        let stdout = '';
        ps.stdout.on('data', (d) => { stdout += d.toString(); });
        await new Promise((resolve) => ps.on('close', resolve));
        const data = JSON.parse(stdout);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item && item.Number !== undefined) {
            candidates.push({ name: item.FriendlyName || `disk-${item.Number}`, path: `\\.\\PhysicalDrive${item.Number}` });
          }
        }
      } catch (err) {
        logger.warn({ err }, 'VeraCrypt device detection failed on Windows');
      }
      return candidates;
    }

    return candidates;
  }

  async getStatus() {
    const dbStatus = this._getVaultStatusDb();
    const mountActive = this.isMounted();
    const present = this.deviceExists();

    let state = dbStatus.state;
    if (!mountActive) {
      state = 'locked';
    } else {
      state = 'mounted';
    }

    return {
      state,
      device_present: present,
      mapper_active: mountActive, // VeraCrypt does not expose a mapper device
      mounted: mountActive,
      device_path: this._devicePath(),
      mount_point: this._mountPoint(),
      mapper_name: null,
      device_info: {
        isLuks: false,
        keySlots: 0,
        totalSlots: 0,
        uuid: null,
        cipher: null,
      },
      last_unlocked_at: dbStatus.last_unlocked_at,
      last_locked_at: dbStatus.last_locked_at,
      provider: this.providerName,
    };
  }

  async mountVault(devicePath, mountPoint, password) {
    const dp = devicePath || this._devicePath();
    const mp = this._mountPoint(mountPoint);

    if (!this.deviceExists()) {
      return { success: false, message: `Device ${dp} not found` };
    }

    if (this.isMounted(mp)) {
      this._updateVaultStatusDb({ state: 'mounted', device_path: dp, mount_point: mp, mapper_name: null });
      return { success: true, message: 'Vault is already mounted' };
    }

    if (!fs.existsSync(mp)) {
      fs.mkdirSync(mp, { recursive: true });
    }

    try {
      // Use secure sudo wrappers on Linux when available; otherwise fall back to direct binary
      const useWrapper = this._hasSecureWrappers();
      const command = useWrapper ? 'sudo' : this.veracryptBin;
      const args = useWrapper
        ? [this.mountWrapper, dp, mp]
        : ['--text', '--mount', dp, mp, '--stdin'];
      const result = await this._execVc(args, password + '\n', command);

      // Security: clear password from local variable immediately
      // eslint-disable-next-line no-param-reassign
      password = null;

      if (result.code !== 0) {
        logger.error({ stderr: result.stderr }, 'VeraCrypt mount failed');
        return { success: false, message: `Mount failed: ${result.stderr}` };
      }

      // Ensure subdirectories exist (idempotent)
      await this.validateVaultStructure(mp);

      this._updateVaultStatusDb({ state: 'mounted', device_path: dp, mount_point: mp, mapper_name: null });
      logger.info({ mountPoint: mp }, 'VeraCrypt vault mounted');
      return { success: true, message: 'Vault mounted successfully' };
    } catch (error) {
      // eslint-disable-next-line no-param-reassign
      password = null;
      if (error instanceof MountError) {
        return { success: false, message: error.message };
      }
      logger.error({ error }, 'VeraCrypt mount error');
      return { success: false, message: error.message };
    }
  }

  async unmountVault(mountPoint) {
    const mp = this._mountPoint(mountPoint);

    if (!this.isMounted(mp)) {
      this._updateVaultStatusDb({ state: 'locked', device_path: null, mount_point: null, mapper_name: null });
      return { success: true, message: 'Vault is not mounted' };
    }

    try {
      const useWrapper = this._hasSecureWrappers();
      const command = useWrapper ? 'sudo' : this.veracryptBin;
      const args = useWrapper
        ? [this.unmountWrapper, mp]
        : ['--text', '--dismount', mp];
      const result = await this._execVc(args, null, command);

      if (result.code !== 0) {
        // Check for busy-device hint
        const isBusy = result.stderr.toLowerCase().includes('busy') || result.stderr.toLowerCase().includes('in use');
        if (isBusy) {
          return { success: false, message: 'Unmount failed: vault is in use. Close open files and try again.' };
        }
        logger.error({ stderr: result.stderr }, 'VeraCrypt dismount failed');
        return { success: false, message: `Unmount failed: ${result.stderr}` };
      }

      this._updateVaultStatusDb({ state: 'locked', device_path: null, mount_point: null, mapper_name: null });
      logger.info({ mountPoint: mp }, 'VeraCrypt vault unmounted');
      return { success: true, message: 'Vault unmounted successfully' };
    } catch (error) {
      if (error instanceof MountError) {
        return { success: false, message: error.message };
      }
      logger.error({ error }, 'VeraCrypt unmount error');
      return { success: false, message: error.message };
    }
  }
}
