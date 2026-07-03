'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Run all migrations to get latest schema
  const { runMigrations } = require('./migrations/v1_initial');
  const migResult = runMigrations(db);
  if (!migResult.ok) {
    db.close();
    throw new Error(`Migration failed in createFreshDb: ${migResult.message}`);
  }
  return db;
}

// ---------------------------------------------------------------------------
// A. Migration Idempotency
// ---------------------------------------------------------------------------

test('migration v1 creates tables on fresh db', async () => {
  const { migrateV1, getDbVersion } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  const result = migrateV1(db);
  assert.equal(result.ok, true);
  assert.equal(result.version, 1);

  const version = getDbVersion(db);
  assert.equal(version, 1);

  // Verify tables exist
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = tables[0].values.map((r) => r[0]);
  assert.ok(tableNames.includes('providers'), 'providers table should exist');
  assert.ok(tableNames.includes('import_runs'), 'import_runs table should exist');

  db.close();
});

test('migration v1 is idempotent on second run', async () => {
  const { migrateV1, getDbVersion } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  migrateV1(db);
  const result2 = migrateV1(db); // second run
  assert.equal(result2.ok, true);
  assert.ok(result2.message.includes('Already at'), 'Should skip already-migrated DB');

  const version = getDbVersion(db);
  assert.equal(version, 1);

  db.close();
});

test('getDbVersion returns 0 on fresh un-migrated db', async () => {
  const { getDbVersion } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  assert.equal(getDbVersion(db), 0);

  db.close();
});

// ---------------------------------------------------------------------------
// A2. V2 Migration (sort_index, projection_status, last_projected_at)
// ---------------------------------------------------------------------------

test('runMigrations on fresh db creates v2 schema', async () => {
  const { runMigrations, getDbVersion } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  const result = runMigrations(db);
  assert.equal(result.ok, true);
  assert.equal(result.version, 2);

  const version = getDbVersion(db);
  assert.equal(version, 2);

  // Verify v2 columns exist
  const cols = db.exec('PRAGMA table_info(providers)');
  const colNames = cols[0].values.map((r) => r[1]);
  assert.ok(colNames.includes('sort_index'), 'sort_index column should exist');
  assert.ok(colNames.includes('projection_status'), 'projection_status column should exist');
  assert.ok(colNames.includes('last_projected_at'), 'last_projected_at column should exist');

  // Verify v2 index exists
  const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name");
  const idxNames = indexes[0].values.map((r) => r[0]);
  assert.ok(idxNames.includes('idx_providers_agent_sort'), 'v2 index should exist');

  // Verify default values by inserting a row and reading back
  db.run(
    "INSERT INTO providers (id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['def-test', 'codex', 'DefaultTest', '{}', '{}', 0, 'mindcraft', 1000, 1000],
  );
  const row = db.exec('SELECT sort_index, projection_status, last_projected_at FROM providers WHERE id = ?', ['def-test']);
  assert.equal(row[0].values[0][0], 0, 'sort_index default should be 0');
  assert.equal(row[0].values[0][1], 'pending', 'projection_status default should be pending');
  assert.equal(row[0].values[0][2], null, 'last_projected_at default should be null');

  db.close();
});

test('migrateV2 upgrades v1 DB to v2', async () => {
  const { migrateV1, migrateV2, getDbVersion } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  // Start from v1
  migrateV1(db);
  assert.equal(getDbVersion(db), 1);

  // Insert some v1 data to verify it survives
  db.run(
    "INSERT INTO providers (id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['test-1', 'codex', 'Test', '{}', '{}', 0, 'mindcraft', 1000, 1000],
  );

  // Upgrade to v2
  const result = migrateV2(db);
  assert.equal(result.ok, true, `v2 migration should succeed: ${result.message}`);
  assert.equal(getDbVersion(db), 2);

  // Verify data survived
  const rows = db.exec('SELECT id, name, sort_index, projection_status FROM providers WHERE id = ?', ['test-1']);
  assert.equal(rows[0].values.length, 1);
  assert.equal(rows[0].values[0][0], 'test-1');
  assert.equal(rows[0].values[0][1], 'Test');
  assert.equal(rows[0].values[0][2], 0, 'existing row should have sort_index = 0');
  assert.equal(rows[0].values[0][3], 'pending', 'existing row should have projection_status = pending');

  // Verify new columns exist
  const cols = db.exec('PRAGMA table_info(providers)');
  const colNames = cols[0].values.map((r) => r[1]);
  assert.ok(colNames.includes('sort_index'));
  assert.ok(colNames.includes('projection_status'));
  assert.ok(colNames.includes('last_projected_at'));

  db.close();
});

