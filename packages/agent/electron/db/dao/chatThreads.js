'use strict';

/**
 * Chat Threads DAO — CRUD operations on the chat_threads table.
 *
 * Stores Simple Chat session metadata in SQLite. Message bodies live in
 * userData files (see chat/chatMessageFiles.js).
 *
 * Pure-ish: functions accept an explicit db instance so tests don't
 * depend on the real app profile.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseThreadRow(row) {
  if (!row) return null;
  return {
    id: row[0],
    title: row[1],
    createdAt: row[2],
    updatedAt: row[3],
    provider: row[4],
    model: row[5],
    thinkingLevel: row[6],
    webSearchEnabled: row[7] === 1,
    contextSummary: row[8],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all chat threads, newest first.
 *
 * @param {import('sql.js').Database} db
 * @returns {Array<object>}
 */
function listChatThreads(db) {
  try {
    const result = db.exec(
      'SELECT id, title, created_at, updated_at, provider, model, thinking_level, web_search_enabled, context_summary FROM chat_threads ORDER BY updated_at DESC',
    );
    if (!result || result.length === 0) return [];
    return result[0].values.map(parseThreadRow);
  } catch (e) {
    console.error('[chatThreads DAO] listChatThreads error:', e.message);
    return [];
  }
}

/**
 * Get a single chat thread by ID.
 *
 * @param {import('sql.js').Database} db
 * @param {string} id
 * @returns {object|null}
 */
function getChatThread(db, id) {
  try {
    const result = db.exec(
      'SELECT id, title, created_at, updated_at, provider, model, thinking_level, web_search_enabled, context_summary FROM chat_threads WHERE id = ?',
      [id],
    );
    if (!result || result.length === 0 || result[0].values.length === 0) return null;
    return parseThreadRow(result[0].values[0]);
  } catch (e) {
    console.error('[chatThreads DAO] getChatThread error:', e.message);
    return null;
  }
}

/**
 * Upsert a chat thread. If a row with the same id exists, update it.
 *
 * @param {import('sql.js').Database} db
 * @param {object} thread
 * @param {string} thread.id
 * @param {string} [thread.title='']
 * @param {number} thread.createdAt
 * @param {number} thread.updatedAt
 * @param {string} [thread.provider='claude']
 * @param {string} [thread.model='']
 * @param {string} [thread.thinkingLevel='off']
 * @param {boolean} [thread.webSearchEnabled=false]
 * @param {string} [thread.contextSummary='']
 * @returns {{ ok: boolean }}
 */
function upsertChatThread(db, thread) {
  const id = String(thread.id || '');
  if (!id) return { ok: false, error: 'Missing thread id' };

  const title = String(thread.title || '');
  const createdAt = typeof thread.createdAt === 'number' ? thread.createdAt : Date.now();
  const updatedAt = typeof thread.updatedAt === 'number' ? thread.updatedAt : Date.now();
  const provider = String(thread.provider || 'claude');
  const model = String(thread.model || '');
  const thinkingLevel = String(thread.thinkingLevel || 'off');
  const webSearchEnabled = thread.webSearchEnabled ? 1 : 0;
  const contextSummary = String(thread.contextSummary || '');

  try {
    db.run(
      `INSERT INTO chat_threads (id, title, created_at, updated_at, provider, model, thinking_level, web_search_enabled, context_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         updated_at = excluded.updated_at,
         provider = excluded.provider,
         model = excluded.model,
         thinking_level = excluded.thinking_level,
         web_search_enabled = excluded.web_search_enabled,
         context_summary = excluded.context_summary`,
      [id, title, createdAt, updatedAt, provider, model, thinkingLevel, webSearchEnabled, contextSummary],
    );
    return { ok: true };
  } catch (e) {
    console.error('[chatThreads DAO] upsertChatThread error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a chat thread by ID.
 *
 * @param {import('sql.js').Database} db
 * @param {string} id
 * @returns {{ ok: boolean }}
 */
function deleteChatThread(db, id) {
  try {
    db.run('DELETE FROM chat_threads WHERE id = ?', [id]);
    return { ok: true };
  } catch (e) {
    console.error('[chatThreads DAO] deleteChatThread error:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  listChatThreads,
  getChatThread,
  upsertChatThread,
  deleteChatThread,
};
