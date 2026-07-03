'use strict';

/**
 * DB maintenance helpers.
 *
 * Provides bounded cleanup for import_runs and DB backups so the DB
 * and backup directory don't grow without bound.
 *
 * Retention policy:
 *   - import_runs: latest 200 rows or latest 90 days, whichever is larger
 *   - DB backups:    latest 20 files per backup label family
 */

const path = require('path');
const fs = require('fs');
const { listImportRuns } = require('./dao/importRuns');

// ---------------------------------------------------------------------------
// Import runs cleanup
// ---------------------------------------------------------------------------

/**
 * Delete old import runs beyond the retention window.
 *
 * Keeps the latest `maxRows` records OR all records from the last
 * `maxDays` days, whichever preserves more rows.
 *
 * @param {import('sql.js').Database} db
 * @param {{ maxRows?: number, maxDays?: number }} opts
 * @returns {{ ok: boolean, deleted: number, kept: number }}
 */
function cleanupImportRuns(db, { maxRows = 200, maxDays = 90 } = {}) {
  try {
    const all = listImportRuns(db, { limit: 999999 }); // effectively unlimited
    if (all === null) {
      return { ok: false, deleted: 0, kept: 0, error: 'Failed to list import runs' };
    }
    if (all.length === 0) return { ok: true, deleted: 0, kept: 0 };

    const now = Math.floor(Date.now() / 1000);
    const cutoffByDays = now - (maxDays * 24 * 60 * 60);

    // Sort by created_at DESC (already returned this way from listImportRuns)
    // but let's be safe and sort
    const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt);

    // Determine the cutoff index: max of (maxRows, first record older than maxDays)
    let cutoffIdx = Math.min(maxRows, sorted.length);
    for (let i = cutoffIdx; i < sorted.length; i++) {
      if (sorted[i].createdAt > cutoffByDays) {
        cutoffIdx = i + 1;
      } else {
        break;
      }
    }

    // Delete records beyond the cutoff
    const toDelete = sorted.slice(cutoffIdx);
    if (toDelete.length === 0) {
      return { ok: true, deleted: 0, kept: sorted.length };
    }

    const stmt = db.prepare('DELETE FROM import_runs WHERE id = ?');
    try {
      db.run('BEGIN');
      for (const record of toDelete) {
        stmt.bind([record.id]);
        stmt.step();
        stmt.reset();
      }
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      return { ok: false, deleted: 0, kept: sorted.length, error: e.message };
    } finally {
      stmt.free();
    }

    return { ok: true, deleted: toDelete.length, kept: sorted.length - toDelete.length };
  } catch (e) {
    console.error('[maintenance] cleanupImportRuns error:', e.message);
    return { ok: false, deleted: 0, kept: 0, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Backup cleanup
// ---------------------------------------------------------------------------

/**
 * Delete old database backups, keeping the latest `maxFiles` per label family.
 *
 * Backup files are expected to follow the naming pattern:
 *   mindcraft.db[.label].bak-YYYYMMDD-HHmmss
 *
 * Files are sorted by name (which sorts by timestamp) and the oldest
 * are deleted until only `maxFiles` remain per label.
 *
 * @param {string} backupsDir — path to the db-backups directory
 * @param {{ maxFiles?: number }} opts
 * @returns {{ ok: boolean, deleted: number, kept: number, errors: string[] }}
 */
function cleanupBackups(backupsDir, { maxFiles = 20 } = {}) {
  const result = { ok: false, deleted: 0, kept: 0, errors: [] };

  try {
    if (!fs.existsSync(backupsDir)) {
      return { ok: true, deleted: 0, kept: 0 };
    }

    const files = fs.readdirSync(backupsDir);

    // Group by label family
    // Pattern: mindcraft.db[.label].bak-TIMESTAMP
    const BACKUP_RE = /^mindcraft\.db(\.[a-zA-Z0-9_-]+)?\.bak-\d{8}-\d{6}$/;
    const groups = new Map();

    for (const name of files) {
      // Skip files that don't match the backup naming convention
      if (!BACKUP_RE.test(name)) continue;

      let label = '';
      const base = name.replace(/^mindcraft\.db/, '');
      if (base.startsWith('.')) {
        const labelEnd = base.indexOf('.bak-');
        if (labelEnd > 0) {
          label = base.slice(1, labelEnd);
        }
      }

      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label).push(name);
    }

    let totalDeleted = 0;
    let totalKept = 0;

    for (const [label, names] of groups) {
      // Sort by name (which embeds ISO timestamp, so lexical sort = chronological)
      names.sort();
      const toKeep = names.slice(-maxFiles);
      const toDelete = names.length > maxFiles ? names.slice(0, names.length - maxFiles) : [];

      totalKept += toKeep.length;

      for (const name of toDelete) {
        try {
          fs.unlinkSync(path.join(backupsDir, name));
          totalDeleted++;
        } catch (e) {
          result.errors.push(`Failed to delete ${name}: ${e.message}`);
        }
      }
    }

    result.ok = result.errors.length === 0;
    result.deleted = totalDeleted;
    result.kept = totalKept;
    return result;
  } catch (e) {
    result.errors.push(e.message);
    return result;
  }
}

module.exports = {
  cleanupImportRuns,
  cleanupBackups,
};
