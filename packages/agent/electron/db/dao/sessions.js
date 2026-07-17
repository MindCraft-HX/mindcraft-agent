'use strict';

/**
 * Sessions DAO — CRUD operations on sessions, session_bindings, session_runtime.
 *
 * T201: These three tables become the authoritative store for session identity
 * and runtime metadata.  The old session-registry JSON files remain as read-only
 * fallback during the compatibility window.
 *
 * Pure-ish: functions accept an explicit db instance so tests don't
 * depend on the real app profile.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSessionRow(row) {
  if (!row) return null;
  return {
    chatKey: row[0],
    agent: row[1],
    projectId: row[2],
    cwd: row[3],
    title: row[4],
    titleSource: row[5],
    description: row[6],
    metadata: safeJsonParse(row[7]),
    createdAt: row[8],
    updatedAt: row[9],
  };
}

function parseBindingRow(row) {
  if (!row) return null;
  return {
    chatKey: row[0],
    providerKey: row[1],
    cliSessionId: row[2],
    filePath: row[3],
    source: row[4],
    detached: row[5] === 1,
    resumeAllowed: row[6] === 1,
    updatedAt: row[7],
  };
}

function parseRuntimeRow(row) {
  if (!row) return null;
  return {
    chatKey: row[0],
    model: row[1],
    effort: row[2],
    modelTier: row[3],
    reasoningEffort: row[4],
    updatedAt: row[5],
  };
}

function safeJsonParse(str) {
  try {
    const parsed = JSON.parse(str || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function now() {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * List sessions, optionally filtered.
 *
 * @param {import('sql.js').Database} db
 * @param {object} [opts]
 * @param {string} [opts.agent]
 * @param {string} [opts.projectId]
 * @param {number} [opts.limit]
 * @returns {Array<object>}
 */
function listSessions(db, { agent, projectId, limit } = {}) {
  try {
    let sql = 'SELECT chat_key, agent, project_id, cwd, title, title_source, description, metadata_json, created_at, updated_at FROM sessions';
    const params = [];
    const conditions = [];

    if (agent) {
      conditions.push('agent = ?');
      params.push(agent);
    }
    if (projectId) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY updated_at DESC';

    if (typeof limit === 'number' && limit > 0) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const result = db.exec(sql, params);
    if (!result || result.length === 0) return [];
    return result[0].values.map(parseSessionRow);
  } catch (e) {
    console.error('[sessions DAO] listSessions error:', e.message);
    return [];
  }
}

/**
 * Get a single session by chatKey.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @returns {object|null}
 */
function getSession(db, chatKey) {
  try {
    const result = db.exec(
      'SELECT chat_key, agent, project_id, cwd, title, title_source, description, metadata_json, created_at, updated_at FROM sessions WHERE chat_key = ?',
      [chatKey],
    );
    if (!result || result.length === 0 || result[0].values.length === 0) return null;
    return parseSessionRow(result[0].values[0]);
  } catch (e) {
    console.error('[sessions DAO] getSession error:', e.message);
    return null;
  }
}

/**
 * Upsert a session record.
 *
 * @param {import('sql.js').Database} db
 * @param {object} record
 * @param {string} record.chatKey
 * @returns {{ ok: boolean, error?: string }}
 */
