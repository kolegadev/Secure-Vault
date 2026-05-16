import { Router } from 'express';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { getVaultDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { generateServiceReadme } from '../services/readmeGenerator.js';

const router = Router();

/**
 * Validates and sanitizes service name input
 * @param {string} name - The service name to validate
 * @returns {object} { isValid: boolean, sanitizedName?: string, error?: string }
 */
function validateServiceName(name) {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Service name is required and must be a string' };
  }

  // Trim whitespace
  const trimmed = name.trim();
  
  // Check length constraints (1-64 characters)
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Service name cannot be empty' };
  }
  if (trimmed.length > 64) {
    return { isValid: false, error: 'Service name cannot exceed 64 characters' };
  }

  // Allow only alphanumeric characters, hyphens, underscores, and dots
  // Must start and end with alphanumeric character
  const nameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
  if (!nameRegex.test(trimmed)) {
    return { 
      isValid: false, 
      error: 'Service name must contain only letters, numbers, dots, hyphens, and underscores. Must start and end with alphanumeric characters' 
    };
  }

  // Prevent reserved names and potentially dangerous patterns
  const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
  if (reservedNames.includes(trimmed.toLowerCase())) {
    return { isValid: false, error: 'Service name cannot be a reserved system name' };
  }

  // Prevent consecutive special characters
  if (/[._-]{2,}/.test(trimmed)) {
    return { isValid: false, error: 'Service name cannot contain consecutive dots, hyphens, or underscores' };
  }

  return { isValid: true, sanitizedName: trimmed };
}

router.get('/', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getVaultDatabase();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Vault database is not available' } });
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
    const db = getVaultDatabase();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Vault database is not available' } });
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
    const db = getVaultDatabase();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Vault database is not available' } });
    const { name, description, swagger_url } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_NAME', message: 'Service name is required' } });
    }

    // Validate and sanitize service name
    const validation = validateServiceName(name);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_NAME', message: validation.error } });
    }

    const sanitizedName = validation.sanitizedName;

    const existing = db.prepare('SELECT id FROM services WHERE name = ?').get(sanitizedName);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Service '${sanitizedName}' already exists` } });
    }

    const result = db.prepare(`
      INSERT INTO services (name, description, swagger_url)
      VALUES (?, ?, ?)
    `).run(sanitizedName, description || null, swagger_url || null);

    logger.info({ id: result.lastInsertRowid, name: sanitizedName }, 'Service created');
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid, name: sanitizedName, description, swagger_url } });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, requireVaultMounted, (req, res, next) => {
  try {
    const db = getVaultDatabase();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Vault database is not available' } });
    const { name, description, swagger_url } = req.body;
    const id = req.params.id;

    const existing = db.prepare('SELECT id FROM services WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    let sanitizedName = name;
    if (name !== undefined) {
      // Validate and sanitize service name if it's being updated
      const validation = validateServiceName(name);
      if (!validation.isValid) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_NAME', message: validation.error } });
      }
      sanitizedName = validation.sanitizedName;

      const conflict = db.prepare('SELECT id FROM services WHERE name = ? AND id != ?').get(sanitizedName, id);
      if (conflict) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Service '${sanitizedName}' already exists` } });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(sanitizedName); }
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
    const db = getVaultDatabase();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Vault database is not available' } });
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
