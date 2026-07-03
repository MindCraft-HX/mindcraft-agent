'use strict';

/**
 * MindCraft DB migrations.
 *
 * - migrateV1: initial schema (providers + import_runs tables)
 * - migrateV2: add sort_index, projection_status, last_projected_at to providers
 * - runMigrations: run all migrations sequentially
 *
 * Each migration is idempotent — checks PRAGMA user_version before applying.
 */

const {
  V1_PROVIDER_DDL,
  IMPORT_RUNS_DDL,
  INDEXES,
  SCHEMA_VERSION,
} = require('../schema');

/**
 * Apply the initial migration.
 *
 * @param {import('sql.js').Database} db
 * @returns {{ ok: boolean, version: number, message: string }}
 */
function migrateV1(db) {
  // Guard: sql.js Database instance check
  if (!db || typeof db.run !== 'function' || typeof db.exec !== 'function') {
    return { ok: false, version: 0, message: 'Invalid db instance' };
  }

  try {
    const currentVersion = getDbVersion(db);
    if (currentVersion >= 1) {
      return { ok: true, version: currentVersion, message: `Already at v${currentVersion}, no v1 migration needed` };
    }

    db.run(V1_PROVIDER_DDL);
    db.run(IMPORT_RUNS_DDL);
    // Only create pre-v2 indexes here; v2 indexes are added by migrateV2
    for (const idx of INDEXES) {
      // Skip v2 index (added in migrateV2 for v1→v2 path)
      if (idx.includes('idx_providers_agent_sort')) continue;
      db.run(idx);
    }

    db.run('PRAGMA user_version = 1');

    return { ok: true, version: 1, message: 'Migrated to v1' };
  } catch (e) {
    return { ok: false, version: 0, message: `Migration v1 failed: ${e.message}` };
  }
}

/**
 * v2 migration — add provider ordering and projection bookkeeping columns.
 *
 * Adds:
 *   sort_index         INTEGER NOT NULL DEFAULT 0
 *   projection_status  TEXT    NOT NULL DEFAULT 'pending'
 *   last_projected_at  INTEGER
 *   idx_providers_agent_sort index
 *
 * @param {import('sql.js').Database} db
 * @returns {{ ok: boolean, version: number, message: string }}
 */
function migrateV2(db) {
  if (!db || typeof db.run !== 'function' || typeof db.exec !== 'function') {
    return { ok: false, version: 0, message: 'Invalid db instance' };
  }

  const currentVersion = getDbVersion(db);

  try {
    if (currentVersion >= 2) {
      return { ok: true, version: currentVersion, message: `Already at v${currentVersion}, no v2 migration needed` };
    }
    if (currentVersion < 1) {
      return { ok: false, version: currentVersion, message: 'Must run migrateV1 before migrateV2' };
    }

    // Add columns using ALTER TABLE — SQLite supports ADD COLUMN with
    // NOT NULL DEFAULT for constant defaults.
    db.run('ALTER TABLE providers ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0');
    db.run("ALTER TABLE providers ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'pending'");
    db.run('ALTER TABLE providers ADD COLUMN last_projected_at INTEGER');

    // Add the v2-specific index
    db.run('CREATE INDEX IF NOT EXISTS idx_providers_agent_sort ON providers(agent_type, sort_index, updated_at)');

    db.run('PRAGMA user_version = 2');

    return { ok: true, version: 2, message: 'Migrated to v2' };
  } catch (e) {
    return { ok: false, version: currentVersion, message: `Migration v2 failed: ${e.message}` };
  }
}

/**
 * Run all migrations in order to bring the DB to the latest version.
 *
 * @param {import('sql.js').Database} db
 * @returns {{ ok: boolean, version: number, message: string }}
 */
function runMigrations(db) {
  const v1 = migrateV1(db);
  if (!v1.ok) return v1;

  // v1 already ran (or was already at v1+), now v2
  return migrateV2(db);
}

/**
 * Read the current schema version from the database.
 * Returns 0 if the PRAGMA cannot be read (fresh empty DB).
 *
 * @param {import('sql.js').Database} db
 * @returns {number}
 */
function getDbVersion(db) {
  try {
    const result = db.exec('PRAGMA user_version');
    if (result && result.length > 0 && result[0].values && result[0].values.length > 0) {
      return Number(result[0].values[0][0]) || 0;
    }
  } catch (_) { /* ignore */ }
  return 0;
}

module.exports = { migrateV1, migrateV2, runMigrations, getDbVersion };