test('v2 migration is idempotent', async () => {
  const { migrateV1, migrateV2, getDbVersion } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  migrateV1(db);
  migrateV2(db);
  const result2 = migrateV2(db); // second run
  assert.equal(result2.ok, true);
  assert.ok(result2.message.includes('Already at'), 'Should skip already-migrated v2 DB');
  assert.equal(getDbVersion(db), 2);

  db.close();
});

test('migrateV2 refuses to run without migrateV1', async () => {
  const { migrateV2 } = require('./migrations/v1_initial');
  const sql = await getSql();
  const db = new sql.Database();

  const result = migrateV2(db);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes('Must run migrateV1'), 'Should refuse without v1');

  db.close();
});

// ---------------------------------------------------------------------------
// B. Provider DAO CRUD
// ---------------------------------------------------------------------------

test('listProviders returns empty array for empty DB', async () => {
  const db = await createFreshDb();
  const { listProviders } = require('./dao/providers');

  const codexProviders = listProviders(db, 'codex');
  assert.deepEqual(codexProviders, []);

  const claudeProviders = listProviders(db, 'claude');
  assert.deepEqual(claudeProviders, []);

  db.close();
});

test('upsertProviders inserts new providers', async () => {
  const db = await createFreshDb();
  const { upsertProviders, listProviders, getProvider } = require('./dao/providers');

  const result = upsertProviders(db, [
    {
      id: 'p-test-1',
      agentType: 'codex',
      name: 'DeepSeek',
      config: { key: 'sk-test', url: 'https://api.deepseek.com', model: 'deepseek-chat', reasoningEffort: '', apiFormat: 'chat' },
      isActive: true,
      source: 'cc-switch',
    },
    {
      id: 'p-test-2',
      agentType: 'codex',
      name: 'OpenAI',
      config: { key: 'sk-openai', url: 'https://api.openai.com', model: 'gpt-4o', apiFormat: 'responses' },
      isActive: false,
    },
  ], { source: 'cc-switch' });

  assert.equal(result.ok, true);
  assert.equal(result.count, 2);

  const codexList = listProviders(db, 'codex');
  assert.equal(codexList.length, 2);

  // DeepSeek should be active
  const ds = getProvider(db, 'p-test-1');
  assert.ok(ds);
  assert.equal(ds.name, 'DeepSeek');
  assert.equal(ds.isActive, true);
  assert.equal(ds.source, 'cc-switch');
  assert.deepEqual(ds.config, { key: 'sk-test', url: 'https://api.deepseek.com', model: 'deepseek-chat', reasoningEffort: '', apiFormat: 'chat' });

  db.close();
});

test('upsertProviders updates existing providers on conflict', async () => {
  const db = await createFreshDb();
  const { upsertProviders, getProvider } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-update-1', agentType: 'codex', name: 'Original', config: { model: 'old' } },
  ]);

  const result2 = upsertProviders(db, [
    { id: 'p-update-1', agentType: 'codex', name: 'Updated', config: { model: 'new' }, isActive: true },
  ]);

  assert.equal(result2.ok, true);
  assert.equal(result2.count, 1);

  const updated = getProvider(db, 'p-update-1');
  assert.equal(updated.name, 'Updated');
  assert.deepEqual(updated.config, { model: 'new' });
  assert.equal(updated.isActive, true);

  db.close();
});

test('setActiveProvider ensures only one active per agent_type', async () => {
  const db = await createFreshDb();
  const { upsertProviders, setActiveProvider, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-a', agentType: 'codex', name: 'A', config: {}, isActive: true },
    { id: 'p-b', agentType: 'codex', name: 'B', config: {}, isActive: false },
    { id: 'p-c', agentType: 'claude', name: 'C', config: {}, isActive: true },
  ]);

  // Activate B for codex
  setActiveProvider(db, 'codex', 'p-b');

  const codexList = listProviders(db, 'codex');
  const activeCodex = codexList.filter((p) => p.isActive);
  assert.equal(activeCodex.length, 1);
  assert.equal(activeCodex[0].id, 'p-b');

  // Claude providers should be unaffected
  const claudeList = listProviders(db, 'claude');
  const activeClaude = claudeList.filter((p) => p.isActive);
  assert.equal(activeClaude.length, 1);
  assert.equal(activeClaude[0].id, 'p-c');

  db.close();
});

test('deleteProvider removes a provider', async () => {
  const db = await createFreshDb();
  const { upsertProviders, deleteProvider, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-del-1', agentType: 'codex', name: 'ToDelete', config: {} },
    { id: 'p-del-2', agentType: 'codex', name: 'Keep', config: {} },
  ]);

  deleteProvider(db, 'p-del-1');

  const codexList = listProviders(db, 'codex');
  assert.equal(codexList.length, 1);
  assert.equal(codexList[0].id, 'p-del-2');

  db.close();
});

