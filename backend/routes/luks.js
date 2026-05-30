import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { VaultProviderFactory } from '../services/VaultProviderFactory.js';
import { LuksProvider } from '../services/providers/LuksProvider.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/status', async (_req, res, next) => {
  try {
    const provider = VaultProviderFactory.getProvider();
    const status = await provider.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const provider = VaultProviderFactory.getProvider();
    if (!(provider instanceof LuksProvider)) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'LUKS format is not supported by the current vault provider' },
      });
    }
    const { passphrase } = req.body;
    if (!passphrase) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PASSPHRASE', message: 'Passphrase required' } });
    }
    const result = await provider.formatDevice(passphrase);
    logger.info({}, 'LUKS volume created');
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/unlock', requireAuth, async (req, res, next) => {
  try {
    const provider = VaultProviderFactory.getProvider();
    const { passphrase } = req.body;
    if (!passphrase) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PASSPHRASE', message: 'Passphrase required' } });
    }
    const result = await provider.mountVault(null, null, passphrase);
    if (!result.success) {
      return res.status(400).json({ success: false, error: { code: 'UNLOCK_FAILED', message: result.message } });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/lock', requireAuth, async (_req, res, next) => {
  try {
    const provider = VaultProviderFactory.getProvider();
    const result = await provider.unmountVault();
    logger.info({}, 'Vault locked');
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/keyslot', requireAuth, async (req, res, next) => {
  try {
    const provider = VaultProviderFactory.getProvider();
    if (!(provider instanceof LuksProvider)) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'LUKS keyslot management is not supported by the current vault provider' },
      });
    }
    const { action, oldPass, newPass, slotIndex } = req.body;
    let result;

    if (action === 'add') {
      if (!oldPass || !newPass) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PASSPHRASES', message: 'Old and new passphrases required' } });
      }
      result = await provider.addKeySlot(oldPass, newPass);
    } else if (action === 'remove') {
      if (!oldPass || slotIndex === undefined) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'Passphrase and slot index required' } });
      }
      result = await provider.removeKeySlot(oldPass, slotIndex);
    } else {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ACTION', message: 'Action must be add or remove' } });
    }

    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/backup-header', requireAuth, async (req, res, next) => {
  try {
    const provider = VaultProviderFactory.getProvider();
    if (!(provider instanceof LuksProvider)) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_SUPPORTED', message: 'LUKS header backup is not supported by the current vault provider' },
      });
    }
    const { outputPath } = req.body;
    if (!outputPath) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PATH', message: 'Output path required' } });
    }
    const result = await provider.backupHeader(outputPath);
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
