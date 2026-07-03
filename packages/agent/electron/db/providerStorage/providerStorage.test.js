'use strict';

/**
 * Provider Repository tests.
 *
 * Covers: CRUD, shape conversion, legacy migration, projection,
 * reorder, and sql.js persistence round-trip.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
  const migResult = runMigrations(db);
  if (!migResult.ok) {
    db.close();
    throw new Error(`Migration failed in createFreshDb: ${migResult.message}`);
  }
  return db;
}

// ---------------------------------------------------------------------------
// A. Shape conversion
// ---------------------------------------------------------------------------

test('daoToLegacyProvider converts CodeX row to legacy shape', () => {
  const { daoToLegacyProvider } = require('./index');
  const row = {
    agentType: 'codex',
    name: 'TestCodeX',
    config: {
      key: 'sk-test',
      url: 'https://api.openai.com',
      model: 'gpt-4',
      reasoningEffort: 'medium',
      apiFormat: 'responses',
      authJson: { OPENAI_API_KEY: 'sk-test' },
      tomlText: '[provider]\nkey="sk-test"',
      alternativeModels: ['gpt-3.5-turbo'],
    },
    metadata: {},
    isActive: false,
  };

  const legacy = daoToLegacyProvider(row);
  assert.equal(legacy.name, 'TestCodeX');
  assert.equal(legacy.key, 'sk-test');
  assert.equal(legacy.url, 'https://api.openai.com');
  assert.equal(legacy.model, 'gpt-4');
  assert.equal(legacy.reasoningEffort, 'medium');
  assert.equal(legacy.apiFormat, 'responses');
  assert.deepEqual(legacy.alternativeModels, ['gpt-3.5-turbo']);
});

test('daoToLegacyProvider converts Claude row to legacy shape', () => {
  const { daoToLegacyProvider } = require('./index');
  const row = {
    agentType: 'claude',
    name: 'TestClaude',
    config: {
      key: 'sk-ant-test',
      url: 'https://api.anthropic.com',
      env: {
        ANTHROPIC_AUTH_TOKEN: 'sk-ant-test',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      },
    },
    metadata: {
      tierModels: { haiku: '', sonnet: 'claude-sonnet-4-20250514', opus: '', reasoning: '' },
    },
    isActive: true,
  };

  const legacy = daoToLegacyProvider(row);
  assert.equal(legacy.name, 'TestClaude');
  assert.equal(legacy.key, 'sk-ant-test');
  assert.equal(legacy.config.env.ANTHROPIC_AUTH_TOKEN, 'sk-ant-test');
  assert.equal(legacy.tierModels.sonnet, 'claude-sonnet-4-20250514');
});

test('Claude key/url survives legacyToDaoProvider → daoToLegacyProvider round-trip', () => {
  const { legacyToDaoProvider, daoToLegacyProvider } = require('./index');
  const legacy = {
    name: 'ClaudeRoundtrip',
    key: 'sk-ant-roundtrip',
    url: 'https://api.anthropic.com/v1',
    config: { env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-roundtrip' } },
    tierModels: { haiku: '', sonnet: '', opus: '', reasoning: '' },
    selectedTier: 'sonnet',
  };

  const dao = legacyToDaoProvider(legacy, 'claude');
  const result = daoToLegacyProvider({ ...dao, agentType: 'claude', metadata: dao.metadata || {} });

  assert.equal(result.name, 'ClaudeRoundtrip');
  assert.equal(result.key, 'sk-ant-roundtrip', 'key should survive round-trip');
  assert.equal(result.url, 'https://api.anthropic.com/v1', 'url should survive round-trip');
  assert.equal(result.config.env.ANTHROPIC_AUTH_TOKEN, 'sk-ant-roundtrip');
});

test('legacyToDaoProvider converts CodeX legacy to DAO shape', () => {
  const { legacyToDaoProvider } = require('./index');
  const legacy = {
    name: 'CodeX',
    key: 'sk-key',
    url: 'https://api.example.com',
    model: 'gpt-4',
    reasoningEffort: 'high',
    apiFormat: 'chat',
    authJson: {},
    tomlText: '',
    alternativeModels: [],
  };

  const dao = legacyToDaoProvider(legacy, 'codex');
  assert.equal(dao.name, 'CodeX');
  assert.equal(dao.config.key, 'sk-key');
  assert.equal(dao.config.model, 'gpt-4');
  assert.equal(dao.config.apiFormat, 'chat');
});

test('legacyToDaoProvider converts Claude legacy to DAO shape', () => {
  const { legacyToDaoProvider } = require('./index');
  const legacy = {
    name: 'Claude',
    key: 'sk-ant-key',
    url: 'https://api.anthropic.com',
    config: { env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-key' } },
    tierModels: { haiku: '', sonnet: 'claude-sonnet-4-20250514', opus: '', reasoning: '' },
  };

  const dao = legacyToDaoProvider(legacy, 'claude');
  assert.equal(dao.name, 'Claude');
  assert.equal(dao.config.env.ANTHROPIC_AUTH_TOKEN, 'sk-ant-key');
  assert.equal(dao.metadata.tierModels.sonnet, 'claude-sonnet-4-20250514');
});

test('daoListToLegacyPayload handles empty list', () => {
  const { daoListToLegacyPayload } = require('./index');
  const payload = daoListToLegacyPayload([]);
  assert.deepEqual(payload.providers, []);
  assert.equal(payload.activeIdx, -1);
});

test('daoListToLegacyPayload computes activeIdx from isActive flag', () => {
  const { daoListToLegacyPayload } = require('./index');
  const rows = [
    { agentType: 'codex', name: 'A', config: {}, metadata: {}, isActive: false },
    { agentType: 'codex', name: 'B', config: {}, metadata: {}, isActive: true },
    { agentType: 'codex', name: 'C', config: {}, metadata: {}, isActive: false },
  ];

  const payload = daoListToLegacyPayload(rows);
  assert.equal(payload.activeIdx, 1);
  assert.equal(payload.providers.length, 3);
});

test('daoListToLegacyPayload returns activeIdx -1 when no provider is active', () => {
  const { daoListToLegacyPayload } = require('./index');
  const rows = [
    { agentType: 'codex', name: 'A', config: {}, metadata: {}, isActive: false },
    { agentType: 'codex', name: 'B', config: {}, metadata: {}, isActive: false },
  ];

  const payload = daoListToLegacyPayload(rows);
  assert.equal(payload.activeIdx, -1, 'should return -1 when no provider is active');
  assert.equal(payload.providers.length, 2);
});

// ---------------------------------------------------------------------------
// B. Repository CRUD
// ---------------------------------------------------------------------------

test('getProviders returns legacy-shaped payload from SQLite', async () => {
  const db = await createFreshDb();
  const { setProviders, getProviders } = require('./index');

  setProviders(db, 'codex', {
    providers: [
      { name: 'P1', key: 'sk-1', url: 'https://a.com', model: 'gpt-4' },
      { name: 'P2', key: 'sk-2', url: 'https://b.com', model: 'gpt-3.5' },
    ],
    activeIdx: 0,
  });

  const payload = getProviders(db, 'codex');
  assert.equal(payload.providers.length, 2);
  assert.equal(payload.providers[0].name, 'P1');
  assert.equal(payload.providers[0].key, 'sk-1');
  assert.equal(payload.activeIdx, 0);

  db.close();
});

test('setProviders marks projection_status as pending', async () => {
  const db = await createFreshDb();
  const { setProviders } = require('./index');
  const { getProvider } = require('../dao/providers');

  const result = setProviders(db, 'codex', {
    providers: [{ name: 'T', key: 'sk', url: 'https://x.com' }],
    activeIdx: 0,
  });

  assert.equal(result.ok, true);
  const p = getProvider(db, result.ids[0]);
  assert.equal(p.projectionStatus, 'pending');

  db.close();
});

test('setProviders → getProviders → setProviders is idempotent (no duplicates)', async () => {
  const db = await createFreshDb();
  const { setProviders, getProviders } = require('./index');

  // Round 1
  setProviders(db, 'codex', {
    providers: [
      { name: 'DupTest', key: 'sk-dup', url: 'https://dup.com', model: 'gpt-4' },
    ],
    activeIdx: 0,
  });

  // Round 2: get → set same payload back
  const payload = getProviders(db, 'codex');
  assert.equal(payload.providers.length, 1, 'should have 1 provider');
  assert.ok(payload.providers[0].id, 'provider should have an id');

  setProviders(db, 'codex', payload);

  // Verify
  const final = getProviders(db, 'codex');
  assert.equal(final.providers.length, 1, 'should still have exactly 1 provider (no duplicates)');
  assert.equal(final.providers[0].name, 'DupTest');
  assert.equal(final.providers[0].id, payload.providers[0].id, 'id should be stable');

  db.close();
});

test('setProviders deletes DB providers not in incoming list', async () => {
  const db = await createFreshDb();
  const { setProviders, getProviders } = require('./index');

  // Insert 3
  setProviders(db, 'codex', {
    providers: [
      { name: 'Keep1', key: 'sk-1', url: '' },
      { name: 'Keep2', key: 'sk-2', url: '' },
      { name: 'RemoveMe', key: 'sk-3', url: '' },
    ],
    activeIdx: 0,
  });

  // Replace with 2 (RemoveMe gone)
  const payload = getProviders(db, 'codex');
  const keepTwo = payload.providers.filter((p) => p.name !== 'RemoveMe');
  const result = setProviders(db, 'codex', { providers: keepTwo, activeIdx: 0 });

  assert.equal(result.deleted, 1, 'should have deleted 1 stale provider');

  const final = getProviders(db, 'codex');
  assert.equal(final.providers.length, 2);
  assert.ok(final.providers.every((p) => p.name !== 'RemoveMe'));

  db.close();
});

test('setActiveProvider switches active provider', async () => {
  const db = await createFreshDb();
  const { setProviders, setActiveProvider, getProviders } = require('./index');

  setProviders(db, 'codex', {
    providers: [
      { name: 'A', key: 'sk-a', url: '' },
      { name: 'B', key: 'sk-b', url: '' },
    ],
    activeIdx: 0,
  });

  // Switch to B
  const payload = getProviders(db, 'codex');
  const bId = payload.providers[1].id || null;
  // Need to get ID from DAO
  const { listProviders } = require('../dao/providers');
  const rows = listProviders(db, 'codex');
  setActiveProvider(db, 'codex', rows[1].id);

  const updated = getProviders(db, 'codex');
  assert.equal(updated.activeIdx, 1);

  db.close();
});

test('deleteProvider removes from DB', async () => {
  const db = await createFreshDb();
  const { setProviders, deleteProvider, getProviders } = require('./index');
  const { listProviders } = require('../dao/providers');

  setProviders(db, 'codex', {
    providers: [{ name: 'ToDelete', key: 'sk', url: '' }],
    activeIdx: 0,
  });

  const rows = listProviders(db, 'codex');
  deleteProvider(db, rows[0].id);

  const after = getProviders(db, 'codex');
  assert.equal(after.providers.length, 0);

  db.close();
});

test('reorderProviders changes order in getProviders', async () => {
  const db = await createFreshDb();
  const { setProviders, reorderProviders, getProviders } = require('./index');
  const { listProviders } = require('../dao/providers');

  setProviders(db, 'codex', {
    providers: [
      { name: 'Z', key: 'sk-z', url: '' },
      { name: 'A', key: 'sk-a', url: '' },
      { name: 'M', key: 'sk-m', url: '' },
    ],
    activeIdx: 0,
  });

  const rows = listProviders(db, 'codex');
  const ids = rows.map((r) => r.id);
  reorderProviders(db, 'codex', [ids[1], ids[2], ids[0]]); // A, M, Z

  const payload = getProviders(db, 'codex');
  assert.equal(payload.providers[0].name, 'A');
  assert.equal(payload.providers[1].name, 'M');
  assert.equal(payload.providers[2].name, 'Z');

  db.close();
});

// ---------------------------------------------------------------------------
// C. Legacy migration
// ---------------------------------------------------------------------------

test('migrateFromLegacy backfills empty DB from legacy data', async () => {
  const db = await createFreshDb();
  const { migrateFromLegacy, getProviders } = require('./index');

  const legacyData = {
    providers: [
      { name: 'Legacy1', key: 'sk-legacy-1', url: 'https://legacy.com', model: 'gpt-4' },
      { name: 'Legacy2', key: 'sk-legacy-2', url: 'https://legacy2.com', model: 'gpt-3.5' },
    ],
    activeIdx: 1,
  };

  const result = migrateFromLegacy(db, 'codex', () => legacyData);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, 2);

  const payload = getProviders(db, 'codex');
  assert.equal(payload.providers.length, 2);
  assert.equal(payload.providers[0].name, 'Legacy1');
  assert.equal(payload.providers[1].name, 'Legacy2');
  assert.equal(payload.activeIdx, 1);

  db.close();
});

test('migrateFromLegacy skips when DB already has providers', async () => {
  const db = await createFreshDb();
  const { setProviders, migrateFromLegacy, getProviders } = require('./index');

  setProviders(db, 'codex', {
    providers: [{ name: 'Existing', key: 'sk', url: '' }],
    activeIdx: 0,
  });

  const result = migrateFromLegacy(db, 'codex', () => ({
    providers: [{ name: 'ShouldNotImport', key: 'x', url: '' }],
    activeIdx: 0,
  }));

  assert.equal(result.ok, true);
  assert.equal(result.migrated, 0);

  const payload = getProviders(db, 'codex');
  assert.equal(payload.providers.length, 1);
  assert.equal(payload.providers[0].name, 'Existing');

  db.close();
});

test('migrateFromLegacy handles empty legacy data gracefully', async () => {
  const db = await createFreshDb();
  const { migrateFromLegacy } = require('./index');

  const result = migrateFromLegacy(db, 'codex', () => null);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, 0);

  db.close();
});

// ---------------------------------------------------------------------------
// D. Projection
// ---------------------------------------------------------------------------

test('projectToLegacy writes pending providers to legacy store', async () => {
  const db = await createFreshDb();
  const { setProviders, projectToLegacy } = require('./index');
  const { listProvidersByStatus } = require('../dao/providers');

  setProviders(db, 'codex', {
    providers: [{ name: 'P', key: 'sk', url: '' }],
    activeIdx: 0,
  });

  let writtenPayload = null;
  const result = projectToLegacy(db, 'codex', (payload) => {
    writtenPayload = payload;
  });

  assert.equal(result.ok, true);
  assert.equal(result.synced, 1);
  assert.ok(writtenPayload, 'legacyWriteFn should have been called');
  assert.equal(writtenPayload.providers.length, 1);
  assert.equal(writtenPayload.providers[0].name, 'P');

  // Verify status is now synced
  const pending = listProvidersByStatus(db, 'codex', 'pending');
  assert.equal(pending.length, 0);

  db.close();
});

test('projectToLegacy marks providers as failed on write error', async () => {
  const db = await createFreshDb();
  const { setProviders, projectToLegacy } = require('./index');
  const { listProvidersByStatus } = require('../dao/providers');

  setProviders(db, 'codex', {
    providers: [{ name: 'P', key: 'sk', url: '' }],
    activeIdx: 0,
  });

  const result = projectToLegacy(db, 'codex', () => {
    throw new Error('Legacy write failed');
  });

  assert.equal(result.ok, false);
  assert.equal(result.failed, 1);
  assert.ok(result.errors.some((e) => e.includes('Legacy write failed')));

  const failed = listProvidersByStatus(db, 'codex', 'failed');
  assert.equal(failed.length, 1);

  db.close();
});

test('projectToLegacy retries failed projections when retryFailed=true', async () => {
  const db = await createFreshDb();
  const { setProviders, projectToLegacy } = require('./index');
  const { setProjectionStatus, listProvidersByStatus } = require('../dao/providers');

  setProviders(db, 'codex', {
    providers: [{ name: 'R', key: 'sk', url: '' }],
    activeIdx: 0,
  });

  // Manually set one to failed
  const pending = listProvidersByStatus(db, 'codex', 'pending');
  setProjectionStatus(db, pending[0].id, 'failed');

  let callCount = 0;
  const result = projectToLegacy(db, 'codex', () => { callCount++; }, { retryFailed: true });

  assert.equal(result.ok, true);
  assert.equal(result.synced, 1);
  assert.equal(callCount, 1);

  db.close();
});

// ---------------------------------------------------------------------------
// E. Persistence round-trip (sql.js persist + reopen)
// ---------------------------------------------------------------------------

test('write -> persist -> reopen -> data survives', async () => {
  const sql = await getSql();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-ps-test-'));
  const dbPath = path.join(tmpDir, 'mindcraft.db');

  // Create DB, write providers, persist
  const db1 = new sql.Database();
  const { runMigrations } = require('../migrations/v1_initial');
  const migResult = runMigrations(db1);
  if (!migResult.ok) throw new Error(`Migration failed: ${migResult.message}`);

  const { setProviders, getProviders } = require('./index');
  setProviders(db1, 'codex', {
    providers: [
      { name: 'Persist1', key: 'sk-p1', url: 'https://p1.com', model: 'gpt-4' },
      { name: 'Persist2', key: 'sk-p2', url: 'https://p2.com', model: 'gpt-3.5' },
    ],
    activeIdx: 1,
  });

  const db1Payload = getProviders(db1, 'codex');
  assert.equal(db1Payload.providers.length, 2);

  // Persist to file
  const buffer = Buffer.from(db1.export());
  fs.writeFileSync(dbPath, buffer);
  db1.close();

  // Reopen and verify
  const fileBuffer = fs.readFileSync(dbPath);
  const db2 = new sql.Database(fileBuffer);

  const db2Payload = getProviders(db2, 'codex');
  assert.equal(db2Payload.providers.length, 2);
  assert.equal(db2Payload.providers[0].name, 'Persist1');
  assert.equal(db2Payload.providers[1].name, 'Persist2');
  assert.equal(db2Payload.activeIdx, 1);

  // Verify keys survived
  assert.equal(db2Payload.providers[0].key, 'sk-p1');

  db2.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('migrateFromLegacy data survives persist + reopen', async () => {
  const sql = await getSql();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-ps-mig-'));
  const dbPath = path.join(tmpDir, 'mindcraft.db');

  const db1 = new sql.Database();
  const { runMigrations } = require('../migrations/v1_initial');
  const migResult2 = runMigrations(db1);
  if (!migResult2.ok) throw new Error(`Migration failed: ${migResult2.message}`);

  const { migrateFromLegacy, getProviders } = require('./index');
  const legacyData = {
    providers: [
      { name: 'Migrated1', key: 'sk-m1', url: 'https://m1.com', model: 'gpt-4' },
    ],
    activeIdx: 0,
  };

  migrateFromLegacy(db1, 'codex', () => legacyData);

  // Persist
  const buffer = Buffer.from(db1.export());
  fs.writeFileSync(dbPath, buffer);
  db1.close();

  // Reopen
  const fileBuffer = fs.readFileSync(dbPath);
  const db2 = new sql.Database(fileBuffer);

  const payload = getProviders(db2, 'codex');
  assert.equal(payload.providers.length, 1);
  assert.equal(payload.providers[0].name, 'Migrated1');
  assert.equal(payload.providers[0].key, 'sk-m1');

  db2.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// F. Claude-specific tests (T174 vertical slice)
// ---------------------------------------------------------------------------

test('Claude full shape round-trip preserves all fields (language, permissionPolicy, effortLevel, website, note)', () => {
  const { legacyToDaoProvider, daoToLegacyProvider } = require('./index');
  const legacy = {
    name: 'FullClaude',
    key: 'sk-ant-full',
    url: 'https://api.anthropic.com',
    website: 'https://docs.anthropic.com',
    note: 'Production account',
    language: 'en',
    permissionPolicy: 'allow',
    effortLevel: 'high',
    config: {
      env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-full', ANTHROPIC_BASE_URL: 'https://api.anthropic.com' },
    },
    tierModels: { haiku: 'haiku-model', sonnet: 'sonnet-model', opus: 'opus-model', reasoning: 'reasoning-model' },
    selectedTier: 'opus',
  };

  const dao = legacyToDaoProvider(legacy, 'claude');
  const result = daoToLegacyProvider({ ...dao, agentType: 'claude', id: 'test-id', metadata: dao.metadata || {}, isActive: false });

  assert.equal(result.name, 'FullClaude');
  assert.equal(result.key, 'sk-ant-full');
  assert.equal(result.url, 'https://api.anthropic.com', 'url should survive');
  assert.equal(result.website, 'https://docs.anthropic.com', 'website should survive');
  assert.equal(result.note, 'Production account', 'note should survive');
  assert.equal(result.language, 'en', 'language should survive');
  assert.equal(result.permissionPolicy, 'allow', 'permissionPolicy should survive');
  assert.equal(result.effortLevel, 'high', 'effortLevel should survive');
  assert.equal(result.selectedTier, 'opus');
  assert.equal(result.tierModels.sonnet, 'sonnet-model');
});

test('Claude legacy with missing fields gets safe defaults', () => {
  const { legacyToDaoProvider, daoToLegacyProvider } = require('./index');
  // Minimal Claude legacy — only name + key
  const legacy = {
    name: 'MinimalClaude',
    key: 'sk-ant-min',
    url: 'https://api.anthropic.com',
  };

  const dao = legacyToDaoProvider(legacy, 'claude');
  const result = daoToLegacyProvider({ ...dao, agentType: 'claude', id: 'test-id-min', metadata: dao.metadata || {}, isActive: false });

  assert.equal(result.name, 'MinimalClaude');
  assert.equal(result.language, 'zh-CN', 'language should default to zh-CN');
  assert.equal(result.permissionPolicy, 'ask', 'permissionPolicy should default to ask');
  assert.equal(result.effortLevel, 'medium', 'effortLevel should default to medium');
  assert.equal(result.website, '', 'website should default to empty');
  assert.equal(result.note, '', 'note should default to empty');
  assert.equal(result.selectedTier, 'sonnet', 'selectedTier should default to sonnet');
  assert.deepEqual(result.tierModels, { haiku: '', sonnet: '', opus: '', reasoning: '' }, 'tierModels should default to empty tiers');
});

test('Claude sql.js persistence: write -> persist -> reopen -> all fields survive', async () => {
  const sql = await getSql();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-ps-claude-'));
  const dbPath = path.join(tmpDir, 'mindcraft.db');

  // Create DB, write Claude providers with full shape, persist
  const db1 = new sql.Database();
  const { runMigrations } = require('../migrations/v1_initial');
  const migResult = runMigrations(db1);
  if (!migResult.ok) throw new Error(`Migration failed: ${migResult.message}`);

  const { setProviders, getProviders } = require('./index');
  setProviders(db1, 'claude', {
    providers: [
      {
        name: 'ClaudePersist',
        key: 'sk-ant-persist',
        url: 'https://api.anthropic.com',
        website: 'https://docs.anthropic.com',
        note: 'Test persistence',
        language: 'en',
        permissionPolicy: 'deny',
        effortLevel: 'xhigh',
        tierModels: { haiku: '', sonnet: 'claude-sonnet-4', opus: '', reasoning: '' },
        selectedTier: 'sonnet',
        config: { env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-persist' } },
      },
    ],
    activeIdx: 0,
  });

  // Persist to file
  const buffer = Buffer.from(db1.export());
  fs.writeFileSync(dbPath, buffer);
  db1.close();

  // Reopen and verify
  const fileBuffer = fs.readFileSync(dbPath);
  const db2 = new sql.Database(fileBuffer);

  const payload = getProviders(db2, 'claude');
  assert.equal(payload.providers.length, 1);
  const p = payload.providers[0];
  assert.equal(p.name, 'ClaudePersist');
  assert.equal(p.key, 'sk-ant-persist');
  assert.equal(p.url, 'https://api.anthropic.com', 'url should survive persist+reopen');
  assert.equal(p.website, 'https://docs.anthropic.com');
  assert.equal(p.note, 'Test persistence');
  assert.equal(p.language, 'en');
  assert.equal(p.permissionPolicy, 'deny');
  assert.equal(p.effortLevel, 'xhigh');
  assert.equal(p.selectedTier, 'sonnet');
  assert.equal(p.tierModels.sonnet, 'claude-sonnet-4');

  db2.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Claude legacy backfill: DB empty, legacy has data → auto backfill with all fields', async () => {
  const db = await createFreshDb();
  const { getProviders } = require('./index');

  const legacyData = {
    providers: [
      {
        name: 'BackfillClaude',
        key: 'sk-ant-backfill',
        url: 'https://api.anthropic.com',
        website: 'https://docs.example.com',
        note: 'Backfill test',
        language: 'ja',
        permissionPolicy: 'ask',
        effortLevel: 'low',
        tierModels: { haiku: '', sonnet: 'claude-sonnet-backfill', opus: '', reasoning: '' },
        selectedTier: 'haiku',
      },
    ],
    activeIdx: 0,
  };

  const payload = getProviders(db, 'claude', () => legacyData);
  assert.equal(payload.providers.length, 1);
  const p = payload.providers[0];
  assert.equal(p.name, 'BackfillClaude');
  assert.equal(p.url, 'https://api.anthropic.com', 'url should survive backfill');
  assert.equal(p.website, 'https://docs.example.com');
  assert.equal(p.note, 'Backfill test');
  assert.equal(p.language, 'ja');
  assert.equal(p.permissionPolicy, 'ask');
  assert.equal(p.effortLevel, 'low');
  assert.equal(p.selectedTier, 'haiku');
  assert.equal(p.tierModels.sonnet, 'claude-sonnet-backfill');

  db.close();
});

test('Claude id empotency: setProviders multiple times → same ID, no duplicates', async () => {
  const db = await createFreshDb();
  const { setProviders, getProviders } = require('./index');

  // Round 1: insert
  setProviders(db, 'claude', {
    providers: [
      {
        name: 'ClaudeIdem',
        key: 'sk-ant-idem',
        url: 'https://api.anthropic.com',
        language: 'zh-CN',
        permissionPolicy: 'ask',
        effortLevel: 'medium',
      },
    ],
    activeIdx: 0,
  });

  // Round 2: get → set same payload back
  const payload = getProviders(db, 'claude');
  assert.equal(payload.providers.length, 1);
  assert.ok(payload.providers[0].id, 'provider should have an id');
  const originalId = payload.providers[0].id;

  setProviders(db, 'claude', payload);

  // Round 3: verify no duplicates
  const final = getProviders(db, 'claude');
  assert.equal(final.providers.length, 1, 'should still have exactly 1 provider');
  assert.equal(final.providers[0].id, originalId, 'id should be stable across all rounds');
  assert.equal(final.providers[0].name, 'ClaudeIdem');

  db.close();
});
