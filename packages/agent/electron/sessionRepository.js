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

function toUnixSeconds(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value > 100000000000 ? value / 1000 : value);
  }
  if (typeof value === 'string' && value.trim()) {
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return Math.floor(timestamp / 1000);
  }
  return 0;
}

function toUnixMilliseconds(value) {
  const seconds = toUnixSeconds(value);
  return seconds ? seconds * 1000 : 0;
}

function isOwnedProviderBinding(binding = {}) {
  return Boolean(
    binding.cliSessionId &&
    binding.detached !== true &&
    binding.resumeAllowed !== false &&
    (binding.source === 'user' || binding.source === 'runtime')
  );
}

function selectOwnedProviderBinding(bindings = []) {
  const uniqueByThread = new Map();
  for (const binding of bindings) {
    if (!isOwnedProviderBinding(binding)) continue;
    const threadId = String(binding.cliSessionId);
    const current = uniqueByThread.get(threadId);
    const currentRank = current?.source === 'user' ? 0 : 1;
    const nextRank = binding.source === 'user' ? 0 : 1;
    if (!current || nextRank < currentRank || (
      nextRank === currentRank && toUnixSeconds(binding.updatedAt) < toUnixSeconds(current.updatedAt)
    )) {
      uniqueByThread.set(threadId, binding);
    }
  }
  return [...uniqueByThread.values()].sort((a, b) => {
    const sourceDiff = Number(a.source !== 'user') - Number(b.source !== 'user');
    if (sourceDiff) return sourceDiff;
    const timeDiff = toUnixSeconds(a.updatedAt) - toUnixSeconds(b.updatedAt);
    return timeDiff || String(a.providerKey || '').localeCompare(String(b.providerKey || ''));
  })[0] || null;
}

function selectSessionBinding(bindings = []) {
  return selectOwnedProviderBinding(bindings) || bindings[0] || null;
}

function getOwnedProviderBinding(db, chatKey) {
  if (!db || !chatKey) return null;
  return selectOwnedProviderBinding(sessionsDao().listSessionBindings(db, chatKey));
}

function validateOwnedProviderThread(bindings = [], cliSessionId = '') {
  const incomingThreadId = String(cliSessionId || '');
  if (!incomingThreadId) return { ok: true };
  const conflictingThreadIds = [...new Set(
    bindings
      .filter(isOwnedProviderBinding)
      .map(binding => String(binding.cliSessionId || ''))
      .filter(threadId => threadId && threadId !== incomingThreadId),
  )];
  if (!conflictingThreadIds.length) return { ok: true };
  return {
    ok: false,
    error: `Session already owns a different provider thread (${conflictingThreadIds.join(', ')})`,
  };
}

/**
 * Repair bindings written by the historical Codex thread-splitting bug.
 * The target must already be the deterministic canonical owned thread. Only
 * conflicting runtime bindings are removable; a second user-owned thread is
 * ambiguous and must continue to fail closed.
 */
