import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * USB device monitor using udevadm or fallback to polling /dev/disk/by-id.
 * Emits events: 'attached', 'detached', 'error'.
 */
class USBMonitor extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.pollingInterval = null;
    this.knownDevices = new Set();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('Starting USB monitor...');

    // Try udevadm monitor first; fallback to polling
    this.tryUdevMonitor().catch(() => {
      logger.warn('udevadm monitor unavailable, falling back to polling');
      this.startPolling();
    });
  }

  stop() {
    this.isRunning = false;
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    logger.info('USB monitor stopped');
  }

  async tryUdevMonitor() {
    return new Promise((resolve, reject) => {
      this.child = spawn('udevadm', ['monitor', '--subsystem-match=block', '--property'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let buffer = '';

      this.child.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          this.parseUdevLine(line);
        }
      });

      this.child.stderr.on('data', (data) => {
        logger.error({ error: data.toString() }, 'udevadm error');
      });

      this.child.on('error', (err) => {
        reject(err);
      });

      this.child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`udevadm exited with code ${code}`));
        }
      });

      // Give it a moment to start
      setTimeout(() => resolve(), 500);
    });
  }

  parseUdevLine(line) {
    if (line.includes('add@') || line.includes('change@')) {
      this.emit('attached', { type: 'usb', timestamp: new Date().toISOString() });
    } else if (line.includes('remove@')) {
      this.emit('detached', { type: 'usb', timestamp: new Date().toISOString() });
    }
  }

  startPolling() {
    this.pollingInterval = setInterval(() => {
      this.pollDevices().catch(err => logger.error({ error: err }, 'USB poll error'));
    }, config.usb.pollIntervalMs || 2000);
  }

  async pollDevices() {
    const fs = await import('fs');
    const path = await import('path');

    try {
      const diskById = '/dev/disk/by-id';
      if (!fs.existsSync(diskById)) return;

      const entries = fs.readdirSync(diskById);
      const usbEntries = entries.filter(e => e.includes('usb'));
      const currentDevices = new Set(usbEntries);

      // Detect additions
      for (const device of usbEntries) {
        if (!this.knownDevices.has(device)) {
          this.emit('attached', {
            type: 'usb',
            device,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Detect removals
      for (const device of this.knownDevices) {
        if (!currentDevices.has(device)) {
          this.emit('detached', {
            type: 'usb',
            device,
            timestamp: new Date().toISOString(),
          });
        }
      }

      this.knownDevices = currentDevices;
    } catch (error) {
      logger.error({ error }, 'USB poll failed');
    }
  }

  /**
   * Get list of currently attached USB block devices.
   * @returns {{name: string, path: string, size: string|null}[]}
   */
  getAttachedDevices() {
    const fs = require ? require('fs') : null;
    if (!fs) return [];

    try {
      const diskById = '/dev/disk/by-id';
      if (!fs.existsSync(diskById)) return [];

      return fs.readdirSync(diskById)
        .filter(e => e.includes('usb'))
        .map(e => {
          const fullPath = fs.realpathSync(path.join(diskById, e));
          let size = null;
          try {
            const sizeBytes = fs.readFileSync(`/sys/block/${path.basename(fullPath)}/size`, 'utf-8');
            size = `${Math.round(parseInt(sizeBytes.trim()) * 512 / 1024 / 1024 / 1024)}GB`;
          } catch { /* ignore */ }
          return { name: e, path: fullPath, size };
        });
    } catch {
      return [];
    }
  }
}

export const usbMonitor = new USBMonitor();
