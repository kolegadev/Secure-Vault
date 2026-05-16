import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { readFile, writeFile, deleteFile, listDirectory, exists } from '../services/fileManager.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/read', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PATH', message: 'Path query parameter required' } });
    }

    const content = readFile(filePath);
    res.json({ success: true, data: { path: filePath, content } });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
    }
    next(err);
  }
});

router.post('/write', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Path and content required' } });
    }

    writeFile(filePath, content);
    res.json({ success: true, data: { path: filePath, message: 'File written' } });
  } catch (err) {
    next(err);
  }
});

router.delete('/delete', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PATH', message: 'Path query parameter required' } });
    }

    deleteFile(filePath);
    logger.info({ path: filePath, user: req.session.userId }, 'File deletion successful');
    res.json({ success: true, data: { path: filePath, message: 'File deleted' } });
  } catch (err) {
    if (err.code === 'PROTECTED_FILE') {
      return res.status(403).json({ 
        success: false, 
        error: { 
          code: 'PROTECTED_FILE', 
          message: 'Cannot delete protected system file',
          details: err.message
        } 
      });
    }
    if (err.code === 'ENOENT') {
      return res.status(404).json({ 
        success: false, 
        error: { 
          code: 'NOT_FOUND', 
          message: 'File not found' 
        } 
      });
    }
    if (err.code === 'EISDIR') {
      return res.status(400).json({ 
        success: false, 
        error: { 
          code: 'IS_DIRECTORY', 
          message: 'Cannot delete directory using file deletion endpoint' 
        } 
      });
    }
    next(err);
  }
});

router.get('/list', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const { dir } = req.query;
    const entries = listDirectory(dir || '');
    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
});

router.get('/exists', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PATH', message: 'Path query parameter required' } });
    }

    res.json({ success: true, data: { path: filePath, exists: exists(filePath) } });
  } catch (err) {
    next(err);
  }
});

export default router;