'use strict';

/**
 * Import Runs DAO — log import operations for audit trail and rollback.
 */

const { v4: uuidv4 } = require('uuid');

function timestamp() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Record an import run.
 *
 * @param {import('sql.js').Database} db
 * @param {object} run
 * @param {string} [run.id] — UUID, auto-generated if missing
 * @param {string} run.source — 'cc-switch' | 'local-cli'
 * @param {string} [run.sourcePath] — file path of the imported file
 * @param {object} [run.summary] — { imported, skipped, warnings }
 * @returns {{ ok: boolean, id: string }}
 */
function recordImportRun(db, run) {
  if (!run || !run.source) {
    return { ok: false, id: '', error: 'Missing required field: source' };
  }

  const id = run.id || uuidv4();
  const source = run.source;
  const sourcePath = run.sourcePath || null;
  const summaryJson = JSON.stringify(run.summary || {});
  const createdAt = timestamp();

  try {
    db.run(
      'INSERT INTO import_runs (id, source, source_path, summary_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, source, sourcePath, summaryJson, createdAt],
    );
    return { ok: true, id };
  } catch (e) {
    console.error('[importRuns DAO] recordImportRun error:', e.message);
    return { ok: false, id: '', error: e.message };
  }
}

/**
 * List recent import runs, newest first.
 *
 * @param {import('sql.js').Database} db
 * @param {object} [opts]
 * @param {number} [opts.limit=20]
 * @returns {Array<object>}
 */
function listImportRuns(db, { limit = 20 } = {}) {
  try {
    const result = db.exec(
      'SELECT id, source, source_path, summary_json, created_at FROM import_runs ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
    if (!result || result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0],
      source: row[1],
      sourcePath: row[2],
      summary: (() => { try { return JSON.parse(row[3] || '{}'); } catch (_) { return {}; } })(),
      createdAt: row[4],
    }));
  } catch (e) {
    console.error('[importRuns DAO] listImportRuns error:', e.message);
    return null;
  }
}

module.exports = { recordImportRun, listImportRuns };
