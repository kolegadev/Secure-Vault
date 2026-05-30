import { config } from '../config/index.js';
import { LuksProvider } from './providers/LuksProvider.js';
import { VeraCryptProvider } from './providers/VeraCryptProvider.js';
import { logger } from '../utils/logger.js';

let cachedProvider = null;

/**
 * VaultProviderFactory
 *
 * Returns a singleton VaultProvider instance based on configuration:
 *  - config.vault.provider  (default: 'luks')
 *  - env VAULT_PROVIDER     (overrides config)
 *
 * Design note: The factory caches the provider for the lifetime of the process.
 * Call reset() if you need to force re-instantiation (e.g. in tests).
 */
export const VaultProviderFactory = {
  getProvider() {
    if (cachedProvider) {
      return cachedProvider;
    }

    const providerName = (process.env.VAULT_PROVIDER || config.vault?.provider || 'luks').toLowerCase();

    if (providerName === 'veracrypt') {
      cachedProvider = new VeraCryptProvider(config);
      logger.info({ provider: 'veracrypt' }, 'VaultProvider initialized: VeraCrypt');
    } else {
      cachedProvider = new LuksProvider(config);
      logger.info({ provider: 'luks' }, 'VaultProvider initialized: LUKS');
    }

    return cachedProvider;
  },

  reset() {
    cachedProvider = null;
    logger.info('VaultProvider cache reset');
  },
};
