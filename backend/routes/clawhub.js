import { Router } from 'express';
import { spawn } from 'child_process';
import { requireAuth, requireVaultMounted } from '../middleware/auth.js';
import { syncSkillsToDatabase } from '../services/skillScanner.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

const CLAWHUB_REGISTRY = 'https://clawhub.ai';
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const VERSION_RE = /^[A-Za-z0-9.\-+]{1,32}$/;

router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ success: true, data: { results: [] } });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const url = `${CLAWHUB_REGISTRY}/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let upstream;
    try {
      upstream = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      return res.status(502).json({ success: false, error: { code: 'UPSTREAM_ERROR', message: `ClawHub returned ${upstream.status}` } });
    }
    const data = await upstream.json();
    res.json({ success: true, data });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ success: false, error: { code: 'UPSTREAM_TIMEOUT', message: 'ClawHub search timed out' } });
    }
    next(err);
  }
});

router.post('/install', requireAuth, requireVaultMounted, async (req, res, next) => {
  try {
    const { slug, version } = req.body || {};
    if (!slug || !SLUG_RE.test(slug)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SLUG', message: 'Slug missing or contains disallowed characters' } });
    }
    if (version && !VERSION_RE.test(version)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_VERSION', message: 'Version contains disallowed characters' } });
    }

    const args = [
      'install',
      '--workdir', config.luks.mountPoint,
      '--dir', config.paths.skillsDir,
      '--no-input',
      slug,
    ];
    if (version) args.push('--version', version);

    const result = await runClawhub(args);
    if (result.code !== 0) {
      logger.warn({ slug, code: result.code, stderr: result.stderr.slice(0, 500) }, 'ClawHub install failed');
      return res.status(502).json({
        success: false,
        error: { code: 'INSTALL_FAILED', message: result.stderr.trim() || result.stdout.trim() || 'Install failed' },
      });
    }

    const sync = await syncSkillsToDatabase();
    logger.info({ slug, sync }, 'ClawHub skill installed');
    res.json({ success: true, data: { slug, sync } });
  } catch (err) {
    next(err);
  }
});

function runClawhub(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('clawhub', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

export default router;
