import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { setupTestDb, teardownTestDb } from './helpers/test-setup.js';
import { getDatabase } from '../db/connection.js';
import {
  deriveKey,
  newSalt,
  encryptValue,
  decryptValue,
  isEncrypted,
  migratePlaintextValues,
  getOrCreateSalt,
} from '../services/crypto.js';

const PW = 'correct-horse-battery-staple';

describe('crypto: field encryption service', () => {
  let db;
  let salt;
  let key;

  before(() => {
    db = setupTestDb();
    salt = newSalt();
    key = deriveKey(PW, salt);
  });

  after(() => {
    teardownTestDb();
  });

  it('round-trips a value', () => {
    const enc = encryptValue('sk-secret-123', key);
    assert.ok(isEncrypted(enc));
    assert.equal(enc.slice(0, 7), 'enc:v1:');
    assert.equal(decryptValue(enc, key), 'sk-secret-123');
  });

  it('produces unique ciphertexts for the same plaintext', () => {
    const a = encryptValue('same', key);
    const b = encryptValue('same', key);
    assert.notEqual(a, b);
    assert.equal(decryptValue(a, key), 'same');
    assert.equal(decryptValue(b, key), 'same');
  });

  it('fails to decrypt with the wrong key', () => {
    const enc = encryptValue('top-secret', key);
    const wrong = deriveKey('wrong-password', salt);
    assert.equal(decryptValue(enc, wrong), null);
  });

  it('fails to decrypt across different salts', () => {
    const enc = encryptValue('top-secret', key);
    const otherKey = deriveKey(PW, newSalt());
    assert.equal(decryptValue(enc, otherKey), null);
  });

  it('returns null for non-encrypted (legacy plaintext) values', () => {
    assert.equal(decryptValue('plaintext-value', key), null);
    assert.equal(isEncrypted('plaintext-value'), false);
  });

  it('migrates plaintext rows and leaves encrypted rows untouched', () => {
    db.prepare("INSERT INTO env_vars (name, value) VALUES ('A', 'legacy-plain')").run();
    db.prepare("INSERT INTO env_vars (name, value) VALUES ('B', ?)")
      .run(encryptValue('already-encrypted', key));

    const migrated = migratePlaintextValues(db, key);
    assert.equal(migrated, 1);

    const a = db.prepare("SELECT value FROM env_vars WHERE name = 'A'").get();
    const b = db.prepare("SELECT value FROM env_vars WHERE name = 'B'").get();
    assert.ok(isEncrypted(a.value));
    assert.equal(decryptValue(a.value, key), 'legacy-plain');
    assert.equal(decryptValue(b.value, key), 'already-encrypted');

    // Idempotent: a second run migrates nothing.
    assert.equal(migratePlaintextValues(db, key), 0);
  });

  it('stores and reuses the per-install salt', () => {
    const s1 = getOrCreateSalt(db);
    const s2 = getOrCreateSalt(db);
    assert.equal(s1, s2);
    const row = db.prepare("SELECT value FROM settings WHERE key = 'crypto_salt'").get();
    assert.equal(row.value, s1);
  });
});