function repairHistoricalCodexOwnedBindings(db, bindings = [], cliSessionId = '') {
  const targetThreadId = String(cliSessionId || '');
  const canonical = selectOwnedProviderBinding(bindings);
  if (!targetThreadId || !canonical || String(canonical.cliSessionId || '') !== targetThreadId) {
    return { ok: true, bindings };
  }

  const conflictingBindings = bindings.filter(binding => (
    isOwnedProviderBinding(binding) &&
    String(binding.cliSessionId || '') !== targetThreadId
  ));
  if (!conflictingBindings.length || conflictingBindings.some(binding => binding.source === 'user')) {
    return { ok: true, bindings };
  }

  const dao = sessionsDao();
  for (const binding of conflictingBindings) {
    const result = dao.deleteSessionBinding(db, binding.chatKey, binding.providerKey);
    if (!result.ok) return { ok: false, error: result.error || 'Unable to repair provider binding' };
  }
  return {
    ok: true,
    bindings: dao.listSessionBindings(db, canonical.chatKey),
  };
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
    // SQLite timestamps are seconds; renderer and panel state use milliseconds.
    createdAt: toUnixMilliseconds(row.createdAt),
    updatedAt: toUnixMilliseconds(row.updatedAt),
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
    createdAt: toUnixSeconds(record.createdAt) || now(),
    updatedAt: toUnixSeconds(record.updatedAt) || now(),
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
    return daoRowToRecord(row, selectSessionBinding(bindings), runtime);
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
    return daoRowToRecord(row, selectSessionBinding(bindings), runtime);
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
  const agent = record.agent || String(opts.agent || '');
  const scanInfo = {
    cliSessionId: String(opts.cliSessionId || ''),
    filePath: String(opts.filePath || ''),
  };
  const providerKeys = agent ? buildProviderKeys(agent, scanInfo) : [];
  const existingBindings = new Map(
    dao.listSessionBindings(db, chatKey).map(binding => [binding.providerKey, binding]),
  );

  record.title = String(title || '');
  record.titleSource = 'user';
  record.updatedAt = now();
  record.agent = agent;
  record.projectId = record.projectId || String(opts.projectId || '');
  record.cwd = record.cwd || String(opts.cwd || '');

  try {
    db.run('BEGIN');
    const result = dao.upsertSession(db, recordToDaoParams(record));
    if (!result.ok) {
      db.run('ROLLBACK');
      return result;
    }

    // A later transcript scan must resolve this same renamed UI session.
    for (const providerKey of providerKeys) {
      const existingBinding = existingBindings.get(providerKey);
      const binding = dao.upsertSessionBinding(db, {
        ...(existingBinding || {}),
        chatKey,
        providerKey,
        cliSessionId: scanInfo.cliSessionId,
        filePath: scanInfo.filePath,
        source: existingBinding?.source || 'scan',
        detached: existingBinding?.detached === true,
        resumeAllowed: existingBinding?.resumeAllowed !== false,
        updatedAt: record.updatedAt,
      });
      if (!binding.ok) {
        db.run('ROLLBACK');
        return binding;
      }
    }

    db.run('COMMIT');
    return result;
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (_) {}
    return { ok: false, error: e.message };
  }
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
  let matchedChatKey = '';
  for (const key of keys) {
    const candidate = dao.findSessionByProviderKey(db, key);
    if (!candidate) continue;
    if (matchedChatKey && candidate.chatKey !== matchedChatKey) return null;
    row = candidate;
    matchedChatKey = candidate.chatKey;
  }

  // Build record from existing or create new. Provider timestamps are kept in
  // seconds, matching SQLite, and never regress a newer local boundary write.
  const chatKey = row?.chatKey || `${agent}::scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowTs = now();
  const scanCreatedAt = toUnixSeconds(scanSummary.createdAt);
  const scanUpdatedAt = toUnixSeconds(scanSummary.updatedAt);
  const existingBindings = row ? dao.listSessionBindings(db, chatKey) : [];
  const existingRuntime = row ? dao.getSessionRuntime(db, chatKey) : null;

  const record = row ? daoRowToRecord(row, row.provider) : {
    chatKey,
    agent,
    projectId: project.projectId || '',
    cwd: project.cwd || '',
    title: scanSummary.title || '',
    titleSource: scanSummary.titleSource || 'scan',
    description: scanSummary.description || '',
    metadata: {},
    createdAt: (scanCreatedAt || nowTs) * 1000,
    updatedAt: (scanUpdatedAt || scanCreatedAt || nowTs) * 1000,
  };

  // Merge scan summary fields
  if (scanSummary.title && (!record.title || record.titleSource !== 'user')) {
    record.title = scanSummary.title;
    record.titleSource = scanSummary.titleSource || 'scan';
  }
  record.projectId = record.projectId || project.projectId || '';
  record.cwd = record.cwd || project.cwd || '';
  // Use the raw DAO row for existing records. Once a record is converted for
  // the renderer it is in milliseconds, which is otherwise ambiguous for old
  // timestamps close to the Unix epoch.
  const recordCreatedAt = row
    ? (toUnixSeconds(row.createdAt) || scanCreatedAt || nowTs)
    : (scanCreatedAt || nowTs);
  const recordUpdatedAt = Math.max(
    row ? toUnixSeconds(row.updatedAt) : 0,
    scanUpdatedAt,
    recordCreatedAt,
  );
  record.createdAt = recordCreatedAt * 1000;
  record.updatedAt = recordUpdatedAt * 1000;

  const runtime = {
    model: scanSummary.model || existingRuntime?.model || '',
    effort: scanSummary.effort || existingRuntime?.effort || undefined,
    modelTier: scanSummary.modelTier || existingRuntime?.modelTier || '',
    reasoningEffort: scanSummary.reasoningEffort || existingRuntime?.reasoningEffort || undefined,
  };
  const hasRuntime = Boolean(scanSummary.model || scanSummary.effort || scanSummary.modelTier || scanSummary.reasoningEffort);
  const bindingByKey = new Map(existingBindings.map(binding => [binding.providerKey, binding]));
  const needsBinding = keys.some(providerKey => !bindingByKey.has(providerKey));
  const needsRuntime = hasRuntime && (
    !existingRuntime ||
    existingRuntime.model !== runtime.model ||
    (existingRuntime.effort || '') !== (runtime.effort || '') ||
    existingRuntime.modelTier !== runtime.modelTier ||
    (existingRuntime.reasoningEffort || '') !== (runtime.reasoningEffort || '')
  );
  const needsSession = !row ||
    row.agent !== record.agent ||
    row.projectId !== record.projectId ||
    row.cwd !== record.cwd ||
    row.title !== record.title ||
    row.titleSource !== record.titleSource ||
    row.description !== record.description ||
    row.createdAt !== recordCreatedAt ||
    row.updatedAt !== recordUpdatedAt;

  if (needsSession || needsBinding || needsRuntime) {
    try {
      db.run('BEGIN');
      if (needsSession) {
        const result = dao.upsertSession(db, recordToDaoParams(record));
        if (!result.ok) throw new Error(result.error || 'Unable to save session');
      }
      for (const providerKey of keys) {
        if (bindingByKey.has(providerKey)) continue;
        const result = dao.upsertSessionBinding(db, {
          chatKey: record.chatKey,
          providerKey,
          cliSessionId: scanSummary.cliSessionId || '',
          filePath: scanSummary.filePath || '',
          source: 'scan',
          detached: false,
          resumeAllowed: true,
          updatedAt: recordUpdatedAt,
        });
        if (!result.ok) throw new Error(result.error || 'Unable to save provider binding');
      }
      if (needsRuntime) {
        const result = dao.upsertSessionRuntime(db, record.chatKey, runtime);
        if (!result.ok) throw new Error(result.error || 'Unable to save runtime');
      }
      db.run('COMMIT');
    } catch (_) {
      try { db.run('ROLLBACK'); } catch (_) {}
      return null;
    }
  }

  const rt = needsRuntime ? runtime : existingRuntime;
  const provider = row?.provider || {
    cliSessionId: scanSummary.cliSessionId || '',
    filePath: scanSummary.filePath || '',
    source: 'scan',
    detached: false,
    resumeAllowed: true,
  };
  return daoRowToRecord(record, provider, rt);
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
    // A transcript found by a scan is readable, but is not owned for resume
    // until MindCraft created it or the user explicitly claims it.
    resumeAllowed: record.provider?.resumeAllowed !== false && record.provider?.source !== 'scan',
  };
}

/**
 * Mark a scanned provider thread as deliberately adopted by this MindCraft
 * chat. This is the only path that makes a scan-created binding resumable.
 */
function claimScannedProviderBinding(db, { agent, chatKey, cliSessionId, filePath } = {}) {
  const dao = sessionsDao();
  if (!db || !chatKey) return { ok: false, error: 'Missing database or chatKey' };
  const targetCliSessionId = String(cliSessionId || '');
  const targetFilePath = String(filePath || '');
  const record = findByProviderScan(db, agent || '', {
    cliSessionId: targetCliSessionId,
    filePath: targetFilePath,
  });
  if (!record || record.chatKey !== chatKey) return { ok: false, error: 'Provider binding does not belong to this chat' };
  try {
    db.run('BEGIN');
    let bindings = dao.listSessionBindings(db, chatKey);
    if (String(agent || '') === 'codex') {
      const repair = repairHistoricalCodexOwnedBindings(db, bindings, targetCliSessionId);
      if (!repair.ok) throw new Error(repair.error);
      bindings = repair.bindings;
      const ownership = validateOwnedProviderThread(bindings, targetCliSessionId);
      if (!ownership.ok) throw new Error(ownership.error);
    }
    let claimed = 0;
    for (const binding of bindings) {
      const matchesCliSession = Boolean(targetCliSessionId) && binding.cliSessionId === targetCliSessionId;
      const matchesFilePath = Boolean(targetFilePath) && binding.filePath === targetFilePath;
      if (!matchesCliSession && !matchesFilePath) continue;
      const result = dao.upsertSessionBinding(db, {
        ...binding,
        chatKey,
        source: 'user',
        detached: false,
        resumeAllowed: true,
        updatedAt: now(),
      });
      if (!result.ok) throw new Error(result.error || 'Unable to claim provider binding');
      claimed += 1;
    }
    if (!claimed) throw new Error('No matching provider binding to claim');
    db.run('COMMIT');
    return { ok: true };
  } catch (error) {
    try { db.run('ROLLBACK'); } catch (_) {}
    return { ok: false, error: error.message };
  }
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
  if (!db) return { ok: false, error: 'DB unavailable' };
  if (!chatKey) return { ok: false, error: 'Missing chatKey' };

  const providerKeys = buildProviderKeys(agent || '', { cliSessionId, filePath });
  const timestamp = now();
  try {
    db.run('BEGIN');
    const row = dao.getSession(db, chatKey);
    if (!row) {
      const result = dao.upsertSession(db, {
        chatKey,
        agent: agent || '',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      if (!result.ok) throw new Error(result.error || 'Unable to save session');
    }
    let bindings = dao.listSessionBindings(db, chatKey);
    if (String(agent || '') === 'codex') {
      const repair = repairHistoricalCodexOwnedBindings(db, bindings, cliSessionId);
      if (!repair.ok) throw new Error(repair.error);
      bindings = repair.bindings;
      const ownership = validateOwnedProviderThread(bindings, cliSessionId);
      if (!ownership.ok) throw new Error(ownership.error);
    }
    const existingBindings = new Set(bindings.map(binding => binding.providerKey));
    for (const providerKey of providerKeys) {
      if (existingBindings.has(providerKey)) continue;
      const result = dao.upsertSessionBinding(db, {
        chatKey,
        providerKey,
        cliSessionId: cliSessionId || '',
        filePath: filePath || '',
        source: 'runtime',
        updatedAt: timestamp,
      });
      if (!result.ok) throw new Error(result.error || 'Unable to save provider binding');
    }
    const result = dao.upsertSessionRuntime(db, chatKey, runtime || {});
    if (!result.ok) throw new Error(result.error || 'Unable to save runtime');
    db.run('COMMIT');
    return result;
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (_) {}
    return { ok: false, error: e.message };
  }
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
    const binding = selectSessionBinding(dao.listSessionBindings(db, row.chatKey));
    if (!binding) continue;
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
    const resumeAllowed = isOwnedProviderBinding(provider) && (!fp || fileExists);
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

/**
 * Backfill only explicit legacy user renames from panel state. Scan-derived
 * titles are intentionally ignored so panel cache cannot become an authority.
 */
function backfillUserTitlesFromPanelState(db, agent, panelState) {
  if (!db) return { changed: false, count: 0 };
  const dao = sessionsDao();
  let count = 0;

  for (const project of Array.isArray(panelState?.projects) ? panelState.projects : []) {
    for (const chat of Array.isArray(project?.chats) ? project.chats : []) {
      const chatKey = String(chat?.sessionId || '');
      const legacyTitle = String(chat?.name || '').trim();
      if (!chatKey || !legacyTitle || (chat?.titleSource !== 'user' && !chat?._userRenamed)) continue;

      const scanInfo = {
        cliSessionId: String(chat?.cliSessionId || ''),
        filePath: String(chat?.filePath || ''),
      };
      const providerKeys = buildProviderKeys(agent, scanInfo);
      const existing = dao.getSession(db, chatKey);
      const knownKeys = new Set((existing ? dao.listSessionBindings(db, chatKey) : []).map(binding => binding.providerKey));
      const needsBinding = providerKeys.some(providerKey => !knownKeys.has(providerKey));
      const needsTitle = !existing || existing.titleSource !== 'user' || !existing.title;
      if (!needsBinding && !needsTitle) continue;

      // Preserve a user title already present in SQLite; old panel state only
      // supplies a missing binding or a title that was never persisted.
      const title = existing?.titleSource === 'user' && existing.title ? existing.title : legacyTitle;
      const result = setSessionTitle(db, chatKey, title, {
        agent,
        projectId: String(project?.id || ''),
        cwd: String(project?.cwd || ''),
        ...scanInfo,
      });
      if (result.ok) count += 1;
    }
  }

  return { changed: count > 0, count };
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
  getOwnedProviderBinding,
  isOwnedProviderBinding,
  claimScannedProviderBinding,
  upsertRuntimeByProvider,
  restorePanelState,
  backfillUserTitlesFromPanelState,
  getSessionDraft,
  setSessionDraft,
  clearSessionDraft,
  getSessionInstruction,
  setSessionInstruction,
};
