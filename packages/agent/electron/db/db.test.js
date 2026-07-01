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
  // Run migration
  const { migrateV1 } = require('./migrations/v1_initial');
  migrateV1(db);
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
  const { migrateV1 } = require('./migrations/v1_initial');
  migrateV1(db1);

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
