'use strict';

/**
 * Session Repository — T201 authoritative session store facade.
 *
 * Wraps the sessions DAO (SQLite) with session-registry JSON fallback for reads.
 * Writes go exclusively to SQLite.  Drafts and instructions are delegated back
 * to sessionRegistry.js (unchanged).
 *
 * After the compatibility window, the JSON fallback can be removed and the
 * sessionRegistry.js identity/runtime functions can be retired.
 */

const path = require('path');
const fs = require('fs');

// Lazy — avoids circular dependency at module load time
let _sessionsDao = null;
let _sessionRegistry = null;

function sessionsDao() {
  if (!_sessionsDao) _sessionsDao = require('./db/dao/sessions');
  return _sessionsDao;
}

function sessionRegistry() {
  if (!_sessionRegistry) _sessionRegistry = require('./sessionRegistry');
  return _sessionRegistry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return Math.floor(Date.now() / 1000);
}

/** Convert DAO session row → registry-shaped record (camelCase, nested provider). */
function daoRowToRecord(row, binding, runtime) {
  if (!row) return null;
  const record = {
    chatKey: row.chatKey,
    agent: row.agent,
    projectId: row.projectId,
    cwd: row.cwd,
    title: row.title,
    titleSource: row.titleSource,
    description: row.description,
    metadata: row.metadata || {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (binding) {
    record.provider = {
      cliSessionId: binding.cliSessionId || '',
      filePath: binding.filePath || '',
      source: binding.source || 'scan',
      detached: binding.detached || false,
      resumeAllowed: binding.resumeAllowed !== false,
    };
  }
  if (runtime) {
    record.runtime = {
      model: runtime.model || '',
      effort: runtime.effort || undefined,
      modelTier: runtime.modelTier || '',
      reasoningEffort: runtime.reasoningEffort || undefined,
    };
  }
  return record;
}

/** Convert registry-shaped record → DAO params. */
function recordToDaoParams(record) {
  return {
    chatKey: record.chatKey,
    agent: record.agent || '',
    projectId: record.projectId || '',
    cwd: record.cwd || '',
    title: record.title || '',
    titleSource: record.titleSource || '',
    description: record.description || '',
    metadata: record.metadata || {},
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : now(),
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now(),
  };
}

// ---------------------------------------------------------------------------
// Read paths (SQLite → JSON fallback)
// ---------------------------------------------------------------------------

/**
 * List all sessions.  Falls back to session-registry JSON if DB is empty.
 *
 * @param {import('sql.js').Database} db
 * @param {object} [opts]
 * @param {string} [opts.agent]
 * @param {boolean} [opts.registryFallback=true]
 * @returns {Array<object>}
 */
function listSessions(db, { agent, registryFallback = true } = {}) {
  const dao = sessionsDao();
  let rows = dao.listSessions(db, { agent });

  if (rows.length === 0 && registryFallback) {
    const reg = sessionRegistry();
    const records = reg.listSessionRecords?.() || [];
    if (agent) {
      return records.filter(r => (r.agent || '') === agent);
    }
    return records;
  }

  // Enrich with bindings + runtime
  return rows.map(row => {
    const bindings = dao.listSessionBindings(db, row.chatKey);
    const runtime = dao.getSessionRuntime(db, row.chatKey);
    return daoRowToRecord(row, bindings[0], runtime);
  });
}

/**
 * Get a single session by chatKey.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @param {object} [opts]
 * @param {boolean} [opts.registryFallback=true]
 * @returns {object|null}
 */
function getSession(db, chatKey, { registryFallback = true } = {}) {
  const dao = sessionsDao();
  const row = dao.getSession(db, chatKey);
  if (row) {
    const bindings = dao.listSessionBindings(db, chatKey);
    const runtime = dao.getSessionRuntime(db, chatKey);
    return daoRowToRecord(row, bindings[0], runtime);
  }

  if (registryFallback) {
    const reg = sessionRegistry();
    // Try reading the JSON file directly (sessionRegistry records use chatKey as filename)
    const record = reg.listSessionRecords?.()?.find(r => r.chatKey === chatKey);
    return record || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Write paths (SQLite only)
// ---------------------------------------------------------------------------

/**
 * Upsert a session record into SQLite.
 *
 * @param {import('sql.js').Database} db
 * @param {object} record
 * @returns {{ ok: boolean, error?: string }}
 */
function upsertSession(db, record) {
  const dao = sessionsDao();
  const params = recordToDaoParams(record);
  return dao.upsertSession(db, params);
}

/**
 * Delete a session from SQLite.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @returns {{ ok: boolean }}
 */
function deleteSession(db, chatKey) {
  return sessionsDao().deleteSession(db, chatKey);
}

/**
 * Set session title. Writes to SQLite (identity field).
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @param {string} title
 * @param {object} [opts]
 * @returns {{ ok: boolean }}
 */
function setSessionTitle(db, chatKey, title, opts = {}) {
  if (!db) return { ok: false, error: 'DB unavailable' };
  const dao = sessionsDao();
  const row = dao.getSession(db, chatKey);
  const record = row || { chatKey, createdAt: now() };
  record.title = String(title || '');
  record.titleSource = 'user';
  record.updatedAt = now();
  record.agent = record.agent || opts.agent || '';
  const result = dao.upsertSession(db, recordToDaoParams(record));
  return result;
}

// ---------------------------------------------------------------------------
// Provider binding
// ---------------------------------------------------------------------------

/**
 * Build all candidate provider keys from scan info.  Both cliSessionId and
 * filePath forms are emitted so the same session can be found regardless of
 * which identifier the scan first discovered.
 *
 * @param {string} agent
 * @param {object} scanInfo — { cliSessionId, filePath }
 * @returns {string[]}
 */
function buildProviderKeys(agent, scanInfo = {}) {
  const keys = [];
  if (scanInfo.cliSessionId) keys.push(`${agent}::${scanInfo.cliSessionId}`);
  if (scanInfo.filePath && scanInfo.filePath !== scanInfo.cliSessionId) {
    keys.push(`${agent}::${scanInfo.filePath}`);
  }
  return keys;
}

/**
 * Resolve a session by provider keys (for use by provider scan).
 *
 * @param {import('sql.js').Database} db
 * @param {string} agent
 * @param {object} scanInfo — { cliSessionId, filePath }
 * @param {object} [opts]
 * @returns {object|null}
 */
function findByProviderScan(db, agent, scanInfo = {}, opts = {}) {
  const dao = sessionsDao();
  const keys = buildProviderKeys(agent, scanInfo);
  for (const providerKey of keys) {
    const row = dao.findSessionByProviderKey(db, providerKey);
    if (row) {
      const runtime = dao.getSessionRuntime(db, row.chatKey);
      return daoRowToRecord(row, row.provider, runtime);
    }
  }
  return null;
}

/**
 * Ensure a session record exists for a provider scan entry.  Creates or
 * updates the SQLite row.  Mirrors `ensureRegistryFromProviderScan`.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agent
 * @param {object} scanSummary — provider scan result
 * @param {object} project — { cwd, projectId }
 * @returns {object|null} — the resolved session record
 */
function ensureFromProviderScan(db, agent, scanSummary = {}, project = {}) {
  const dao = sessionsDao();
  const keys = buildProviderKeys(agent, scanSummary);
  if (!keys.length) return null;

  // Try all candidate keys to find an existing row
  let row = null;
  for (const key of keys) {
    row = dao.findSessionByProviderKey(db, key);
    if (row) break;
  }

  // Build record from existing or create new
  const chatKey = row?.chatKey || `${agent}::scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowTs = now();

  const record = row ? daoRowToRecord(row, row.provider) : {
    chatKey,
    agent,
    projectId: project.projectId || '',
    cwd: project.cwd || '',
    title: scanSummary.title || '',
    titleSource: scanSummary.titleSource || 'scan',
    description: scanSummary.description || '',
    metadata: {},
    createdAt: nowTs,
    updatedAt: nowTs,
  };

  // Merge scan summary fields
  if (scanSummary.title && (!record.title || record.titleSource !== 'user')) {
    record.title = scanSummary.title;
    record.titleSource = scanSummary.titleSource || 'scan';
  }
  record.updatedAt = nowTs;

  // Save
  dao.upsertSession(db, recordToDaoParams(record));

  // Save bindings for ALL provider keys (both cliSessionId and filePath)
  for (const providerKey of keys) {
    dao.upsertSessionBinding(db, {
      chatKey: record.chatKey,
      providerKey,
      cliSessionId: scanSummary.cliSessionId || '',
      filePath: scanSummary.filePath || '',
      source: 'scan',
      detached: false,
      resumeAllowed: true,
      updatedAt: nowTs,
    });
  }

  // Save runtime if present
  if (scanSummary.model || scanSummary.effort) {
    dao.upsertSessionRuntime(db, record.chatKey, {
      model: scanSummary.model || '',
      effort: scanSummary.effort || undefined,
      modelTier: scanSummary.modelTier || '',
      reasoningEffort: scanSummary.reasoningEffort || undefined,
    });
  }

  const rt = dao.getSessionRuntime(db, record.chatKey);
  return daoRowToRecord(record, {
    cliSessionId: scanSummary.cliSessionId || '',
    filePath: scanSummary.filePath || '',
    source: 'scan',
    detached: false,
    resumeAllowed: true,
  }, rt);
}

/**
 * Merge registry fields into a scan summary (pure function, no DB).
 *
 * @param {string} agent
 * @param {object} scanSummary
 * @param {object|null} record
 * @returns {object} — enriched scan summary
 */
function mergeRegistryFields(agent, scanSummary = {}, record = null) {
  if (!record) return scanSummary;
  // Match legacy mergeRegistryFieldsIntoScanSummary contract:
  // SQLite (registry) fields take priority over scan summary fields.
  return {
    ...scanSummary,
    chatKey: record.chatKey || scanSummary.chatKey || '',
    title: record.title || scanSummary.title || scanSummary.name || '',
    name: record.title || scanSummary.name || scanSummary.title || '',
    titleSource: record.titleSource || scanSummary.titleSource || '',
    cliSessionId: record.provider?.cliSessionId || scanSummary.cliSessionId || scanSummary.id || '',
    filePath: record.provider?.filePath || scanSummary.filePath || '',
    model: record.runtime?.model || scanSummary.model || '',
    effort: record.runtime?.effort || scanSummary.effort || '',
    modelTier: record.runtime?.modelTier || scanSummary.modelTier || '',
    reasoningEffort: record.runtime?.reasoningEffort || scanSummary.reasoningEffort || '',
  };
}

/**
 * Upsert session runtime from provider data.
 *
 * @param {import('sql.js').Database} db
 * @param {object} args
 * @param {string} args.agent
 * @param {string} [args.filePath]
 * @param {string} [args.cliSessionId]
 * @param {string} args.chatKey
 * @param {object} args.runtime — { model, effort, modelTier, reasoningEffort }
 * @returns {{ ok: boolean }}
 */
function upsertRuntimeByProvider(db, { agent, filePath, cliSessionId, chatKey, runtime } = {}) {
  const dao = sessionsDao();
  if (!chatKey) return { ok: false, error: 'Missing chatKey' };

  // Ensure binding exists
  if (filePath || cliSessionId) {
    const providerKey = `${agent || ''}::${cliSessionId || filePath || ''}`;
    if (providerKey && providerKey !== `${agent || ''}::`) {
      dao.upsertSessionBinding(db, {
        chatKey, providerKey,
        cliSessionId: cliSessionId || '',
        filePath: filePath || '',
        source: 'scan',
        updatedAt: now(),
      });
    }
  }

  // Ensure session row exists
  const row = dao.getSession(db, chatKey);
  if (!row) {
    dao.upsertSession(db, {
      chatKey,
      agent: agent || '',
      createdAt: now(),
      updatedAt: now(),
    });
  }

  return dao.upsertSessionRuntime(db, chatKey, runtime || {});
}

// ---------------------------------------------------------------------------
// Draft / Instruction (delegated to sessionRegistry.js)
// ---------------------------------------------------------------------------

function getSessionDraft(chatKey, opts) {
  return sessionRegistry().getSessionDraft(chatKey, opts);
}

function setSessionDraft(chatKey, data, opts) {
  return sessionRegistry().setSessionDraft(chatKey, data, opts);
}

function clearSessionDraft(chatKey, opts) {
  return sessionRegistry().clearSessionDraft(chatKey, opts);
}

function getSessionInstruction(chatKey, opts) {
  return sessionRegistry().getSessionInstruction(chatKey, opts);
}

function setSessionInstruction(chatKey, data, opts) {
  return sessionRegistry().setSessionInstruction(chatKey, data, opts);
}

// ---------------------------------------------------------------------------
// Backfill / population check
// ---------------------------------------------------------------------------

/**
 * Check whether the sessions table has any rows.
 *
 * @param {import('sql.js').Database} db
 * @returns {boolean}
 */
function isDbPopulated(db) {
  try {
    const result = db.exec('SELECT COUNT(*) FROM sessions');
    if (!result || result.length === 0) return false;
    return Number(result[0].values[0][0]) > 0;
  } catch (_) {
    return false;
  }
}

/**
 * One-shot backfill from session-registry JSON → SQLite.
 * Source files are NOT deleted.
 *
 * @param {import('sql.js').Database} db
 * @param {object} [opts]
 * @param {string} [opts.userDataDir]
 * @returns {{ ok: boolean, count: number }}
 */
function backfillFromRegistry(db, { userDataDir } = {}) {
  const dao = sessionsDao();
  let count = 0;

  const registryDir = userDataDir
    ? path.join(userDataDir, 'session-registry', 'sessions')
    : null;

  if (!registryDir || !fs.existsSync(registryDir)) {
    return { ok: true, count: 0 };
  }

  try {
    const files = fs.readdirSync(registryDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      let record;
      try {
        record = JSON.parse(fs.readFileSync(path.join(registryDir, file), 'utf8'));
      } catch (_) { continue; }
      if (!record || !record.chatKey) continue;

      // Session identity
      dao.upsertSession(db, recordToDaoParams(record));

      // Provider binding
      const provider = record.provider;
      if (provider && (provider.cliSessionId || provider.filePath)) {
        const agent = record.agent || '';
        const providerKey = `${agent}::${provider.cliSessionId || provider.filePath}`;
        dao.upsertSessionBinding(db, {
          chatKey: record.chatKey,
          providerKey,
          cliSessionId: String(provider.cliSessionId || ''),
          filePath: String(provider.filePath || ''),
          source: provider.source || 'scan',
          detached: provider.detached ? 1 : 0,
          resumeAllowed: record.metadata?.resumeAllowed !== false ? 1 : 0,
          updatedAt: record.updatedAt || now(),
        });
      }

      // Runtime
      const runtime = record.runtime;
      if (runtime && (runtime.model || runtime.effort)) {
        dao.upsertSessionRuntime(db, record.chatKey, runtime);
      }

      count++;
    }
  } catch (e) {
    console.error('[sessionRepository] backfill error:', e.message);
    return { ok: false, count, error: e.message };
  }

  return { ok: true, count };
}

/**
 * Restore panel state from SQLite.  Mirrors `restorePanelStateFromSessionRegistry`
 * but reads from the authoritative SQLite store.  Ensures sessions created after
 * T201 (which only write to SQLite) are visible in the panel.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agent
 * @param {object} panelState
 * @returns {{ changed: boolean, added: number, panelState: object }}
 */
function restorePanelState(db, agent, panelState) {
  const dao = sessionsDao();
  const rows = dao.listSessions(db);
  if (!rows.length) return { changed: false, added: 0, panelState };

  const projects = Array.isArray(panelState?.projects) ? panelState.projects.slice() : [];
  let added = 0;
  let repaired = 0;

  for (const row of rows) {
    const binding = dao.listSessionBindings(db, row.chatKey)[0];
    const runtime = dao.getSessionRuntime(db, row.chatKey);
    const record = daoRowToRecord(row, binding, runtime);
    if (record.agent !== agent) continue;
    const recordCwd = String(record.cwd || '').trim();
    const recordProjectId = String(record.projectId || '').trim();

    // Find matching project by cwd or projectId
    let project = projects.find(p =>
      (recordCwd && p.cwd === recordCwd) ||
      (recordProjectId && p.id === recordProjectId)
    );

    if (project && recordCwd) {
      const prevCwd = String(project.cwd || '').trim();
      const prevLocked = Boolean(project.cwdLocked);
      const nextName = path.basename(recordCwd) || 'New Project';
      const shouldRepairCwd = !prevCwd || (recordProjectId && String(project.id || '').trim() === recordProjectId && prevCwd !== recordCwd);
      if (shouldRepairCwd) {
        project.cwd = recordCwd;
        project.cwdLocked = true;
        if (!project.name || project.name === 'New Project' || project.name === '新项目' || !prevCwd) {
          project.name = nextName;
        }
        if (prevCwd !== recordCwd || !prevLocked) repaired += 1;
      }
    }

    if (!project) {
      if (!recordCwd && !recordProjectId) continue;
      const baseId = recordProjectId || `proj-sqlite-${projects.length + 1}`;
      project = {
        id: baseId,
        name: recordCwd ? path.basename(recordCwd) || 'New Project' : 'New Project',
        cwd: recordCwd,
        cwdLocked: Boolean(recordCwd),
        hasDoneNotification: false,
        additionalDirectories: [],
        chats: [],
      };
      projects.push(project);
    }

    if (!Array.isArray(project.chats)) project.chats = [];
    if (project.chats.some(c => c.sessionId === record.chatKey)) continue;

    // Build panel chat from record
    const provider = record.provider || {};
    const rt = record.runtime || {};
    const fp = provider.filePath || '';
    const fileExists = Boolean(fp && fs.existsSync(fp));
    const resumeAllowed = provider.resumeAllowed !== false && (!fp || fileExists);
    if (fp && !fileExists && !resumeAllowed) continue;
    project.chats.push({
      id: `chat-${record.chatKey}`,
      name: record.title || 'New Chat',
      sessionId: record.chatKey,
      messages: [],
      metrics: null,
      model: rt.model || null,
      reasoningEffort: rt.reasoningEffort || null,
      sandboxMode: null,
      networkAccessEnabled: null,
      webSearchMode: null,
      _thinkingStart: null,
      _awaitingDone: false,
      cliSessionId: provider.cliSessionId || null,
      filePath: fp || null,
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      fileSize: fileExists ? fs.statSync(fp).size : null,
      titleSource: record.titleSource || '',
      _userRenamed: record.titleSource === 'user',
      _resumeAllowed: resumeAllowed,
    });
    added += 1;
  }

  return { changed: added > 0 || repaired > 0, added, repaired, panelState: { ...panelState, projects } };
}

module.exports = {
  listSessions,
  getSession,
  upsertSession,
  deleteSession,
  setSessionTitle,
  findByProviderScan,
  ensureFromProviderScan,
  mergeRegistryFields,
  upsertRuntimeByProvider,
  restorePanelState,
  getSessionDraft,
  setSessionDraft,
  clearSessionDraft,
  getSessionInstruction,
  setSessionInstruction,
  isDbPopulated,
  backfillFromRegistry,
};
