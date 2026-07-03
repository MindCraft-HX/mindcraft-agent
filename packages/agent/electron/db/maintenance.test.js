'use strict';

/**
 * Maintenance tests — import runs and backup cleanup.
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
  const { runMigrations } = require('./migrations/v1_initial');
  const migResult = runMigrations(db);
  if (!migResult.ok) {
    db.close();
    throw new Error(`Migration failed in createFreshDb: ${migResult.message}`);
  }
  return db;
}

// ---------------------------------------------------------------------------
// Import runs cleanup
// ---------------------------------------------------------------------------

test('cleanupImportRuns handles empty table', async () => {
  const db = await createFreshDb();
  const { cleanupImportRuns } = require('./maintenance');

  const result = cleanupImportRuns(db);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0);
  assert.equal(result.kept, 0);

  db.close();
});

test('cleanupImportRuns keeps records under maxRows', async () => {
  const db = await createFreshDb();
  const { recordImportRun } = require('./dao/importRuns');
  const { cleanupImportRuns } = require('./maintenance');
  const { listImportRuns } = require('./dao/importRuns');

  // Insert 5 records
  for (let i = 0; i < 5; i++) {
    recordImportRun(db, { source: 'test', summary: { idx: i } });
  }

  const result = cleanupImportRuns(db, { maxRows: 5, maxDays: 365 });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0, 'should keep all 5 when maxRows=5');

  const remaining = listImportRuns(db, { limit: 999 });
  assert.equal(remaining.length, 5);

  db.close();
});

test('cleanupImportRuns deletes records beyond maxRows', async () => {
  const db = await createFreshDb();
  const { recordImportRun } = require('./dao/importRuns');
  const { cleanupImportRuns } = require('./maintenance');
  const { listImportRuns } = require('./dao/importRuns');

  // Insert 10 records
  for (let i = 0; i < 10; i++) {
    recordImportRun(db, { source: 'test', summary: { idx: i } });
  }

  const result = cleanupImportRuns(db, { maxRows: 3, maxDays: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 7);

  const remaining = listImportRuns(db, { limit: 999 });
  assert.equal(remaining.length, 3);

  db.close();
});

// ---------------------------------------------------------------------------
// Backup cleanup
// ---------------------------------------------------------------------------

test('cleanupBackups handles nonexistent directory', () => {
  const { cleanupBackups } = require('./maintenance');
  const result = cleanupBackups('/nonexistent/path/backups');
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0);
  assert.equal(result.kept, 0);
});

test('cleanupBackups keeps latest N files per label', () => {
  const { cleanupBackups } = require('./maintenance');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-maint-test-'));

  // Create 8 backups (2 labels x 4 files each)
  const files = [
    'mindcraft.db.bak-20260101-120000',
    'mindcraft.db.bak-20260102-120000',
    'mindcraft.db.bak-20260103-120000',
    'mindcraft.db.bak-20260104-120000',
    'mindcraft.db.import.bak-20260101-120000',
    'mindcraft.db.import.bak-20260102-120000',
    'mindcraft.db.import.bak-20260103-120000',
    'mindcraft.db.import.bak-20260104-120000',
  ];

  for (const f of files) {
    fs.writeFileSync(path.join(tmpDir, f), 'mock backup content');
  }

  const result = cleanupBackups(tmpDir, { maxFiles: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 4, 'should delete 2 oldest from each label');
  assert.equal(result.kept, 4, 'should keep 2 newest from each label');

  // Verify the 2 newest per label remain
  const remaining = fs.readdirSync(tmpDir).sort();
  assert.ok(remaining.includes('mindcraft.db.bak-20260103-120000'));
  assert.ok(remaining.includes('mindcraft.db.bak-20260104-120000'));
  assert.ok(remaining.includes('mindcraft.db.import.bak-20260103-120000'));
  assert.ok(remaining.includes('mindcraft.db.import.bak-20260104-120000'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('cleanupBackups handles empty directory', () => {
  const { cleanupBackups } = require('./maintenance');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-maint-empty-'));
  const result = cleanupBackups(tmpDir, { maxFiles: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('cleanupBackups skips non-backup files', () => {
  const { cleanupBackups } = require('./maintenance');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-maint-nonbak-'));

  // Mix of backup files and non-backup files
  const files = [
    'mindcraft.db.bak-20260101-120000',
    'mindcraft.db.bak-20260102-120000',
    'mindcraft.db.bak-20260103-120000',
    'README.txt',           // non-backup
    '.DS_Store',            // non-backup
    'notes.md',             // non-backup
  ];

  for (const f of files) {
    fs.writeFileSync(path.join(tmpDir, f), 'mock content');
  }

  const result = cleanupBackups(tmpDir, { maxFiles: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2, 'should delete 2 oldest backups, not non-backup files');
  assert.equal(result.kept, 1);

  // Non-backup files should survive
  const remaining = fs.readdirSync(tmpDir).sort();
  assert.ok(remaining.includes('README.txt'), 'README.txt should survive');
  assert.ok(remaining.includes('.DS_Store'), '.DS_Store should survive');
  assert.ok(remaining.includes('notes.md'), 'notes.md should survive');
  assert.ok(remaining.includes('mindcraft.db.bak-20260103-120000'), 'newest backup should survive');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
