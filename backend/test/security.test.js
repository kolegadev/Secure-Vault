import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { Writable } from 'stream';
import pino from 'pino';

/**
 * Verify that passwords passed via stdin to spawned processes never appear
 * in process listings (ps aux / /proc/<pid>/cmdline).
 */
describe('Security: password visibility in process listings', () => {
  it('password does not appear in /proc/<pid>/cmdline for stdin-based spawn', async () => {
    const uniquePassword = 'TEST_PASSWORD_7f3a9b2e';

    // Spawn a long-running Node process that reads from stdin
    const child = spawn('node', ['-e', 'process.stdin.on("data", () => {}); setTimeout(() => {}, 3000);']);

    // Write the password to stdin (never as CLI arg)
    child.stdin.write(uniquePassword + '\n');
    child.stdin.end();

    // Wait a tick for the process to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const cmdline = readFileSync(`/proc/${child.pid}/cmdline`, 'utf-8');
      assert.ok(
        !cmdline.includes(uniquePassword),
        `Password was found in /proc/${child.pid}/cmdline — ${cmdline}`
      );
    } finally {
      child.kill();
    }
  });

  it('password does not appear in ps output for stdin-based spawn', async () => {
    const uniquePassword = 'PS_TEST_PW_9c4d1e8a';

    const child = spawn('node', ['-e', 'process.stdin.on("data", () => {}); setTimeout(() => {}, 3000);']);
    child.stdin.write(uniquePassword + '\n');
    child.stdin.end();

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const ps = spawn('ps', ['-p', String(child.pid), '-o', 'args=']);
      let stdout = '';
      ps.stdout.on('data', (d) => { stdout += d.toString(); });

      await new Promise((resolve, reject) => {
        ps.on('close', (code) => {
          if (code !== 0) reject(new Error('ps failed'));
          else resolve();
        });
      });

      assert.ok(
        !stdout.includes(uniquePassword),
        `Password was found in ps output — ${stdout}`
      );
    } finally {
      child.kill();
    }
  });
});

describe('Security: logger redaction', () => {
  it('pino redacts password fields in log objects', async () => {
    const logs = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    });

    const logger = pino({
      level: 'info',
      redact: {
        paths: ['password', 'passphrase', 'secret', '*.password'],
        censor: '[REDACTED]',
      },
    }, stream);

    logger.info({ username: 'alice', password: 'super-secret', nested: { password: 'nested-secret' } });

    // Wait a tick for the log to be written
    await new Promise((resolve) => setTimeout(resolve, 50));

    const output = logs.join('');
    assert.ok(output.includes('[REDACTED]'), 'Logger should censor redacted fields');
    assert.ok(!output.includes('super-secret'), 'Plain password should not appear in logs');
    assert.ok(!output.includes('nested-secret'), 'Nested password should not appear in logs');
    assert.ok(output.includes('alice'), 'Non-sensitive fields should remain visible');
  });
});