test('listProviders filters by agentType only', async () => {
  const db = await createFreshDb();
  const { upsertProviders, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-codex-1', agentType: 'codex', name: 'CX1', config: {} },
    { id: 'p-claude-1', agentType: 'claude', name: 'CL1', config: {} },
  ]);

  assert.equal(listProviders(db, 'codex').length, 1);
  assert.equal(listProviders(db, 'claude').length, 1);

  db.close();
});

test('upsertProviders rejects invalid agentType', async () => {
  const db = await createFreshDb();
  const { upsertProviders } = require('./dao/providers');

  const result = upsertProviders(db, [{ agentType: 'invalid', name: 'X', config: {} }]);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Invalid agent_type'));

  db.close();
});

// ---------------------------------------------------------------------------
// B2. Provider DAO — sort_index, reorder, projection status
// ---------------------------------------------------------------------------

test('listProviders orders by sort_index ASC', async () => {
  const db = await createFreshDb();
  const { upsertProviders, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-z', agentType: 'codex', name: 'Z', config: {}, sortIndex: 2 },
    { id: 'p-a', agentType: 'codex', name: 'A', config: {}, sortIndex: 0 },
    { id: 'p-m', agentType: 'codex', name: 'M', config: {}, sortIndex: 1 },
  ]);

  const providers = listProviders(db, 'codex');
  assert.equal(providers.length, 3);
  assert.equal(providers[0].name, 'A');
  assert.equal(providers[1].name, 'M');
  assert.equal(providers[2].name, 'Z');

  db.close();
});

test('upsertProviders auto-assigns sort_index for new providers', async () => {
  const db = await createFreshDb();
  const { upsertProviders, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-1', agentType: 'codex', name: 'First', config: {} },
    { id: 'p-2', agentType: 'codex', name: 'Second', config: {} },
    { id: 'p-3', agentType: 'codex', name: 'Third', config: {} },
  ]);

  const providers = listProviders(db, 'codex');
  assert.equal(providers.length, 3);
  assert.equal(providers[0].sortIndex, 0);
  assert.equal(providers[1].sortIndex, 1);
  assert.equal(providers[2].sortIndex, 2);

  db.close();
});

test('upsertProviders preserves new v2 fields', async () => {
  const db = await createFreshDb();
  const { upsertProviders, getProvider } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'p-v2', agentType: 'codex', name: 'V2Test', config: {}, sortIndex: 5, projectionStatus: 'synced' },
  ]);

  const p = getProvider(db, 'p-v2');
  assert.equal(p.sortIndex, 5);
  assert.equal(p.projectionStatus, 'synced');
  assert.equal(p.lastProjectedAt, null);

  db.close();
});

test('reorderProviders updates sort_index and sets projection_status to pending', async () => {
  const db = await createFreshDb();
  const { upsertProviders, reorderProviders, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'r-a', agentType: 'codex', name: 'A', config: {} },
    { id: 'r-b', agentType: 'codex', name: 'B', config: {} },
    { id: 'r-c', agentType: 'codex', name: 'C', config: {} },
  ]);

  // Reverse order
  const result = reorderProviders(db, 'codex', ['r-c', 'r-b', 'r-a']);
  assert.equal(result.ok, true);
  assert.equal(result.count, 3);

  const providers = listProviders(db, 'codex');
  assert.equal(providers[0].name, 'C');
  assert.equal(providers[1].name, 'B');
  assert.equal(providers[2].name, 'A');

  // All should have projection_status = 'pending' after reorder
  for (const p of providers) {
    assert.equal(p.projectionStatus, 'pending', `${p.name} should be pending after reorder`);
  }

  db.close();
});

test('reorderProviders only affects specified agentType', async () => {
  const db = await createFreshDb();
  const { upsertProviders, reorderProviders, listProviders } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'cx-a', agentType: 'codex', name: 'CodeX-A', config: {} },
    { id: 'cx-b', agentType: 'codex', name: 'CodeX-B', config: {} },
    { id: 'cl-a', agentType: 'claude', name: 'Claude-A', config: {} },
    { id: 'cl-b', agentType: 'claude', name: 'Claude-B', config: {} },
  ]);

  reorderProviders(db, 'codex', ['cx-b', 'cx-a']);

  const codex = listProviders(db, 'codex');
  assert.equal(codex[0].name, 'CodeX-B');
  assert.equal(codex[1].name, 'CodeX-A');

  // Claude should be unaffected
  const claude = listProviders(db, 'claude');
  assert.equal(claude[0].name, 'Claude-A');
  assert.equal(claude[1].name, 'Claude-B');

  db.close();
});

