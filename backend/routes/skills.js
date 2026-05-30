import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import {
  syncSkillsToDatabase,
  installSkill,
  uninstallSkill,
  parseSkillMarkdown,
} from '../services/skillScanner.js';
import { writeFile, readFile } from '../services/fileManager.js';
import { normalizeSkillPath } from '../services/vaultPaths.js';
import path from 'path';
import { config } from '../config/index.js';

const router = Router();

router.get('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { search, installed } = req.query;

    let sql = 'SELECT id, name, description, path, installed_at, created_at FROM skills WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (installed === 'true') {
      sql += ' AND installed_at IS NOT NULL';
    } else if (installed === 'false') {
      sql += ' AND installed_at IS NULL';
    }

    sql += ' ORDER BY name';
    const rows = db.prepare(sql).all(...params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);

    if (!row) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Skill not found' } });
    }

    let frontmatter = null;
    let body = '';
    try {
      const skillPath = normalizeSkillPath(row.path);
      const content = readFile(skillPath);
      const parsed = parseSkillMarkdown(content);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch (error) {
      logger.warn({ error, path: row.path }, 'Could not read skill content');
    }

    res.json({
      success: true,
      data: {
        ...row,
        frontmatter,
        body,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/scan', requireAuth, requireVaultMounted, async (req, res, next) => {
  try {
    const result = await syncSkillsToDatabase();
    logger.info(result, 'Skills scanned');
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const { name, description, content, directory } = req.body;

    if (!name || !content) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Name and content are required' } });
    }

    // Sanitize directory parameter to prevent path traversal
    const rawSkillDir = directory || name.toLowerCase().replace(/\s+/g, '-');
    const sanitizedDir = path.basename(rawSkillDir);

    // Construct the intended skills directory path
    const relativePath = path.join(config.paths.skillsDir, sanitizedDir, 'SKILL.md');

    // Ensure the resolved path is within the skills directory
    const resolvedRelative = path.normalize(relativePath);
    const skillsPrefix = path.normalize(config.paths.skillsDir);
    if (!resolvedRelative.startsWith(skillsPrefix + path.sep) && resolvedRelative !== skillsPrefix) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATH', message: 'Invalid directory path' }
      });
    }

    writeFile(relativePath, content);

    // Parse frontmatter for DB
    const parsed = parseSkillMarkdown(content);
    const frontmatterJson = parsed.frontmatter ? JSON.stringify(parsed.frontmatter) : null;
    const metadataJson = parsed.frontmatter?.openclaw ? JSON.stringify(parsed.frontmatter.openclaw) : '{}';

    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO skills (name, description, path, frontmatter, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, description || null, relativePath, frontmatterJson, metadataJson);

    logger.info({ id: result.lastInsertRowid, name }, 'Skill created');
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid, name, path: relativePath } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { content } = req.body;
    const id = req.params.id;

    const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    if (!skill) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Skill not found' } });
    }

    const skillPath = normalizeSkillPath(skill.path);
    writeFile(skillPath, content);

    const parsed = parseSkillMarkdown(content);
    const frontmatterJson = parsed.frontmatter ? JSON.stringify(parsed.frontmatter) : null;
    const metadataJson = parsed.frontmatter?.openclaw ? JSON.stringify(parsed.frontmatter.openclaw) : '{}';
    const name = parsed.frontmatter?.name || skill.name;
    const description = parsed.frontmatter?.description || skill.description;

    db.prepare(`
      UPDATE skills SET name = ?, description = ?, frontmatter = ?, metadata = ? WHERE id = ?
    `).run(name, description, frontmatterJson, metadataJson, id);

    logger.info({ id }, 'Skill updated');
    res.json({ success: true, data: { id, message: 'Updated successfully' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/install', requireAuth, requireVaultMounted, async (req, res, next) => {
  try {
    const result = await installSkill(req.params.id);
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/uninstall', requireAuth, requireVaultMounted, async (req, res, next) => {
  try {
    const result = await uninstallSkill(req.params.id);
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
