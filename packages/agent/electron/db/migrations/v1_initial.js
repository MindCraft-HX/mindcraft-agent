'use strict';

/**
 * v1 — Initial MindCraft DB schema.
 *
 * Idempotent: uses IF NOT EXISTS on tables and indexes.
 * Logs version via PRAGMA user_version so later migrations can detect state.
 */

const {
  PROVIDER_DDL,
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
    if (currentVersion >= SCHEMA_VERSION) {
      return { ok: true, version: currentVersion, message: `Already at v${currentVersion}, no migration needed` };
    }

    db.run(PROVIDER_DDL);
    db.run(IMPORT_RUNS_DDL);
    for (const idx of INDEXES) {
      db.run(idx);
    }

    db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);

    return { ok: true, version: SCHEMA_VERSION, message: `Migrated to v${SCHEMA_VERSION}` };
  } catch (e) {
    return { ok: false, version: 0, message: `Migration failed: ${e.message}` };
  }
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

module.exports = { migrateV1, getDbVersion };
