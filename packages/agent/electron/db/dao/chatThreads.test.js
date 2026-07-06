'use strict';

/**
 * Chat Threads DAO contract tests.
 *
 * Covers: CRUD, upsert semantics, list ordering, boolean round-trip,
 * and sql.js persistence round-trip.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

let SQL = null;

async function getSql() {
  if (!SQL) {
    const mod = require('sql.js');
    const init = mod.default || mod;
    SQL = await init();
  }
  return SQL;
}

async function createFreshDb() {
  const sql = await getSql();
  const db = new sql.Database();
  const { runMigrations } = require('../migrations/v1_initial');
  const migResult = runMigrations(db, {});
  if (!migResult.ok) {
    db.close();
    throw new Error(`Migration failed: ${migResult.message}`);
  }
  return db;
}

const { listChatThreads, getChatThread, upsertChatThread, deleteChatThread } = require('./chatThreads');

// ---------------------------------------------------------------------------
// Basic CRUD
// ---------------------------------------------------------------------------

test('listChatThreads returns empty for fresh DB', async () => {
  const db = await createFreshDb();
  const list = listChatThreads(db);
  assert.deepEqual(list, []);
  db.close();
});

test('upsertChatThread creates new thread', async () => {
  const db = await createFreshDb();
  const result = upsertChatThread(db, {
    id: 't1',
    title: 'Test Chat',
    createdAt: 1000,
    updatedAt: 2000,
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    thinkingLevel: 'medium',
    webSearchEnabled: true,
    contextSummary: 'test summary',
  });
  assert.equal(result.ok, true);

  const thread = getChatThread(db, 't1');
  assert.notEqual(thread, null);
  assert.equal(thread.id, 't1');
  assert.equal(thread.title, 'Test Chat');
  assert.equal(thread.createdAt, 1000);
  assert.equal(thread.updatedAt, 2000);
  assert.equal(thread.provider, 'claude');
  assert.equal(thread.model, 'claude-sonnet-4-20250514');
  assert.equal(thread.thinkingLevel, 'medium');
  assert.equal(thread.webSearchEnabled, true);
  assert.equal(thread.contextSummary, 'test summary');
  db.close();
});

test('upsertChatThread returns error for missing id', async () => {
  const db = await createFreshDb();
  const result = upsertChatThread(db, { title: 'No ID' });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Missing'));
  db.close();
});

// ---------------------------------------------------------------------------
// Upsert semantics (update existing)
// ---------------------------------------------------------------------------

test('upsertChatThread updates existing thread by id', async () => {
  const db = await createFreshDb();

  // Create
  upsertChatThread(db, {
    id: 't2', title: 'Original', createdAt: 1000, updatedAt: 1000,
  });

  // Update
  upsertChatThread(db, {
    id: 't2', title: 'Renamed', createdAt: 1000, updatedAt: 3000,
    model: 'claude-opus-4-20250514', thinkingLevel: 'high',
    webSearchEnabled: false,
  });

  const thread = getChatThread(db, 't2');
  assert.equal(thread.title, 'Renamed');
  assert.equal(thread.updatedAt, 3000);
  assert.equal(thread.model, 'claude-opus-4-20250514');
  assert.equal(thread.thinkingLevel, 'high');
  assert.equal(thread.webSearchEnabled, false);
  // createdAt should NOT change on update (upsert only sets excluded.created_at,
  // but in ON CONFLICT we don't update created_at)
  assert.equal(thread.createdAt, 1000);
  db.close();
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test('deleteChatThread removes record', async () => {
  const db = await createFreshDb();

  upsertChatThread(db, { id: 't3', title: 'To Delete', createdAt: 1000, updatedAt: 1000 });
  assert.notEqual(getChatThread(db, 't3'), null);

  const result = deleteChatThread(db, 't3');
  assert.equal(result.ok, true);
  assert.equal(getChatThread(db, 't3'), null);
  db.close();
});

test('deleteChatThread is idempotent', async () => {
  const db = await createFreshDb();
  const result = deleteChatThread(db, 'nonexistent');
  assert.equal(result.ok, true);
  db.close();
});

// ---------------------------------------------------------------------------
// List ordering
// ---------------------------------------------------------------------------

test('listChatThreads returns newest first (by updatedAt DESC)', async () => {
  const db = await createFreshDb();

  upsertChatThread(db, { id: 'a', title: 'Oldest', updatedAt: 1000, createdAt: 1000 });
  upsertChatThread(db, { id: 'b', title: 'Middle', updatedAt: 2000, createdAt: 500 });
  upsertChatThread(db, { id: 'c', title: 'Newest', updatedAt: 3000, createdAt: 0 });

  const list = listChatThreads(db);
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 'c');
  assert.equal(list[1].id, 'b');
  assert.equal(list[2].id, 'a');
  db.close();
});

// ---------------------------------------------------------------------------
// Boolean round-trip
// ---------------------------------------------------------------------------

test('webSearchEnabled round-trips as boolean', async () => {
  const db = await createFreshDb();

  // true → stored as 1 → read as true
  upsertChatThread(db, { id: 'b1', webSearchEnabled: true, updatedAt: 1000, createdAt: 1000 });
  assert.equal(getChatThread(db, 'b1').webSearchEnabled, true);

  // false → stored as 0 → read as false
  upsertChatThread(db, { id: 'b2', webSearchEnabled: false, updatedAt: 1000, createdAt: 1000 });
  assert.equal(getChatThread(db, 'b2').webSearchEnabled, false);

  // default → stored as 0 → read as false
  upsertChatThread(db, { id: 'b3', updatedAt: 1000, createdAt: 1000 });
  assert.equal(getChatThread(db, 'b3').webSearchEnabled, false);
  db.close();
});

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

test('upsertChatThread applies defaults for missing fields', async () => {
  const db = await createFreshDb();

  upsertChatThread(db, { id: 'd1', createdAt: 1000, updatedAt: 1000 });

  const thread = getChatThread(db, 'd1');
  assert.equal(thread.title, '');
  assert.equal(thread.provider, 'claude');
  assert.equal(thread.model, '');
  assert.equal(thread.thinkingLevel, 'off');
  assert.equal(thread.webSearchEnabled, false);
  assert.equal(thread.contextSummary, '');
  db.close();
});

// ---------------------------------------------------------------------------
// Persistence round-trip (sql.js export/import)
// ---------------------------------------------------------------------------

test('data survives sql.js export/import round-trip', async () => {
  const sql = await getSql();

  // Create and write
  const db1 = new sql.Database();
  const { runMigrations } = require('../migrations/v1_initial');
  runMigrations(db1, {});
  upsertChatThread(db1, {
    id: 'p1', title: 'Persist Test', createdAt: 1000, updatedAt: 2000,
    provider: 'codex', model: 'gpt-4', thinkingLevel: 'low',
    webSearchEnabled: true, contextSummary: 'persist summary',
  });

  // Export → buffer → import
  const buffer = Buffer.from(db1.export());
  db1.close();

  const db2 = new sql.Database(buffer);
  const thread = getChatThread(db2, 'p1');
  assert.notEqual(thread, null);
  assert.equal(thread.id, 'p1');
  assert.equal(thread.title, 'Persist Test');
  assert.equal(thread.provider, 'codex');
  assert.equal(thread.model, 'gpt-4');
  assert.equal(thread.thinkingLevel, 'low');
  assert.equal(thread.webSearchEnabled, true);
  assert.equal(thread.contextSummary, 'persist summary');
  db2.close();
});
