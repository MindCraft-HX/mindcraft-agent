'use strict';

/**
 * Database backup helpers.
 *
 * Uses sql.js's `db.export()` to produce a complete in-memory snapshot,
 * then writes it to a timestamped file.
 */

const fs = require('fs');
const path = require('path');

/**
 * Create a timestamped backup of the database.
 *
 * @param {import('sql.js').Database} db
 * @param {object} opts
 * @param {string} opts.userDataDir — app.getPath('userData')
 * @param {string} [opts.label] — optional label for the backup filename
 * @returns {{ ok: boolean, backupPath: string, message: string }}
 */
function backupDb(db, { userDataDir, label = '' }) {
  if (!db || typeof db.export !== 'function') {
    return { ok: false, backupPath: '', message: 'Invalid db instance' };
  }

  try {
    const backupDir = path.join(userDataDir, 'db-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    const labelPart = label ? `.${label.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
    const fileName = `mindcraft.db${labelPart}.bak-${stamp}`;
    const backupPath = path.join(backupDir, fileName);

    const buffer = Buffer.from(db.export());
    fs.writeFileSync(backupPath, buffer);

    return { ok: true, backupPath, message: `Backup saved to ${backupPath}` };
  } catch (e) {
    return { ok: false, backupPath: '', message: `Backup failed: ${e.message}` };
  }
}

/**
 * Restore the database from a backup file.
 * Returns a new sql.js buffer that can be passed to `new SQL.Database(buffer)`.
 *
 * @param {string} backupPath — full path to backup file
 * @returns {{ ok: boolean, buffer: Buffer|null, message: string }}
 */
function readBackupBuffer(backupPath) {
  try {
    if (!fs.existsSync(backupPath)) {
      return { ok: false, buffer: null, message: `Backup file not found: ${backupPath}` };
    }
    const buffer = fs.readFileSync(backupPath);
    return { ok: true, buffer, message: `Read ${buffer.length} bytes` };
  } catch (e) {
    return { ok: false, buffer: null, message: `Read backup failed: ${e.message}` };
  }
}

module.exports = { backupDb, readBackupBuffer };