test('setProjectionStatus updates status and timestamp', async () => {
  const db = await createFreshDb();
  const { upsertProviders, setProjectionStatus, getProvider } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'ps-1', agentType: 'codex', name: 'PS', config: {} },
  ]);

  // Set to synced
  const before = Date.now();
  const result = setProjectionStatus(db, 'ps-1', 'synced');
  assert.equal(result.ok, true);

  const p = getProvider(db, 'ps-1');
  assert.equal(p.projectionStatus, 'synced');
  assert.ok(typeof p.lastProjectedAt === 'number');
  assert.ok(p.lastProjectedAt >= Math.floor(before / 1000));

  // Set to failed
  setProjectionStatus(db, 'ps-1', 'failed');
  const p2 = getProvider(db, 'ps-1');
  assert.equal(p2.projectionStatus, 'failed');

  db.close();
});

test('setProjectionStatus rejects invalid status', async () => {
  const db = await createFreshDb();
  const { setProjectionStatus } = require('./dao/providers');

  const result = setProjectionStatus(db, 'any', 'invalid_status');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Invalid projection status'));

  db.close();
});

test('listProvidersByStatus filters by projection status', async () => {
  const db = await createFreshDb();
  const { upsertProviders, listProvidersByStatus } = require('./dao/providers');

  upsertProviders(db, [
    { id: 'ls-1', agentType: 'codex', name: 'Pending1', config: {}, projectionStatus: 'pending' },
    { id: 'ls-2', agentType: 'codex', name: 'Synced1', config: {}, projectionStatus: 'synced' },
    { id: 'ls-3', agentType: 'codex', name: 'Failed1', config: {}, projectionStatus: 'failed' },
  ]);

  const pending = listProvidersByStatus(db, 'codex', 'pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].name, 'Pending1');

  const synced = listProvidersByStatus(db, 'codex', 'synced');
  assert.equal(synced.length, 1);
  assert.equal(synced[0].name, 'Synced1');

  const failed = listProvidersByStatus(db, 'codex', 'failed');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].name, 'Failed1');

  db.close();
});

// ---------------------------------------------------------------------------
// C. Import Runs DAO
// ---------------------------------------------------------------------------

test('recordImportRun stores and lists import runs', async () => {
  const db = await createFreshDb();
  const { recordImportRun, listImportRuns } = require('./dao/importRuns');

  const r1 = recordImportRun(db, { source: 'cc-switch', sourcePath: '/tmp/export.sql', summary: { imported: 3, skipped: 1 } });
  assert.equal(r1.ok, true);
  assert.ok(r1.id);

  const r2 = recordImportRun(db, { source: 'local-cli', summary: { imported: 1 } });
  assert.equal(r2.ok, true);

  const runs = listImportRuns(db, { limit: 10 });
  assert.ok(runs, 'listImportRuns should not return null');
  assert.equal(runs.length, 2);

  // Newest first
  assert.equal(runs[0].source, 'local-cli');
  assert.equal(runs[1].source, 'cc-switch');
  assert.equal(runs[1].sourcePath, '/tmp/export.sql');
  assert.deepEqual(runs[1].summary, { imported: 3, skipped: 1 });

  db.close();
});

// ---------------------------------------------------------------------------
// D. CC Switch SQL Parser — Unit Tests
// ---------------------------------------------------------------------------

test('splitSqlValues handles basic comma-separated values', () => {
  const { splitSqlValues } = require('./import/ccSwitch');
  const result = splitSqlValues("'a', 'b', 123, NULL");
  assert.deepEqual(result, ["'a'", "'b'", '123', 'NULL']);
});

test('splitSqlValues handles escaped single quotes', () => {
  const { splitSqlValues } = require('./import/ccSwitch');
  // splitSqlValues preserves raw '' so unescapeSqlValue can handle it
  const result = splitSqlValues("'it''s', 'hello'");
  assert.deepEqual(result, ["'it''s'", "'hello'"]);
});

test('splitSqlValues + unescapeSqlValue round-trips escaped quotes', () => {
  const { splitSqlValues, unescapeSqlValue } = require('./import/ccSwitch');
  const raw = splitSqlValues("'it''s', 'hello'");
  assert.equal(unescapeSqlValue(raw[0]), "it's");
  assert.equal(unescapeSqlValue(raw[1]), 'hello');
});

