import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { readFile, writeFile, deleteFile, listDirectory, exists } from '../services/fileManager.js';
import { logger } from '../utils/logger.js';
import path from 'path';

const router = Router();

// File upload security configuration
const FILE_UPLOAD_CONFIG = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFileSizeByType: {
    '.txt': 10 * 1024 * 1024,
    '.md': 10 * 1024 * 1024,
    '.json': 25 * 1024 * 1024,
    '.csv': 100 * 1024 * 1024,
  },
  allowedExtensions: [
    '.txt', '.md', '.pdf', '.doc', '.docx', '.odt', '.rtf',
    '.csv', '.xls', '.xlsx', '.ods',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'
  ],
  forbiddenPatterns: [
    /<\?php/i, /<\?=/i, /<script[\s>]/i, /javascript:/i, /on\w+\s*=/i,
    /<!--\s*#\s*(include|exec|echo|config)/i, /\$\(\s*(curl|wget|bash|sh)/i
  ],
  allowedSubdirectories: ['documents', 'exports', 'uploads', 'backups', 'user-files']
};

function validateFileUpload(filePath, content) {
  const errors = [];
  
  // Basic validation
  if (!filePath || typeof filePath !== 'string') {
    errors.push({ code: 'INVALID_PATH', message: 'File path is required' });
    return { isValid: false, errors };
  }
  
  if (content === undefined || content === null) {
    errors.push({ code: 'INVALID_CONTENT', message: 'File content is required' });
    return { isValid: false, errors };
  }

  // Path traversal protection
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes('..') || filePath.includes('\0')) {
    errors.push({ code: 'PATH_TRAVERSAL', message: 'Invalid file path' });
    return { isValid: false, errors };
  }

  // Check allowed subdirectories
  const pathParts = normalizedPath.split(path.sep).filter(p => p);
  if (pathParts.length > 0 && !FILE_UPLOAD_CONFIG.allowedSubdirectories.includes(pathParts[0])) {
    errors.push({ code: 'INVALID_DIRECTORY', message: 'Directory not allowed' });
    return { isValid: false, errors };
  }

  // File extension validation
  const extension = path.extname(filePath).toLowerCase();
  if (!extension) {
    errors.push({ code: 'MISSING_EXTENSION', message: 'File must have an extension' });
    return { isValid: false, errors };
  }

  if (!FILE_UPLOAD_CONFIG.allowedExtensions.includes(extension)) {
    errors.push({ code: 'EXTENSION_NOT_ALLOWED', message: `File type ${extension} not allowed` });
    return { isValid: false, errors };
  }

  // Double extension check
  if (/\.(php|exe|sh|bat|cmd|jsp|asp|dll)\./i.test(filePath)) {
    errors.push({ code: 'DOUBLE_EXTENSION', message: 'Suspicious file extension detected' });
    return { isValid: false, errors };
  }

  // File size validation
  const sizeInBytes = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
  const maxSize = FILE_UPLOAD_CONFIG.maxFileSizeByType[extension] || FILE_UPLOAD_CONFIG.maxFileSize;
  
  if (sizeInBytes > maxSize) {
    errors.push({ code: 'FILE_TOO_LARGE', message: `File size ${Math.round(sizeInBytes/1024/1024)}MB exceeds limit` });
    return { isValid: false, errors };
  }

  // Content validation for text files
  const textExtensions = ['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.ini', '.csv'];
  if (textExtensions.includes(extension)) {
    const contentStr = Buffer.isBuffer(content) ? content.toString('utf8') : content;
    
    for (const pattern of FILE_UPLOAD_CONFIG.forbiddenPatterns) {
      if (pattern.test(contentStr)) {
        errors.push({ code: 'MALICIOUS_CONTENT', message: 'File content contains prohibited patterns' });
        return { isValid: false, errors };
      }
    }
  }

  // Reserved filename check
  const filename = path.basename(filePath).toLowerCase();
  const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'lpt1', '.htaccess', '.env'];
  if (reservedNames.includes(filename) || reservedNames.includes(path.parse(filename).name)) {
    errors.push({ code: 'RESERVED_FILENAME', message: 'Filename is reserved' });
    return { isValid: false, errors };
  }

  return { 
    isValid: true, 
    errors: [],
    sizeInBytes,
    extension,
    normalizedPath 
  };
}

router.get('/read', requireAuth, requireVaultMounted, (req, res, next) => {
  // Check rate limit
  if (!checkRateLimit(req.session.userId)) {
    return res.status(429).json({ 
      success: false, 
      error: { 
        code: 'RATE_LIMIT_EXCEEDED', 
        message: 'Too many file operations. Please try again later.' 
      } 
    });
  }

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

// Simple in-memory rate limiting for file operations
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 50; // 50 operations per window

function checkRateLimit(userId) {
  const now = Date.now();
  const userKey = userId || 'anonymous';
  
  if (!rateLimitMap.has(userKey)) {
    rateLimitMap.set(userKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const userLimit = rateLimitMap.get(userKey);
  if (now > userLimit.resetTime) {
    // Reset the window
    rateLimitMap.set(userKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

router.post('/write', requireAuth, requireVaultMounted, (req, res, next) => {
  // Check rate limit
  if (!checkRateLimit(req.session.userId)) {
    logger.warn({ user: req.session.userId }, 'Rate limit exceeded for file operations');
    return res.status(429).json({ 
      success: false, 
      error: { 
        code: 'RATE_LIMIT_EXCEEDED', 
        message: 'Too many file operations. Please try again later.' 
      } 
    });
  }

  try {
    const { path: filePath, content } = req.body;
    
    // Perform comprehensive security validation
    const validation = validateFileUpload(filePath, content);
    if (!validation.isValid) {
      logger.warn({ path: filePath, user: req.session.userId, errors: validation.errors }, 'File write rejected due to validation failure');
      return res.status(400).json({ 
        success: false, 
        error: { 
          code: 'VALIDATION_FAILED', 
          message: validation.errors[0].message,
          details: validation.errors
        } 
      });
    }

    writeFile(validation.normalizedPath, content);
    logger.info({ path: filePath, user: req.session.userId, size: validation.sizeInBytes }, 'File written successfully');
    res.json({ 
      success: true, 
      data: { 
        path: filePath, 
        message: 'File written',
        size: validation.sizeInBytes,
        extension: validation.extension
      } 
    });
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