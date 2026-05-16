import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { writeFile, readFile, exists } from '../services/fileManager.js';
import path from 'path';
import { config } from '../config/index.js';

const router = Router();

function redactValue(value) {
  if (!value || value.length <= 4) return '****';
  return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
}

function logActivity(action, targetId, details) {
  const db = getDatabase();
  db.prepare('INSERT INTO activity_log (action, target_type, target_id, details) VALUES (?, ?, ?, ?)')
    .run(action, 'env_var', targetId, JSON.stringify(details));
}

function syncEnvFile() {
  const db = getDatabase();
  const vars = db.prepare('SELECT name, value FROM env_vars ORDER BY name').all();
  const content = vars.map(v => `${v.name}=${v.value}`).join('\n') + '\n';
  const envPath = path.join(config.paths.envDir, '.env');
  try {
    writeFile(envPath, content);
  } catch (error) {
    logger.error({ error }, 'Failed to sync .env file');
  }
}

router.get('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { service, skill, search } = req.query;

    let sql = 'SELECT id, name, value, description, service_name, api_docs_url, skill_id, created_at, updated_at FROM env_vars WHERE 1=1';
    const params = [];

    if (service) {
      sql += ' AND service_name = ?';
      params.push(service);
    }
    if (skill) {
      sql += ' AND skill_id = ?';
      params.push(skill);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY name';

    const rows = db.prepare(sql).all(...params);

    // Redact values unless explicitly requested
    const reveal = req.query.reveal === 'true';
    const result = rows.map(row => ({
      ...row,
      value: reveal ? row.value : redactValue(row.value),
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM env_vars WHERE id = ?').get(req.params.id);

    if (!row) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variable not found' } });
    }

    const reveal = req.query.reveal === 'true';
    res.json({
      success: true,
      data: {
        ...row,
        value: reveal ? row.value : redactValue(row.value),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { name, value, description, service_name, api_docs_url, skill_id } = req.body;

    if (!name || value === undefined) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Name and value are required' } });
    }

    const nameRegex = /^[A-Z_][A-Z0-9_]*$/i;
    if (!nameRegex.test(name)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_NAME', message: 'Invalid environment variable name' } });
    }

    const existing = db.prepare('SELECT id FROM env_vars WHERE name = ?').get(name);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Variable '${name}' already exists` } });
    }

    const result = db.prepare(`
      INSERT INTO env_vars (name, value, description, service_name, api_docs_url, skill_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, value, description || null, service_name || null, api_docs_url || null, skill_id || null);

    syncEnvFile();
    logActivity('CREATE', result.lastInsertRowid, { name });
    logger.info({ name, id: result.lastInsertRowid }, 'Env var created');

    res.status(201).json({
      success: true,
      data: { id: result.lastInsertRowid, name, value: redactValue(value), description, service_name, api_docs_url, skill_id },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { name, value, description, service_name, api_docs_url, skill_id } = req.body;
    const id = req.params.id;

    const existing = db.prepare('SELECT id FROM env_vars WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variable not found' } });
    }

    if (name) {
      const nameRegex = /^[A-Z_][A-Z0-9_]*$/i;
      if (!nameRegex.test(name)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_NAME', message: 'Invalid environment variable name' } });
      }
      const conflict = db.prepare('SELECT id FROM env_vars WHERE name = ? AND id != ?').get(name, id);
      if (conflict) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Variable '${name}' already exists` } });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (value !== undefined) { updates.push('value = ?'); params.push(value); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (service_name !== undefined) { updates.push('service_name = ?'); params.push(service_name); }
    if (api_docs_url !== undefined) { updates.push('api_docs_url = ?'); params.push(api_docs_url); }
    if (skill_id !== undefined) { updates.push('skill_id = ?'); params.push(skill_id); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_CHANGES', message: 'No fields to update' } });
    }

    params.push(id);
    db.prepare(`UPDATE env_vars SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    syncEnvFile();
    logActivity('UPDATE', id, { name });
    logger.info({ id }, 'Env var updated');

    res.json({ success: true, data: { id, message: 'Updated successfully' } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const id = req.params.id;

    const existing = db.prepare('SELECT name FROM env_vars WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Variable not found' } });
    }

    db.prepare('DELETE FROM env_vars WHERE id = ?').run(id);
    syncEnvFile();
    logActivity('DELETE', id, { name: existing.name });
    logger.info({ id, name: existing.name }, 'Env var deleted');

    res.json({ success: true, data: { message: 'Deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-delete', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_IDS', message: 'Array of ids required' } });
    }

    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM env_vars WHERE id IN (${placeholders})`).run(...ids);
    syncEnvFile();
    logActivity('BULK_DELETE', null, { count: result.changes });
    logger.info({ count: result.changes }, 'Env vars bulk deleted');

    res.json({ success: true, data: { deleted: result.changes } });
  } catch (err) {
    next(err);
  }
});

router.post('/export', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getDatabase();
    const { ids, format = 'dotenv', service_name } = req.body;

    let sql = 'SELECT name, value, description FROM env_vars WHERE 1=1';
    const params = [];

    if (ids && ids.length > 0) {
      sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
    if (service_name) {
      sql += ' AND service_name = ?';
      params.push(service_name);
    }

    sql += ' ORDER BY name';
    const rows = db.prepare(sql).all(...params);

    let content;
    let filename;
    let contentType;

    if (format === 'json') {
      const obj = {};
      rows.forEach(r => { obj[r.name] = r.value; });
      content = JSON.stringify(obj, null, 2);
      filename = 'env-vars.json';
      contentType = 'application/json';
    } else {
      content = rows.map(r => `# ${r.description || r.name}\n${r.name}=${r.value}`).join('\n\n') + '\n';
      filename = '.env';
      contentType = 'text/plain';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(content);
  } catch (err) {
    next(err);
  }
});

export default router;