test('splitSqlValues handles commas inside strings', () => {
  const { splitSqlValues } = require('./import/ccSwitch');
  const result = splitSqlValues("'hello, world', 42, 'foo'");
  assert.deepEqual(result, ["'hello, world'", '42', "'foo'"]);
});

test('splitSqlValues handles nested parentheses in strings', () => {
  const { splitSqlValues } = require('./import/ccSwitch');
  const result = splitSqlValues("'func(x, y)', 'bar'");
  assert.deepEqual(result, ["'func(x, y)'", "'bar'"]);
});

test('unescapeSqlValue converts SQL literals', () => {
  const { unescapeSqlValue } = require('./import/ccSwitch');
  assert.equal(unescapeSqlValue('NULL'), null);
  assert.equal(unescapeSqlValue('null'), null);
  assert.equal(unescapeSqlValue('42'), 42);
  assert.equal(unescapeSqlValue('-1'), -1);
  assert.equal(unescapeSqlValue("'hello'"), 'hello');
  assert.equal(unescapeSqlValue("'it''s'"), "it's");
});

test('parseInsertLine with explicit columns', () => {
  const { parseInsertLine } = require('./import/ccSwitch');
  const result = parseInsertLine(
    'INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current") VALUES (\'p1\', \'codex\', \'DeepSeek\', \'{}\', \'{}\', 1);',
  );
  assert.ok(result);
  assert.equal(result.table, 'providers');
  assert.deepEqual(result.columns, ['id', 'app_type', 'name', 'settings_config', 'meta', 'is_current']);
  assert.equal(result.rawValues.length, 6);
});

test('parseInsertLine with legacy positional VALUES', () => {
  const { parseInsertLine } = require('./import/ccSwitch');
  const result = parseInsertLine(
    "INSERT INTO providers VALUES ('p1', 'codex', 'DeepSeek', '{}', '{}', 1);",
  );
  assert.ok(result);
  assert.equal(result.table, 'providers');
  assert.deepEqual(result.columns, []);
  assert.equal(result.rawValues.length, 6);
});

test('parseInsertLine returns null for non-INSERT text', () => {
  const { parseInsertLine } = require('./import/ccSwitch');
  assert.equal(parseInsertLine('-- comment'), null);
  assert.equal(parseInsertLine(''), null);
});

test('parseInsertLine handles reordered columns', () => {
  const { parseInsertLine, unescapeSqlValue } = require('./import/ccSwitch');
  const result = parseInsertLine(
    'INSERT INTO "providers" ("name", "app_type", "id", "is_current", "meta", "settings_config") VALUES (\'Reordered\', \'codex\', \'r1\', 0, \'{}\', \'{"model":"gpt-4"}\');',
  );
  assert.ok(result);
  // Build row from reordered columns
  const row = {};
  for (let i = 0; i < result.columns.length; i += 1) {
    row[result.columns[i]] = unescapeSqlValue(result.rawValues[i]);
  }
  assert.equal(row.name, 'Reordered');
  assert.equal(row.app_type, 'codex');
  assert.equal(row.id, 'r1');
  assert.equal(typeof row.settings_config, 'string');
});

// ---------------------------------------------------------------------------
// E. CC Switch Full Export Parsing
// ---------------------------------------------------------------------------

test('parseCcSwitchExport produces normalised providers', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = String.raw`
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-1', 'codex', 'DeepSeek', '{"auth":{"OPENAI_API_KEY":"sk-ds"},"config":"model = \"deepseek-chat\"\nbase_url = \"https://api.deepseek.com\""}', '{}', 1);

INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-2', 'codex', 'OpenAI', '{"auth":{"OPENAI_API_KEY":"sk-oai"},"config":"model = \"gpt-4o\"\nwire_api = \"responses\""}', '{}', 0);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.warnings.length, 0);

  const ds = result.providers[0];
  assert.equal(ds.agentType, 'codex');
  assert.equal(ds.name, 'DeepSeek');
  assert.equal(ds.config.key, 'sk-ds');
  assert.equal(ds.config.url, 'https://api.deepseek.com');
  assert.equal(ds.isActive, true);
  assert.equal(ds.metadata.source, 'cc-switch');

  const oai = result.providers[1];
  assert.equal(oai.config.key, 'sk-oai');
  assert.equal(oai.config.apiFormat, 'responses');
  assert.equal(oai.isActive, false);
});

test('parseCcSwitchExport handles escaped quotes in JSON', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-esc', 'codex', 'Test', '{"auth":{"OPENAI_API_KEY":"key''with''quotes"},"config":"model = \\"test\\""}', '{}', 0);`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 1);
  assert.equal(result.providers[0].config.key, "key'with'quotes");
});

