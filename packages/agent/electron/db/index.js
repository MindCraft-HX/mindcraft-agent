'use strict';

/**
 * MindCraft SQLite DB — main entry point.
 *
 * Opens/creates the database in `{userData}/mindcraft.db`,
 * runs migrations, and exposes DAO functions.
 *
 * Dependency: sql.js (pure JS/WASM — no native rebuild required).
 */

const path = require('path');
const fs = require('fs');

const { runMigrations } = require('./migrations/v1_initial');
const { backupDb, readBackupBuffer } = require('./backup');
const providerDao = require('./dao/providers');
const importRunsDao = require('./dao/importRuns');
const chatThreadsDao = require('./dao/chatThreads');
const sessionsDao = require('./dao/sessions');

let initSqlJs = null;

/**
 * Lazily load sql.js. The WASM file is loaded from the sql.js package.
 */
async function loadSqlJs() {
  if (!initSqlJs) {
    try {
      const mod = require('sql.js');
      initSqlJs = mod.default || mod;
    } catch (e) {
      throw new Error(`Failed to load sql.js: ${e.message}`);
    }
  }
  return initSqlJs();
}

/**
 * Open (or create) the MindCraft database, run migrations, return the db instance.
 *
 * @param {object} opts
 * @param {string} opts.userDataDir — app.getPath('userData')
 * @returns {Promise<{ ok: boolean, db: import('sql.js').Database|null, dbPath: string, message: string }>}
 */
async function openMindCraftDb({ userDataDir }) {
  if (!userDataDir || typeof userDataDir !== 'string') {
    return { ok: false, db: null, dbPath: '', message: 'Missing userDataDir' };
  }

  const dbPath = path.join(userDataDir, 'mindcraft.db');

  try {
    // Ensure directory exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const SQL = await loadSqlJs();

    // Load existing DB or create fresh
    let db;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      // No local DB — attempt dev seed from a production profile.
      //
      // This is a ONE-TIME copy, not true sharing.  After the copy, dev and
      // prod have independent DBs that will diverge.  Set MINDCRAFT_SEED_DB_PATH
      // to an explicit DB file to copy from; alternativelly set
      // MINDCRAFT_DEV_BOOTSTRAP_FROM_PROD=1 to auto-detect the production
      // profile sibling directory.
      let seedPath = process.env.MINDCRAFT_SEED_DB_PATH || null;

      if (!seedPath && process.env.MINDCRAFT_DEV_BOOTSTRAP_FROM_PROD === '1') {
        try {
          const { app } = require('electron');
          if (app && !app.isPackaged) {
            const parentDir = path.dirname(userDataDir);
            // Match sibling by production app name, not first random entry
            const prodName = app.getName ? app.getName() : 'mindcraft-agent';
            if (prodName) {
              const candidate = path.join(parentDir, prodName, 'mindcraft.db');
              if (fs.existsSync(candidate)) {
                seedPath = candidate;
              }
            }
          }
        } catch (_) { /* require('electron') may not be available */ }
      }

      if (seedPath) {
        console.log('[db] Dev bootstrap — copying production DB from:', seedPath);
        console.log('[db] NOTE: this is a one-time copy; future writes are independent.');
        fs.copyFileSync(seedPath, dbPath);
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
      } else {
        db = new SQL.Database();
      }
    }

    // Run migrations
    const migrationResult = runMigrations(db, { userDataDir });
    if (!migrationResult.ok) {
      db.close();
      return { ok: false, db: null, dbPath, message: migrationResult.message };
    }

    // Save initial state to disk
    persistToFile(db, dbPath);

    return { ok: true, db, dbPath, message: `Opened ${dbPath} (v${migrationResult.version})` };
  } catch (e) {
    return { ok: false, db: null, dbPath, message: `Open failed: ${e.message}` };
  }
}

/**
 * Close the database and persist to disk.
 *
 * @param {import('sql.js').Database} db
 * @param {string} dbPath — path to save to
 * @returns {{ ok: boolean, message: string }}
 */
function closeMindCraftDb(db, dbPath) {
  try {
    if (db && typeof db.close === 'function') {
      if (dbPath) {
        persistToFile(db, dbPath);
      }
      db.close();
    }
    return { ok: true, message: 'Closed' };
  } catch (e) {
    return { ok: false, message: `Close failed: ${e.message}` };
  }
}

/**
 * Persist the in-memory database to a file on disk.
 * sql.js keeps the DB in memory; this writes it out.
 *
 * @param {import('sql.js').Database} db
 * @param {string} dbPath
 */
function persistToFile(db, dbPath) {
  try {
    const buffer = Buffer.from(db.export());
    const tmpPath = dbPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    // Atomic rename on Windows: remove existing first
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    fs.renameSync(tmpPath, dbPath);
  } catch (e) {
    console.error('[db] persistToFile error:', e.message);
  }
}

/**
 * Create an in-memory database for testing. Runs migrations.
 *
 * @returns {Promise<import('sql.js').Database>}
 */
async function createTestDb() {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  const migResult = runMigrations(db, {});
  if (!migResult.ok) {
    db.close();
    throw new Error(`Migration failed in createTestDb: ${migResult.message}`);
  }
  return db;
}

// ---------------------------------------------------------------------------
// Lazy singleton — shared DB instance, opened once per process
// ---------------------------------------------------------------------------

let _dbPromise = null;
let _dbPath = null;
let _userDataDir = null;

/**
 * Get or create the shared MindCraft DB instance.
 * Subsequent calls with the same userDataDir return the cached db.
 *
 * @param {object} opts
 * @param {string} opts.userDataDir
 * @returns {Promise<import('sql.js').Database>}
 */
async function getDb({ userDataDir }) {
  if (_dbPromise && _userDataDir === userDataDir) {
    return _dbPromise;
  }

  _userDataDir = userDataDir;
  _dbPromise = (async () => {
    const result = await openMindCraftDb({ userDataDir });
    if (!result.ok) {
      throw new Error(`Failed to open MindCraft DB: ${result.message}`);
    }
    _dbPath = result.dbPath;
    return result.db;
  })();

  return _dbPromise;
}

/**
 * Persist the cached DB to disk (for use before app quit).
 */
async function persistDb() {
  if (_dbPromise && _dbPath) {
    try {
      const db = await _dbPromise;
      persistToFile(db, _dbPath);
    } catch (_) { /* ignore */ }
  }
}

module.exports = {
  openMindCraftDb,
  closeMindCraftDb,
  createTestDb,
  getDb,
  persistDb,
  backupDb,
  readBackupBuffer,
  // DAOs
  ...providerDao,
  ...importRunsDao,
  ...chatThreadsDao,
  ...sessionsDao,
};
