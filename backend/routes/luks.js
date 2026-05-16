import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getStatus,
  formatDevice,
  unlockDevice,
  lockDevice,
  addKeySlot,
  removeKeySlot,
  backupHeader,
} from '../services/luksManager.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/status', async (_req, res, next) => {
  try {
    const status = await getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const { passphrase } = req.body;
    if (!passphrase) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PASSPHRASE', message: 'Passphrase required' } });
    }
    const result = await formatDevice(passphrase);
    logger.info({}, 'LUKS volume created');
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/unlock', requireAuth, async (req, res, next) => {
  try {
    const { passphrase } = req.body;
    if (!passphrase) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PASSPHRASE', message: 'Passphrase required' } });
    }
    const result = await unlockDevice(passphrase);
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
    const result = await lockDevice();
    logger.info({}, 'Vault locked');
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/keyslot', requireAuth, async (req, res, next) => {
  try {
    const { action, oldPass, newPass, slotIndex } = req.body;
    let result;

    if (action === 'add') {
      if (!oldPass || !newPass) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PASSPHRASES', message: 'Old and new passphrases required' } });
      }
      result = await addKeySlot(oldPass, newPass);
    } else if (action === 'remove') {
      if (!oldPass || slotIndex === undefined) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'Passphrase and slot index required' } });
      }
      result = await removeKeySlot(oldPass, slotIndex);
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
    const { outputPath } = req.body;
    if (!outputPath) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PATH', message: 'Output path required' } });
    }
    const result = await backupHeader(outputPath);
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