function upsertSession(db, record) {
  const chatKey = String(record.chatKey || '');
  if (!chatKey) return { ok: false, error: 'Missing chatKey' };

  const agent = String(record.agent || '');
  const projectId = String(record.projectId || '');
  const cwd = String(record.cwd || '');
  const title = String(record.title || '');
  const titleSource = String(record.titleSource || '');
  const description = String(record.description || '');
  const metadataJson = JSON.stringify(record.metadata || {});
  const createdAt = typeof record.createdAt === 'number' ? record.createdAt : now();
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : now();

  try {
    db.run(
      `INSERT INTO sessions (chat_key, agent, project_id, cwd, title, title_source, description, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_key) DO UPDATE SET
         agent = excluded.agent,
         project_id = excluded.project_id,
         cwd = excluded.cwd,
         title = excluded.title,
         title_source = excluded.title_source,
         description = excluded.description,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`,
      [chatKey, agent, projectId, cwd, title, titleSource, description, metadataJson, createdAt, updatedAt],
    );
    return { ok: true };
  } catch (e) {
    console.error('[sessions DAO] upsertSession error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a session and its bindings + runtime (cascade manually).
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @returns {{ ok: boolean }}
 */
function deleteSession(db, chatKey) {
  try {
    db.run('DELETE FROM session_bindings WHERE chat_key = ?', [chatKey]);
    db.run('DELETE FROM session_runtime WHERE chat_key = ?', [chatKey]);
    db.run('DELETE FROM sessions WHERE chat_key = ?', [chatKey]);
    return { ok: true };
  } catch (e) {
    console.error('[sessions DAO] deleteSession error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Session Bindings
// ---------------------------------------------------------------------------

/**
 * List all bindings for a chatKey.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @returns {Array<object>}
 */
function listSessionBindings(db, chatKey) {
  try {
    const result = db.exec(
      'SELECT chat_key, provider_key, cli_session_id, file_path, source, detached, resume_allowed, updated_at FROM session_bindings WHERE chat_key = ?',
      [chatKey],
    );
    if (!result || result.length === 0) return [];
    return result[0].values.map(parseBindingRow);
  } catch (e) {
    console.error('[sessions DAO] listSessionBindings error:', e.message);
    return [];
  }
}

/**
 * Find a session by provider key (JOIN sessions + session_bindings).
 *
 * @param {import('sql.js').Database} db
 * @param {string} providerKey
 * @returns {object|null} — session record with .provider merged in
 */
function findSessionByProviderKey(db, providerKey) {
  try {
    const result = db.exec(
      `SELECT s.chat_key, s.agent, s.project_id, s.cwd, s.title, s.title_source, s.description, s.metadata_json, s.created_at, s.updated_at,
              b.provider_key, b.cli_session_id, b.file_path, b.source, b.detached, b.resume_allowed, b.updated_at
       FROM sessions s
       JOIN session_bindings b ON s.chat_key = b.chat_key
       WHERE b.provider_key = ?`,
      [providerKey],
    );
    if (!result || result.length === 0 || result[0].values.length === 0) return null;

    const row = result[0].values[0];
    const session = parseSessionRow(row.slice(0, 10));
    session.provider = {
      cliSessionId: row[11],
      filePath: row[12],
      source: row[13],
      detached: row[14] === 1,
      resumeAllowed: row[15] === 1,
      updatedAt: row[16],
    };
    return session;
  } catch (e) {
    console.error('[sessions DAO] findSessionByProviderKey error:', e.message);
    return null;
  }
}

/**
 * Find sessions by multiple provider keys (single JOIN query).
 *
 * @param {import('sql.js').Database} db
 * @param {Array<string>} providerKeys
 * @returns {Array<object>}
 */
function findSessionsByProviderKeys(db, providerKeys) {
  if (!Array.isArray(providerKeys) || providerKeys.length === 0) return [];
  try {
    const placeholders = providerKeys.map(() => '?').join(',');
    const result = db.exec(
      `SELECT s.chat_key, s.agent, s.project_id, s.cwd, s.title, s.title_source, s.description, s.metadata_json, s.created_at, s.updated_at,
              b.provider_key, b.cli_session_id, b.file_path, b.source, b.detached, b.resume_allowed, b.updated_at
       FROM sessions s
       JOIN session_bindings b ON s.chat_key = b.chat_key
       WHERE b.provider_key IN (${placeholders})`,
      providerKeys,
    );
    if (!result || result.length === 0) return [];
    return result[0].values.map(row => {
      const session = parseSessionRow(row.slice(0, 10));
      session.provider = {
        cliSessionId: row[11],
        filePath: row[12],
        source: row[13],
        detached: row[14] === 1,
        resumeAllowed: row[15] === 1,
        updatedAt: row[16],
      };
      return session;
    });
  } catch (e) {
    console.error('[sessions DAO] findSessionsByProviderKeys error:', e.message);
    return [];
  }
}

/**
 * Upsert a session binding.
 *
 * @param {import('sql.js').Database} db
 * @param {object} binding
 * @param {string} binding.chatKey
 * @param {string} binding.providerKey
 * @param {string} [binding.cliSessionId]
 * @param {string} [binding.filePath]
 * @param {string} [binding.source='scan']
 * @param {boolean} [binding.detached=false]
 * @param {boolean} [binding.resumeAllowed=true]
 * @returns {{ ok: boolean }}
 */
function upsertSessionBinding(db, binding) {
  const chatKey = String(binding.chatKey || '');
  const providerKey = String(binding.providerKey || '');
  if (!chatKey || !providerKey) return { ok: false, error: 'Missing chatKey or providerKey' };

  const cliSessionId = String(binding.cliSessionId || '');
  const filePath = String(binding.filePath || '');
  const source = String(binding.source || 'scan');
  const detached = binding.detached ? 1 : 0;
  const resumeAllowed = binding.resumeAllowed !== false ? 1 : 0;
  const updatedAt = typeof binding.updatedAt === 'number' ? binding.updatedAt : now();

  try {
    const owner = findSessionByProviderKey(db, providerKey);
    if (owner && owner.chatKey !== chatKey) {
      return { ok: false, error: `Provider key already belongs to ${owner.chatKey}` };
    }
    db.run(
      `INSERT INTO session_bindings (chat_key, provider_key, cli_session_id, file_path, source, detached, resume_allowed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_key, provider_key) DO UPDATE SET
         cli_session_id = excluded.cli_session_id,
         file_path = excluded.file_path,
         source = excluded.source,
         detached = excluded.detached,
         resume_allowed = excluded.resume_allowed,
         updated_at = excluded.updated_at`,
      [chatKey, providerKey, cliSessionId, filePath, source, detached, resumeAllowed, updatedAt],
    );
    return { ok: true };
  } catch (e) {
    console.error('[sessions DAO] upsertSessionBinding error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a specific binding.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @param {string} providerKey
 * @returns {{ ok: boolean }}
 */
function deleteSessionBinding(db, chatKey, providerKey) {
  try {
    db.run('DELETE FROM session_bindings WHERE chat_key = ? AND provider_key = ?', [chatKey, providerKey]);
    return { ok: true };
  } catch (e) {
    console.error('[sessions DAO] deleteSessionBinding error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Session Runtime
// ---------------------------------------------------------------------------

/**
 * Get runtime for a session.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @returns {object|null}
 */
function getSessionRuntime(db, chatKey) {
  try {
    const result = db.exec(
      'SELECT chat_key, model, effort, model_tier, reasoning_effort, updated_at FROM session_runtime WHERE chat_key = ?',
      [chatKey],
    );
    if (!result || result.length === 0 || result[0].values.length === 0) return null;
    return parseRuntimeRow(result[0].values[0]);
  } catch (e) {
    console.error('[sessions DAO] getSessionRuntime error:', e.message);
    return null;
  }
}

/**
 * Upsert session runtime.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @param {object} runtime
 * @param {string} [runtime.model]
 * @param {string} [runtime.effort]
 * @param {string} [runtime.modelTier]
 * @param {string} [runtime.reasoningEffort]
 * @returns {{ ok: boolean }}
 */
function upsertSessionRuntime(db, chatKey, runtime = {}) {
  if (!chatKey) return { ok: false, error: 'Missing chatKey' };

  const model = String(runtime.model || '');
  const effort = runtime.effort || null;
  const modelTier = String(runtime.modelTier || '');
  const reasoningEffort = runtime.reasoningEffort || null;
  const updatedAt = now();

  try {
    db.run(
      `INSERT INTO session_runtime (chat_key, model, effort, model_tier, reasoning_effort, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_key) DO UPDATE SET
         model = excluded.model,
         effort = excluded.effort,
         model_tier = excluded.model_tier,
         reasoning_effort = excluded.reasoning_effort,
         updated_at = excluded.updated_at`,
      [chatKey, model, effort, modelTier, reasoningEffort, updatedAt],
    );
    return { ok: true };
  } catch (e) {
    console.error('[sessions DAO] upsertSessionRuntime error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Delete runtime for a session.
 *
 * @param {import('sql.js').Database} db
 * @param {string} chatKey
 * @returns {{ ok: boolean }}
 */
function deleteSessionRuntime(db, chatKey) {
  try {
    db.run('DELETE FROM session_runtime WHERE chat_key = ?', [chatKey]);
    return { ok: true };
  } catch (e) {
    console.error('[sessions DAO] deleteSessionRuntime error:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  listSessions,
  getSession,
  upsertSession,
  deleteSession,
  listSessionBindings,
  findSessionByProviderKey,
  findSessionsByProviderKeys,
  upsertSessionBinding,
  deleteSessionBinding,
  getSessionRuntime,
  upsertSessionRuntime,
  deleteSessionRuntime,
};
