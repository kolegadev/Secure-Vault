/**
 * Platform-specific defaults for VeraCrypt and path resolution.
 * Used by VeraCryptProvider to determine binaries and mount points.
 */

export const PLATFORM_DEFAULTS = {
  linux: {
    veracryptBin: '/usr/bin/veracrypt',
    defaultMountPoint: '/mnt/securevault',
  },
  darwin: {
    veracryptBin: '/Applications/VeraCrypt.app/Contents/MacOS/VeraCrypt',
    defaultMountPoint: '/Volumes/SecureVault',
  },
  win32: {
    veracryptBin: 'VeraCrypt.exe',
    defaultMountPoint: 'S:',
  },
};

/**
 * Return defaults for the current platform, falling back to Linux.
 * @returns {{veracryptBin: string, defaultMountPoint: string}}
 */
export function getPlatformDefaults() {
  const platform = process.platform;
  return PLATFORM_DEFAULTS[platform] || PLATFORM_DEFAULTS.linux;
}
