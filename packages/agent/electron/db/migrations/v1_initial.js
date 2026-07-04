'use strict';

/**
 * MindCraft DB migrations.
 *
 * - migrateV1: initial schema (providers + import_runs tables)
 * - migrateV2: add sort_index, projection_status, last_projected_at to providers
 * - migrateV3: one-time cleanup for historical Claude provider config pollution
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
const { normalizeClaudeProviderStorageShape } = require('../providerStorage/claudeShape');

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
 * v3 migration: move historical MindCraft-only Claude provider fields out of
 * config_json and into metadata_json.
 *
 * This is a data cleanup, not a schema change. It removes old pollution such as
 * theme/website/note/permissionPolicy/app language from provider config JSON
 * while preserving website/note/language/permissionPolicy through metadata.
 *
 * @param {import('sql.js').Database} db
 * @returns {{ ok: boolean, version: number, message: string, changed?: number }}
 */
function migrateV3(db) {
  if (!db || typeof db.run !== 'function' || typeof db.exec !== 'function') {
    return { ok: false, version: 0, message: 'Invalid db instance' };
  }

  const currentVersion = getDbVersion(db);

  try {
    if (currentVersion >= 3) {
      return { ok: true, version: currentVersion, message: `Already at v${currentVersion}, no v3 migration needed`, changed: 0 };
    }
    if (currentVersion < 2) {
      return { ok: false, version: currentVersion, message: 'Must run migrateV2 before migrateV3' };
    }

    const result = db.exec("SELECT id, config_json, metadata_json FROM providers WHERE agent_type = 'claude'");
    const rows = result && result.length > 0 ? result[0].values : [];
    let changed = 0;

    db.run('BEGIN');
    const stmt = db.prepare('UPDATE providers SET config_json = ?, metadata_json = ?, updated_at = ? WHERE id = ?');
    const now = Math.floor(Date.now() / 1000);

    try {
      for (const [id, configJson, metadataJson] of rows) {
        const config = parseJsonObject(configJson);
        const metadata = parseJsonObject(metadataJson);
        const normalized = normalizeClaudeProviderStorageShape({ config, metadata });
        const nextConfigJson = JSON.stringify(normalized.config || {});
        const nextMetadataJson = JSON.stringify(normalized.metadata || {});

        if (nextConfigJson !== JSON.stringify(config) || nextMetadataJson !== JSON.stringify(metadata)) {
          stmt.bind([nextConfigJson, nextMetadataJson, now, id]);
          stmt.step();
          stmt.reset();
          changed++;
        }
      }
    } finally {
      stmt.free();
    }

    db.run('PRAGMA user_version = 3');
    db.run('COMMIT');

    return { ok: true, version: 3, message: `Migrated to v3; cleaned ${changed} Claude providers`, changed };
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (_) {}
    return { ok: false, version: currentVersion, message: `Migration v3 failed: ${e.message}` };
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
  const v2 = migrateV2(db);
  if (!v2.ok) return v2;

  return migrateV3(db);
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

function parseJsonObject(str) {
  try {
    const parsed = JSON.parse(str || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

module.exports = { migrateV1, migrateV2, migrateV3, runMigrations, getDbVersion };