test('parseCcSwitchExport handles CC Switch field name variants', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = String.raw`
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-var', 'codex', 'Variant', '{"auth":{"OPENAI_API_KEY":"sk1"},"config":"model = \"gpt-4o\"\nbase_url = \"https://x.com\"\nmodel_reasoning_effort = \"high\"\nwire_api = \"chat\""}', '{}', 0);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers[0].config.key, 'sk1');
  assert.equal(result.providers[0].config.url, 'https://x.com');
  assert.equal(result.providers[0].config.reasoningEffort, 'high');
});

test('parseCcSwitchExport skips unsupported app_type', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-skip', 'gemini', 'Gemini', '{"key":"x"}', '{}', 0);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('unsupported app_type'));
});

test('parseCcSwitchExport warns on invalid settings_config JSON', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-bad', 'codex', 'BadJSON', 'not-json', '{}', 0);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes('invalid settings_config'));
});

test('parseCcSwitchExport handles mixed supported and unsupported', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-ok', 'codex', 'OK', '{"key":"x"}', '{}', 1);

INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-bad', 'unknown', 'Bad', '{"key":"x"}', '{}', 0);

INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('cc-claude', 'claude', 'Claude', '{"key":"y"}', '{}', 1);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.providers[0].agentType, 'codex');
  assert.equal(result.providers[1].agentType, 'claude');
});

test('parseCcSwitchExport handles empty/malformed input', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');

  assert.deepEqual(parseCcSwitchExport('').providers, []);
  assert.deepEqual(parseCcSwitchExport(null).providers, []);
  assert.deepEqual(parseCcSwitchExport('-- just a comment').providers, []);
});

// ---------------------------------------------------------------------------
// F. Backup
// ---------------------------------------------------------------------------

test('backupDb creates a backup file', async () => {
  const { backupDb } = require('./backup');
  const db = await createFreshDb();
  // Insert some data
  const { upsertProviders } = require('./dao/providers');
  upsertProviders(db, [{ id: 'p-bak', agentType: 'codex', name: 'BackupTest', config: { key: 'x' } }]);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-test-'));
  const result = backupDb(db, { userDataDir: tmpDir, label: 'test' });

  assert.equal(result.ok, true);
  assert.ok(result.backupPath.includes('test'));
  assert.ok(fs.existsSync(result.backupPath));
  assert.ok(fs.statSync(result.backupPath).size > 0);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  db.close();
});

test('readBackupBuffer reads a backup file', async () => {
  const { backupDb, readBackupBuffer } = require('./backup');
  const db = await createFreshDb();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-test-'));
  const createResult = backupDb(db, { userDataDir: tmpDir });

  const readResult = readBackupBuffer(createResult.backupPath);
  assert.equal(readResult.ok, true);
  assert.ok(readResult.buffer);
  assert.ok(readResult.buffer.length > 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  db.close();
});

test('readBackupBuffer returns error for missing file', () => {
  const { readBackupBuffer } = require('./backup');
  const result = readBackupBuffer('/nonexistent/backup.db');
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// G. Persistence round-trip
// ---------------------------------------------------------------------------

test('DB persists and reloads correctly', async () => {
  const sql = await getSql();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-test-'));
  const dbPath = path.join(tmpDir, 'mindcraft.db');

  // Create, insert, close
  const db1 = new sql.Database();
  const { runMigrations } = require('./migrations/v1_initial');
  runMigrations(db1);

  const { upsertProviders } = require('./dao/providers');
  upsertProviders(db1, [{ id: 'p-roundtrip', agentType: 'codex', name: 'RoundTrip', config: { key: 'rt' }, isActive: true }]);

  // Save to disk
  const buffer = Buffer.from(db1.export());
  fs.writeFileSync(dbPath, buffer);
  db1.close();

  // Reopen
  const fileBuffer = fs.readFileSync(dbPath);
  const db2 = new sql.Database(fileBuffer);

  const { listProviders, getProvider } = require('./dao/providers');
  const providers = listProviders(db2, 'codex');
  assert.equal(providers.length, 1);

  const p = getProvider(db2, 'p-roundtrip');
  assert.ok(p);
  assert.equal(p.name, 'RoundTrip');
  assert.equal(p.config.key, 'rt');
  assert.equal(p.isActive, true);

  db2.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// H. T163: Mixed SQL (CodeX + Claude in one file)
// ---------------------------------------------------------------------------

test('T163 parseCcSwitchExport handles mixed CodeX and Claude providers', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('mx-1', 'codex', 'DeepSeek', '{"auth":{"OPENAI_API_KEY":"sk-ds"},"config":"model = \\"deepseek-chat\\""}', '{}', 1);

INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('mx-2', 'claude', 'Anthropic', '{"env":{"ANTHROPIC_AUTH_TOKEN":"sk-ant","ANTHROPIC_BASE_URL":"https://api.anthropic.com"},"model":"sonnet"}', '{"apiFormat":"anthropic"}', 0);

INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('mx-3', 'codex', 'OpenAI', '{"auth":{"OPENAI_API_KEY":"sk-oai"},"config":"model = \\"gpt-4o\\""}', '{}', 0);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 3);

  const codexProviders = result.providers.filter((p) => p.agentType === 'codex');
  const claudeProviders = result.providers.filter((p) => p.agentType === 'claude');

  assert.equal(codexProviders.length, 2);
  assert.equal(claudeProviders.length, 1);

  assert.equal(codexProviders[0].name, 'DeepSeek');
  assert.equal(codexProviders[1].name, 'OpenAI');
  assert.equal(claudeProviders[0].name, 'Anthropic');
  assert.equal(claudeProviders[0].agentType, 'claude');
});

test('T163 parseCcSwitchExport handles ANTHROPIC_API_KEY variant', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = String.raw`
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('api-key-1', 'claude', 'MindCraft', '{"env":{"ANTHROPIC_API_KEY":"mc-test-key","ANTHROPIC_BASE_URL":"https://api.mindcraft.com.cn","ANTHROPIC_DEFAULT_SONNET_MODEL":"claude-sonnet-cc"},"model":"sonnet"}', '{"apiKeyField":"ANTHROPIC_API_KEY","apiFormat":"anthropic"}', 0);
`;
  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 1);
  const p = result.providers[0];
  assert.equal(p.name, 'MindCraft');
  assert.equal(p.config.key, 'mc-test-key');
  assert.equal(p.config.url, 'https://api.mindcraft.com.cn');
  assert.equal(p.config.model, 'claude-sonnet-cc');
});

test('T163 commitImport overwrites by name without targetProviderId', async () => {
  const { commitImport } = require('./import/index');
  const db = await createFreshDb();

  const existing = [
    { id: 'existing-a', name: 'DeepSeek', config: { key: 'old-key', url: 'https://old.api.com' }, isActive: true },
    { id: 'existing-b', name: 'OpenAI', config: { key: 'old-oai-key' }, isActive: false },
  ];

  const preview = [
    { tempId: 'p-1', agentType: 'codex', name: 'DeepSeek', config: { key: 'new-key', url: 'https://new.api.com' }, metadata: { source: 'cc-switch' }, isActive: false },
  ];

  const decisions = [
    { tempId: 'p-1', action: 'overwrite' }, // no targetProviderId — resolved by name
  ];

  const result = commitImport(db, {
    providers: decisions,
    previewProviders: preview,
    existingProviders: existing,
    agentType: 'codex',
    source: 'cc-switch',
    sourcePath: null,
    userDataDir: undefined,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 0);

  // Verify the overwritten provider has new config
  const overwritten = result.providers.find((p) => p.name === 'DeepSeek');
  assert.ok(overwritten);
  assert.equal(overwritten.config.key, 'new-key');
  assert.equal(overwritten.config.url, 'https://new.api.com');

  // Verify no duplicate DeepSeek
  const deepSeekCount = result.providers.filter((p) => p.name === 'DeepSeek').length;
  assert.equal(deepSeekCount, 1);

  // Verify OpenAI was NOT overwritten and still exists
  const openai = result.providers.find((p) => p.name === 'OpenAI');
  assert.ok(openai);
  assert.equal(openai.config.key, 'old-oai-key');

  db.close();
});

test('T163 commitImport normalizes active per agentType in batch', async () => {
  const { commitImport } = require('./import/index');
  const db = await createFreshDb();

  // Both codex and claude preview providers are marked active
  const preview = [
    { tempId: 'c1', agentType: 'codex', name: 'CodeX-A', config: { key: 'cx-a' }, metadata: {}, isActive: true },
    { tempId: 'c2', agentType: 'codex', name: 'CodeX-B', config: { key: 'cx-b' }, metadata: {}, isActive: true },
    { tempId: 'l1', agentType: 'claude', name: 'Claude-A', config: { key: 'cl-a' }, metadata: {}, isActive: true },
    { tempId: 'l2', agentType: 'claude', name: 'Claude-B', config: { key: 'cl-b' }, metadata: {}, isActive: true },
  ];

  const decisions = preview.map((p) => ({ tempId: p.tempId, action: 'add' }));

  // Commit codex providers
  const codexResult = commitImport(db, {
    providers: decisions.filter((d) => ['c1', 'c2'].includes(d.tempId)),
    previewProviders: preview.filter((p) => p.agentType === 'codex'),
    existingProviders: [],
    agentType: 'codex',
    source: 'cc-switch',
    sourcePath: null,
  });

  assert.equal(codexResult.ok, true);

  // Only the LAST codex provider marked active should remain active
  const codexActive = codexResult.providers.filter((p) => p.isActive);
  assert.equal(codexActive.length, 1);
  assert.equal(codexActive[0].name, 'CodeX-B');

  // Commit claude providers
  const claudeResult = commitImport(db, {
    providers: decisions.filter((d) => ['l1', 'l2'].includes(d.tempId)),
    previewProviders: preview.filter((p) => p.agentType === 'claude'),
    existingProviders: [],
    agentType: 'claude',
    source: 'cc-switch',
    sourcePath: null,
  });

  assert.equal(claudeResult.ok, true);

  // Only the LAST claude provider marked active should remain active
  const claudeActive = claudeResult.providers.filter((p) => p.isActive);
  assert.equal(claudeActive.length, 1);
  assert.equal(claudeActive[0].name, 'Claude-B');

  // Verify DB state per agentType
  const { listProviders } = require('./dao/providers');
  const dbCodex = listProviders(db, 'codex');
  const dbClaude = listProviders(db, 'claude');

  assert.equal(dbCodex.filter((p) => p.isActive).length, 1);
  assert.equal(dbClaude.filter((p) => p.isActive).length, 1);

  db.close();
});

test('T163 anti-pollution: unknown CC Switch fields stay in metadata only', () => {
  const { parseCcSwitchExport } = require('./import/ccSwitch');
  const sql = `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('ap-1', 'codex', 'AntiPollution', '{"auth":{"OPENAI_API_KEY":"sk-ap"},"config":"model = \\"gpt-4\\"","unknown_field":"should-not-leak","internal_flag":true}', '{}', 0);
`;

  const result = parseCcSwitchExport(sql);
  assert.equal(result.providers.length, 1);

  const p = result.providers[0];

  // Known fields should be mapped to config
  assert.equal(p.config.key, 'sk-ap');
  assert.equal(p.config.model, 'gpt-4');

  // Unknown fields should NOT be in config — should be in metadata only
  assert.equal(p.config.unknown_field, undefined);
  assert.equal(p.config.internal_flag, undefined);

  // Raw settings should be preserved in metadata for audit
  assert.ok(p.metadata.ccSwitch);
  assert.ok(p.metadata.ccSwitch.rawSettings);
  const rawSettings = JSON.parse(p.metadata.ccSwitch.rawSettings);
  assert.equal(rawSettings.unknown_field, 'should-not-leak');
  assert.equal(rawSettings.internal_flag, true);
});

test('T163 previewCcSwitchFile returns tempIds for all providers', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { previewCcSwitchFile } = require('./import/index');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-test-'));
  const sqlPath = path.join(tmpDir, 'mixed.sql');
  fs.writeFileSync(sqlPath, `
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('t1', 'codex', 'CX', '{"key":"x"}', '{}', 0);
INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "meta", "is_current")
VALUES ('t2', 'claude', 'CL', '{"key":"y"}', '{}', 1);
`);

  const preview = previewCcSwitchFile(sqlPath);
  assert.equal(preview.ok, true);
  assert.equal(preview.providers.length, 2);

  // Each provider should have a unique tempId
  assert.ok(preview.providers[0].tempId);
  assert.ok(preview.providers[1].tempId);
  assert.notEqual(preview.providers[0].tempId, preview.providers[1].tempId);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('T163 annotateConflicts detects name conflicts across agent types independently', () => {
  const { annotateConflicts } = require('./import/index');

  const preview = [
    { tempId: 'p1', agentType: 'codex', name: 'DeepSeek', config: {} },
    { tempId: 'p2', agentType: 'claude', name: 'DeepSeek', config: {} }, // same name, different agent
  ];

  const codexExisting = [{ name: 'DeepSeek' }];
  const claudeExisting = [];

  // CodeX: DeepSeek exists → conflict
  const codexAnnotated = annotateConflicts(
    preview.filter((p) => p.agentType === 'codex'),
    codexExisting,
  );
  assert.equal(codexAnnotated[0].conflict, 'name');

  // Claude: DeepSeek doesn't exist → no conflict
  const claudeAnnotated = annotateConflicts(
    preview.filter((p) => p.agentType === 'claude'),
    claudeExisting,
  );
  assert.equal(claudeAnnotated[0].conflict, null);
});
