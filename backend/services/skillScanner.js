import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
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
    const frontmatter = YAML.parse(match[1]);
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
 * Extract the list of required env-var names from a skill's frontmatter.
 * Handles `frontmatter.requires.env`, `frontmatter.openclaw.requires.env`,
 * and `frontmatter.metadata.openclaw.requires.env`.
 * @param {object|null} fm
 * @returns {string[]}
 */
function extractRequiredEnvVars(fm) {
  if (!fm || typeof fm !== 'object') return [];
  const namespaces = [
    fm.openclaw,
    fm.clawdbot,
    fm.metadata?.openclaw,
    fm.metadata?.clawdbot,
  ].filter(Boolean);
  const requires = fm.requires || namespaces.map(n => n.requires).find(Boolean) || {};
  return Array.isArray(requires.env) ? requires.env.filter(v => typeof v === 'string' && v.length > 0) : [];
}

/**
 * Derive a service slug from an env-var name. Takes the first underscore-delimited
 * segment, lowercased — e.g. `XAI_API_KEY` → `xai`, `AWS_ACCESS_KEY_ID` → `aws`.
 * Returns null if the name doesn't yield a valid slug.
 * @param {string} envName
 * @returns {string|null}
 */
function deriveServiceName(envName) {
  if (!envName || typeof envName !== 'string') return null;
  const head = envName.split('_')[0].toLowerCase();
  return /^[a-z0-9]+$/.test(head) ? head : null;
}

/**
 * After a skill is synced, auto-create the Service and stub env-var rows
 * implied by its frontmatter. Idempotent — uses INSERT OR IGNORE so existing
 * user data is never overwritten.
 * @param {import('better-sqlite3').Database} db
 * @param {number} skillId
 * @param {string} skillName
 * @param {object|null} frontmatter
 */
function autoLinkServicesAndEnvVars(db, skillId, skillName, frontmatter) {
  const envNames = extractRequiredEnvVars(frontmatter);
  if (envNames.length === 0) return;

  const swaggerUrl = frontmatter?.homepage || null;
  const description = frontmatter?.description || `Auto-created from skill: ${skillName}`;

  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (name, description, swagger_url) VALUES (?, ?, ?)
  `);
  const insertEnvVar = db.prepare(`
    INSERT OR IGNORE INTO env_vars (name, value, description, service_name, skill_id)
    VALUES (?, '', ?, ?, ?)
  `);

  for (const envName of envNames) {
    const service = deriveServiceName(envName);
    if (!service) continue;
    insertService.run(service, description, swaggerUrl);
    insertEnvVar.run(envName, `Required by skill: ${skillName}`, service, skillId);
  }
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
      let skillId;
      if (existingPaths.includes(skill.path)) {
        updateStmt.run(name, description, frontmatterJson, metadataJson, skill.path);
        updated++;
        skillId = db.prepare('SELECT id FROM skills WHERE path = ?').get(skill.path)?.id;
      } else {
        const result = insertStmt.run(name, description, skill.path, frontmatterJson, metadataJson);
        skillId = result.lastInsertRowid;
        added++;
      }
      if (skillId) {
        autoLinkServicesAndEnvVars(db, skillId, name, skill.frontmatter);
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

  // Validate that the skill path is within the expected skills directory
  const skillsDir = path.resolve(path.join(config.luks.mountPoint, config.paths.skillsDir));
  const resolvedSkillPath = path.resolve(skill.path);
  
  if (!resolvedSkillPath.startsWith(skillsDir + path.sep) && resolvedSkillPath !== skillsDir) {
    logger.error({ skillPath: skill.path, skillsDir }, 'Skill path is outside of allowed directory');
    return { success: false, message: 'Invalid skill path: outside of allowed directory' };
  }

  // Ensure the skill file exists and is a regular file
  try {
    const stat = fs.lstatSync(resolvedSkillPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { success: false, message: 'Invalid skill: not a regular file' };
    }
  } catch (error) {
    return { success: false, message: 'Skill file not found or inaccessible' };
  }

  const openclawDir = path.join(process.env.HOME || '/root', '.openclaw', 'skills');
  if (!fs.existsSync(openclawDir)) {
    fs.mkdirSync(openclawDir, { recursive: true });
  }

  const targetPath = path.join(openclawDir, path.basename(path.dirname(resolvedSkillPath)));

  try {
    // Use hard copy instead of symlink for better security isolation
    fs.copyFileSync(resolvedSkillPath, targetPath);
    db.prepare('UPDATE skills SET installed_at = CURRENT_TIMESTAMP WHERE id = ?').run(skillId);
    logger.info({ skillId, targetPath }, 'Skill installed');
    return { success: true, message: 'Skill installed successfully' };
  } catch (error) {
    logger.error({ error }, 'Skill install failed');
    return { success: false, message: `Install failed: ${error.message}` };
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

  // Validate that the skill path is within the expected skills directory
  const skillsDir = path.resolve(path.join(config.luks.mountPoint, config.paths.skillsDir));
  const resolvedSkillPath = path.resolve(skill.path);
  
  if (!resolvedSkillPath.startsWith(skillsDir + path.sep) && resolvedSkillPath !== skillsDir) {
    logger.error({ skillPath: skill.path, skillsDir }, 'Skill path is outside of allowed directory');
    return { success: false, message: 'Invalid skill path: outside of allowed directory' };
  }

  const openclawDir = path.join(process.env.HOME || '/root', '.openclaw', 'skills');
  const targetPath = path.join(openclawDir, path.basename(path.dirname(resolvedSkillPath)));

  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    db.prepare('UPDATE skills SET installed_at = NULL WHERE id = ?').run(skillId);
    logger.info({ skillId }, 'Skill uninstalled');
    return { success: true, message: 'Skill uninstalled successfully' };
  } catch (error) {
    logger.error({ error }, 'Skill uninstall failed');
    return { success: false, message: `Uninstall failed: ${error.message}` };
  }
}
