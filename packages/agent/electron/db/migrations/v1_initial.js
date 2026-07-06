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
  CHAT_THREADS_DDL,
  INDEXES,
  SCHEMA_VERSION,
} = require('../schema');
const { normalizeClaudeProviderStorageShape } = require('../providerStorage/claudeShape');
const path = require('path');
const fs = require('fs');

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
      // Skip indexes that belong to later migrations
      if (idx.includes('idx_providers_agent_sort')) continue;   // added in v2
      if (idx.includes('idx_chat_threads')) continue;           // added in v4
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
 * v4 migration: create chat_threads table for Simple Chat session metadata.
 *
 * Optionally migrates data from old `{userData}/chat-sessions/` JSON files
 * into the new SQLite metadata + messages.jsonl layout.
 *
 * Old files are NOT deleted — they serve as manual rollback.
 *
 * @param {import('sql.js').Database} db
 * @param {object} [opts]
 * @param {string} [opts.userDataDir]
 * @returns {{ ok: boolean, version: number, message: string, migrated?: number }}
 */
function migrateV4(db, { userDataDir } = {}) {
  if (!db || typeof db.run !== 'function' || typeof db.exec !== 'function') {
    return { ok: false, version: 0, message: 'Invalid db instance' };
  }

  const currentVersion = getDbVersion(db);

  try {
    if (currentVersion >= 4) {
      return { ok: true, version: currentVersion, message: 'Already at v4, no migration needed', migrated: 0 };
    }
    if (currentVersion < 3) {
      return { ok: false, version: currentVersion, message: 'Must run migrateV3 before migrateV4' };
    }

    // Create table
    db.run(CHAT_THREADS_DDL);

    // Create index
    db.run('CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at DESC)');

    // Data migration from old chat-sessions/ if available
    let migrated = 0;
    if (userDataDir && typeof userDataDir === 'string') {
      const oldDir = path.join(userDataDir, 'chat-sessions');
      try {
        if (fs.existsSync(oldDir)) {
          // Read old index.json for session list
          const indexPath = path.join(oldDir, 'index.json');
          let sessionIds = [];
          if (fs.existsSync(indexPath)) {
            try {
              const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
              sessionIds = (idx.sessions || []).map(s => s.id).filter(Boolean);
            } catch (_) { /* index.json corrupt, fall through */ }
          }

          // If no index, scan *.json files (skip index.json)
          if (sessionIds.length === 0) {
            const files = fs.readdirSync(oldDir).filter(f => f.endsWith('.json') && f !== 'index.json');
            sessionIds = files.map(f => f.replace(/\.json$/, ''));
          }

          // Phase 1: read all old session data first (no transaction yet)
          const sessionDataList = [];
          for (const id of sessionIds) {
            const filePath = path.join(oldDir, `${id}.json`);
            if (!fs.existsSync(filePath)) continue;

            let data;
            try {
              data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (_) { continue; }

            if (!data || typeof data !== 'object') continue;
            sessionDataList.push({ id, data });
          }

          // Phase 2: SQLite transaction — metadata INSERTs only
          db.run('BEGIN');
          try {
            for (const { id, data } of sessionDataList) {
              db.run(
                `INSERT OR IGNORE INTO chat_threads (id, title, created_at, updated_at, provider, model, thinking_level, web_search_enabled, context_summary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  String(data.id || id),
                  String(data.title || ''),
                  typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
                  typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
                  String(data.provider || 'claude'),
                  String(data.model || ''),
                  String(data.thinkingLevel || 'off'),
                  data.webSearchEnabled ? 1 : 0,
                  String(data.contextSummary || ''),
                ],
              );
            }
            db.run('COMMIT');
          } catch (e) {
            db.run('ROLLBACK');
            throw e;
          }

          // Phase 3: filesystem writes (outside SQLite transaction)
          const newMsgDir = path.join(userDataDir, 'simple-chat', 'threads');
          for (const { id, data } of sessionDataList) {
            const messages = Array.isArray(data.messages) ? data.messages : [];
            if (messages.length > 0) {
              const threadDir = path.join(newMsgDir, id);
              if (!fs.existsSync(threadDir)) {
                fs.mkdirSync(threadDir, { recursive: true });
              }
              const msgFile = path.join(threadDir, 'messages.jsonl');
              const lines = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
              fs.writeFileSync(msgFile, lines, 'utf8');
            }
            migrated++;
          }
        }
      } catch (e) {
        console.error('[migrateV4] data migration error:', e.message);
        // Schema migration still succeeded; data migration failure is non-fatal
      }
    }

    db.run('PRAGMA user_version = 4');

    return { ok: true, version: 4, message: `Migrated to v4; data migration: ${migrated} sessions`, migrated };
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (_) {}
    return { ok: false, version: currentVersion, message: `Migration v4 failed: ${e.message}` };
  }
}

/**
 * Run all migrations in order to bring the DB to the latest version.
 *
 * @param {import('sql.js').Database} db
 * @param {object} [opts]
 * @param {string} [opts.userDataDir] — required for v4 data migration
 * @returns {{ ok: boolean, version: number, message: string }}
 */
function runMigrations(db, opts = {}) {
  const v1 = migrateV1(db);
  if (!v1.ok) return v1;

  const v2 = migrateV2(db);
  if (!v2.ok) return v2;

  const v3 = migrateV3(db);
  if (!v3.ok) return v3;

  return migrateV4(db, opts);
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

module.exports = { migrateV1, migrateV2, migrateV3, migrateV4, runMigrations, getDbVersion };
