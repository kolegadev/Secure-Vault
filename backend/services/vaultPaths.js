import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { getPlatformDefaults } from '../config/platforms.js';

/**
 * Return the active vault mount point.
 * Priority:
 *   1. config.vault.mountPoint
 *   2. config.luks.mountPoint (backward compatibility)
 *   3. Platform default from platforms.js
 * @returns {string}
 */
export function getMountPoint() {
  return (
    config.vault?.mountPoint ||
    config.luks?.mountPoint ||
    getPlatformDefaults().defaultMountPoint
  );
}

/**
 * Return the active vault device path.
 * Priority:
 *   1. config.vault.devicePath
 *   2. config.luks.devicePath (backward compatibility)
 * @returns {string|null}
 */
export function getDevicePath() {
  return config.vault?.devicePath || config.luks?.devicePath || null;
}

/**
 * Check if the vault is mounted before file operations.
 * @throws {Error} If vault is not mounted
 */
export function requireMounted() {
  const mp = getMountPoint();
  try {
    fs.accessSync(mp, fs.constants.F_OK);
  } catch {
    throw new Error('Vault is not mounted');
  }
}

/**
 * Resolve a path within the vault mount point.
 * Rejects paths that escape the vault directory.
 * @param {string} relativePath
 * @returns {string}
 * @throws {Error} If path traversal is detected
 */
export function resolveVaultPath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw new Error('Path must be a string');
  }

  const mountPoint = getMountPoint();
  const normalizedMount = path.resolve(mountPoint);
  
  // Ensure the relative path doesn't start with separators or contain suspicious patterns
  const cleanPath = relativePath.replace(/^[/\\]+/, '');
  
  const resolved = path.resolve(normalizedMount, cleanPath);
  
  // Enhanced containment check
  if (!resolved.startsWith(normalizedMount + path.sep) && resolved !== normalizedMount) {
    throw new Error('Path traversal detected: path escapes vault directory');
  }

  return resolved;
}

/**
 * Return the full path to a configured vault subdirectory.
 * @param {string} dirKey - Config key, e.g. 'envDir', 'skillsDir', 'servicesDir'
 * @returns {string|null}
 */
export function getVaultSubdir(dirKey) {
  const dirName = config.paths?.[dirKey];
  if (!dirName) return null;
  return path.join(getMountPoint(), dirName);
}

/**
 * Normalize a stored absolute path to be relative to the current mount point.
 * Used for backward compatibility with V1 databases that stored absolute paths.
 *
 * @param {string} storedPath
 * @param {string} [dirKey] - Optional config key to help extraction (e.g. 'skillsDir')
 * @returns {string}
 */
export function normalizeStoredPath(storedPath, dirKey) {
  if (!storedPath) return storedPath;
  if (!path.isAbsolute(storedPath)) return storedPath;

  // If the path already starts with the current mount point, make it relative
  const mp = getMountPoint();
  const normalizedMp = path.resolve(mp);
  const normalizedPath = path.resolve(storedPath);

  if (normalizedPath.startsWith(normalizedMp + path.sep)) {
    return path.relative(normalizedMp, normalizedPath);
  }

  // If a dirKey is provided, try to extract the portion starting at that directory
  if (dirKey) {
    const dirName = config.paths?.[dirKey];
    if (dirName) {
      const idx = normalizedPath.indexOf(path.sep + dirName + path.sep);
      if (idx !== -1) {
        return normalizedPath.slice(idx + 1); // remove leading separator
      }
      // Cross-platform fallback: use forward slash
      const idxFwd = normalizedPath.indexOf('/' + dirName + '/');
      if (idxFwd !== -1) {
        return normalizedPath.slice(idxFwd + 1);
      }
    }
  }

  // Last resort: return the basename if we can't make it relative safely
  return storedPath;
}

/**
 * Convenience wrapper for skill paths.
 * @param {string} storedPath
 * @returns {string}
 */
export function normalizeSkillPath(storedPath) {
  return normalizeStoredPath(storedPath, 'skillsDir');
}
