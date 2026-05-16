import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getDatabase } from '../db/connection.js';

/**
 * Extract YAML frontmatter and body from markdown content.
 * @param {string} content
 * @returns {{frontmatter: object|null, body: string}}
 */
export function parseSkillMarkdown(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content };
  }

  try {
    const frontmatter = yaml.load(match[1], { schema: yaml.CORE_SCHEMA });
    return { frontmatter, body: match[2].trim() };
  } catch (error) {
    logger.warn({ error }, 'Failed to parse YAML frontmatter');
    return { frontmatter: null, body: content };
  }
}

/**
 * Validate required frontmatter keys.
 * @param {object} frontmatter
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return { valid: false, missing: ['name', 'description'] };
  }

  const required = ['name', 'description'];
  const missing = required.filter(key => !frontmatter[key]);
  return { valid: missing.length === 0, missing };
}

/**
 * Recursively scan a directory for SKILL.md files.
 * @param {string} dir
 * @param {string} [baseDir]
 * @returns {{path: string, relativePath: string, content: string, frontmatter: object|null, body: string}[]}
 */
export function scanSkillsDirectory(dir, baseDir = dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      results.push(...scanSkillsDirectory(fullPath, baseDir));
    } else if (entry.name.toLowerCase() === 'skill.md') {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = parseSkillMarkdown(content);
        results.push({
          path: fullPath,
          relativePath,
          content,
          ...parsed,
        });
      } catch (error) {
        logger.error({ error, path: fullPath }, 'Failed to read SKILL.md');
      }
    }
  }

  return results;
}

/**
 * Scan vault skills directory and sync to database.
 * @returns {Promise<{scanned: number, added: number, updated: number, errors: number}>}
 */
export async function syncSkillsToDatabase() {
  const db = getDatabase();
  const skillsDir = path.join(config.luks.mountPoint, config.paths.skillsDir);

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
    return { scanned: 0, added: 0, updated: 0, errors: 0 };
  }

  const skills = scanSkillsDirectory(skillsDir, skillsDir);
  const existingPaths = db.prepare('SELECT path FROM skills').all().map(r => r.path);
  const scannedPaths = new Set();
  let added = 0;
  let updated = 0;
  let errors = 0;

  const insertStmt = db.prepare(`
    INSERT INTO skills (name, description, path, frontmatter, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE skills SET
      name = ?,
      description = ?,
      frontmatter = ?,
      metadata = ?
    WHERE path = ?
  `);

  for (const skill of skills) {
    scannedPaths.add(skill.path);
    const validation = validateFrontmatter(skill.frontmatter);

    const name = skill.frontmatter?.name || path.basename(path.dirname(skill.path));
    const description = skill.frontmatter?.description || '';
    const frontmatterJson = skill.frontmatter ? JSON.stringify(skill.frontmatter) : null;
    const metadataJson = skill.frontmatter?.openclaw
      ? JSON.stringify(skill.frontmatter.openclaw)
      : '{}';

    try {
      if (existingPaths.includes(skill.path)) {
        updateStmt.run(name, description, frontmatterJson, metadataJson, skill.path);
        updated++;
      } else {
        insertStmt.run(name, description, skill.path, frontmatterJson, metadataJson);
        added++;
      }
    } catch (error) {
      logger.error({ error, path: skill.path }, 'Failed to sync skill');
      errors++;
    }
  }

  logger.info({ scanned: skills.length, added, updated, errors }, 'Skills sync completed');
  return { scanned: skills.length, added, updated, errors };
}

/**
 * Install a skill to the OpenClaw skills path.
 * @param {number} skillId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function installSkill(skillId) {
  const db = getDatabase();
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId);

  if (!skill) {
    return { success: false, message: 'Skill not found' };
  }

  const openclawDir = path.join(process.env.HOME || '/root', '.openclaw', 'skills');
  if (!fs.existsSync(openclawDir)) {
    fs.mkdirSync(openclawDir, { recursive: true });
  }

  const targetPath = path.join(openclawDir, path.basename(path.dirname(skill.path)));

  try {
    // Create symlink
    fs.symlinkSync(skill.path, targetPath, 'file');
    db.prepare('UPDATE skills SET installed_at = CURRENT_TIMESTAMP WHERE id = ?').run(skillId);
    logger.info({ skillId, targetPath }, 'Skill installed');
    return { success: true, message: 'Skill installed successfully' };
  } catch (error) {
    // If symlink fails, try copy
    try {
      fs.copyFileSync(skill.path, targetPath);
      db.prepare('UPDATE skills SET installed_at = CURRENT_TIMESTAMP WHERE id = ?').run(skillId);
      logger.info({ skillId, targetPath }, 'Skill copied');
      return { success: true, message: 'Skill copied successfully' };
    } catch (copyError) {
      logger.error({ error: copyError }, 'Skill install failed');
      return { success: false, message: `Install failed: ${copyError.message}` };
    }
  }
}

/**
 * Uninstall a skill from the OpenClaw skills path.
 * @param {number} skillId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function uninstallSkill(skillId) {
  const db = getDatabase();
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(skillId);

  if (!skill) {
    return { success: false, message: 'Skill not found' };
  }

  const openclawDir = path.join(process.env.HOME || '/root', '.openclaw', 'skills');
  const targetPath = path.join(openclawDir, path.basename(path.dirname(skill.path)));

  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.lstatSync(targetPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(targetPath);
      } else {
        fs.unlinkSync(targetPath);
      }
    }

    db.prepare('UPDATE skills SET installed_at = NULL WHERE id = ?').run(skillId);
    logger.info({ skillId }, 'Skill uninstalled');
    return { success: true, message: 'Skill uninstalled successfully' };
  } catch (error) {
    logger.error({ error }, 'Skill uninstall failed');
    return { success: false, message: `Uninstall failed: ${error.message}` };
  }
}
