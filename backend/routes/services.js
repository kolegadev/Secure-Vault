import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { generateServiceReadme } from '../services/readmeGenerator.js';

const router = Router();

router.get('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { search } = req.query;

    let sql = 'SELECT * FROM services WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY name';
    const rows = db.prepare(sql).all(...params);

    // Attach env var counts
    const result = rows.map(s => {
      const count = db.prepare('SELECT COUNT(*) as count FROM env_vars WHERE service_name = ?').get(s.name);
      return { ...s, env_var_count: count.count };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);

    if (!row) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    const envVars = db.prepare('SELECT id, name, value, description FROM env_vars WHERE service_name = ?').all(row.name);
    const skills = db.prepare(`
      SELECT s.id, s.name, s.description FROM skills s
      INNER JOIN env_vars ev ON ev.skill_id = s.id
      WHERE ev.service_name = ? GROUP BY s.id
    `).all(row.name);

    res.json({ success: true, data: { ...row, env_vars: envVars, skills } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { name, description, swagger_url } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_NAME', message: 'Service name is required' } });
    }

    const existing = db.prepare('SELECT id FROM services WHERE name = ?').get(name);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Service '${name}' already exists` } });
    }

    const result = db.prepare(`
      INSERT INTO services (name, description, swagger_url)
      VALUES (?, ?, ?)
    `).run(name, description || null, swagger_url || null);

    logger.info({ id: result.lastInsertRowid, name }, 'Service created');
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid, name, description, swagger_url } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { name, description, swagger_url } = req.body;
    const id = req.params.id;

    const existing = db.prepare('SELECT id FROM services WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    if (name) {
      const conflict = db.prepare('SELECT id FROM services WHERE name = ? AND id != ?').get(name, id);
      if (conflict) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Service '${name}' already exists` } });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (swagger_url !== undefined) { updates.push('swagger_url = ?'); params.push(swagger_url); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_CHANGES', message: 'No fields to update' } });
    }

    params.push(id);
    db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logger.info({ id }, 'Service updated');
    res.json({ success: true, data: { id, message: 'Updated successfully' } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const id = req.params.id;

    const existing = db.prepare('SELECT name FROM services WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    logger.info({ id, name: existing.name }, 'Service deleted');
    res.json({ success: true, data: { message: 'Deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/readme', requireAuth, requireVaultMounted, async (req, res, next) => {
  try {
    const result = await generateServiceReadme(req.params.id);
    res.json({ success: result.success, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
