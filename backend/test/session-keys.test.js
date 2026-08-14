import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { setupTestDb, teardownTestDb } from './helpers/test-setup.js';
import { getDatabase } from '../db/connection.js';
import {
  putSessionKey,
  getSessionKey,
  clearSessionKey,
  sweepSessionKeys,
} from '../services/sessionKeys.js';

describe('sessionKeys: in-memory key holder', () => {
  let db;

  before(() => {
    db = setupTestDb();
  });

  after(() => {
    teardownTestDb();
  });

  it('stores, returns and clears keys', () => {
    const key = Buffer.alloc(32, 7);
    putSessionKey('sess-1', key);
    assert.equal(getSessionKey('sess-1'), key);
    assert.equal(getSessionKey('missing'), undefined);
    clearSessionKey('sess-1');
    assert.equal(getSessionKey('sess-1'), undefined);
  });

  it('sweeps keys for sessions that are no longer valid', () => {
    putSessionKey('keep', Buffer.alloc(32, 1));
    putSessionKey('gone', Buffer.alloc(32, 2));
    sweepSessionKeys(new Set(['keep']));
    assert.ok(getSessionKey('keep'));
    assert.equal(getSessionKey('gone'), undefined);
  });
});
