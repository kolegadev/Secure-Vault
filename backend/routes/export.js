import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { getMountPoint, resolveVaultPath } from '../services/vaultPaths.js';

const router = Router();

router.post('/dotenv', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { service_name } = req.body;

    if (!service_name || !service_name.trim()) {
      return res.status(400).json({ error: 'service_name is required' });
    }

    const trimmedName = service_name.trim();

    const service = db.prepare('SELECT id FROM services WHERE name = ?').get(trimmedName);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const rows = db.prepare(
      'SELECT name, value, description FROM env_vars WHERE service_name = ? ORDER BY name'
    ).all(trimmedName);

    const content = rows.map(r => `# ${r.description || r.name}\n${r.name}=${r.value}`).join('\n\n') + '\n';

    logger.info({ service_name: trimmedName, count: rows.length }, 'Dotenv exported');

    res.setHeader('Content-Disposition', `attachment; filename="${trimmedName}-env"`);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store');
    res.send(content);
  } catch (err) {
    next(err);
  }
});

router.post('/skills', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { skill_ids } = req.body;

    let sql = 'SELECT path FROM skills';
    if (skill_ids && skill_ids.length > 0) {
      sql += ` WHERE id IN (${skill_ids.map(() => '?').join(',')})`;
    }

    const rows = db.prepare(sql).all(...(skill_ids || []));
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="skills-export.zip"');
    archive.pipe(res);

    for (const row of rows) {
      // Resolve stored path relative to current mount point for cross-platform support
      let skillPath;
      try {
        skillPath = resolveVaultPath(row.path);
      } catch {
        // If resolve fails (e.g. absolute path from different mount point), try direct fs check
        skillPath = row.path;
      }

      if (fs.existsSync(skillPath)) {
        const dirName = path.basename(path.dirname(skillPath));
        archive.file(skillPath, { name: `${dirName}/SKILL.md` });
      }
    }

    archive.finalize();
    logger.info({ count: rows.length }, 'Skills exported');
  } catch (err) {
    next(err);
  }
});

router.post('/full', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const mountPoint = getMountPoint();
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="vault-backup-${Date.now()}.zip"`);
    archive.pipe(res);

    const dirs = [config.paths.envDir, config.paths.skillsDir, config.paths.servicesDir];
    for (const dir of dirs) {
      const fullDir = path.join(mountPoint, dir);
      if (fs.existsSync(fullDir)) {
        archive.directory(fullDir, dir);
      }
    }

    // Include vault.db
    const dbPath = path.join(mountPoint, config.paths.vaultDb);
    if (fs.existsSync(dbPath)) {
      archive.file(dbPath, { name: config.paths.vaultDb });
    }

    archive.finalize();
    logger.info({}, 'Full vault exported');
  } catch (err) {
    next(err);
  }
});

export default router;
