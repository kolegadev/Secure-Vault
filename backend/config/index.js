import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env if it exists
dotenvConfig({ path: path.resolve(__dirname, '../.env') });

// Load default config
const defaultConfigPath = path.join(__dirname, 'default.json');
let defaultConfig = {};
if (fs.existsSync(defaultConfigPath)) {
  defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
}

/**
 * Merge default config with environment variable overrides.
 */
function loadConfig() {
  const cfg = { ...defaultConfig };

  // Server overrides
  if (process.env.PORT) cfg.server = { ...cfg.server, port: parseInt(process.env.PORT, 10) };
  if (process.env.HOST) cfg.server = { ...cfg.server, host: process.env.HOST };

  // Security overrides
  if (process.env.SESSION_SECRET) {
    cfg.security = { ...cfg.security, sessionSecret: process.env.SESSION_SECRET };
  }
  if (process.env.CORS_ORIGIN) {
    cfg.security = { ...cfg.security, corsOrigin: process.env.CORS_ORIGIN };
  }

  // LUKS overrides
  if (process.env.LUKS_DEVICE_PATH) {
    cfg.luks = { ...cfg.luks, devicePath: process.env.LUKS_DEVICE_PATH };
  }
  if (process.env.LUKS_MOUNT_POINT) {
    cfg.luks = { ...cfg.luks, mountPoint: process.env.LUKS_MOUNT_POINT };
  }
  if (process.env.LUKS_MAPPER_NAME) {
    cfg.luks = { ...cfg.luks, mapperName: process.env.LUKS_MAPPER_NAME };
  }

  // USB overrides
  if (process.env.USB_POLL_INTERVAL_MS) {
    cfg.usb = { ...cfg.usb, pollIntervalMs: parseInt(process.env.USB_POLL_INTERVAL_MS, 10) };
  }

  // Rate limit overrides
  if (process.env.RATE_LIMIT_MAX_REQUESTS) {
    cfg.rateLimit = {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10),
    };
  }

  return cfg;
}

export const config = loadConfig();

/**
 * Check if running in development mode.
 * @returns {boolean}
 */
export function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production mode.
 * @returns {boolean}
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}
