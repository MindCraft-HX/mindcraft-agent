'use strict';

/**
 * Chat session persistence IPC handlers — list, get, save, delete, generate title.
 *
 * V2 (T175): Metadata stored in SQLite chat_threads table,
 * message bodies stored as JSONL files under
 *   {userData}/simple-chat/threads/<threadId>/messages.jsonl
 *
 * Extracted from claudeAgent.js (R09 main handler setup split).
 * Upgraded to SQLite + file-based storage in T175.
 */

const path = require('path');
const fs = require('fs');
const { CORE_CHANNELS } = require('../../shared/ipcChannels');
const { listChatThreads, getChatThread, upsertChatThread, deleteChatThread } = require('../db/dao/chatThreads');
const { readMessages, writeMessages, deleteThreadDir } = require('../chat/chatMessageFiles');

/**
 * Fallback: read single session from old `{userData}/chat-sessions/<id>.json`.
 * Used only when SQLite chat_threads is empty and old files exist.
 *
 * @param {string} userDataDir
 * @param {string} id
 * @returns {object|null}
 */
function readOldSession(userDataDir, id) {
  try {
    const file = path.join(userDataDir, 'chat-sessions', `${id}.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {}
  return null;
}

/**
 * Fallback: read old index.json from `{userData}/chat-sessions/`.
 * Used only when SQLite chat_threads is empty.
 *
 * @param {string} userDataDir
 * @returns {{ sessions: Array }}
 */
function readOldIndex(userDataDir) {
  try {
    const file = path.join(userDataDir, 'chat-sessions', 'index.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {}
  return { sessions: [] };
}

function registerChatPersistenceIpc(ipcMain, {
  getDb,
  persistDb,
  userDataDir,
  lt,
}) {
  // ── LIST ───────────────────────────────────────────────────────────────

  ipcMain.handle(CORE_CHANNELS.CHAT_LIST_SESSIONS, async () => {
    const db = await getDb();
    const threads = listChatThreads(db);

    // Build the SQLite-based list
    const sessions = threads.map(t => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      provider: t.provider,
      model: t.model,
    }));

    // Merge in any old-index sessions not yet migrated (so they aren't invisible)
    const oldIndex = readOldIndex(userDataDir);
    if (oldIndex && Array.isArray(oldIndex.sessions) && oldIndex.sessions.length > 0) {
      const sqliteIds = new Set(threads.map(t => t.id));
      for (const old of oldIndex.sessions) {
        if (!sqliteIds.has(old.id)) {
          sessions.push({
            id: old.id,
            title: old.title || '',
            createdAt: old.createdAt || Date.now(),
            updatedAt: old.updatedAt || Date.now(),
            provider: old.provider || 'claude',
            model: old.model || '',
          });
        }
      }
    }

    return { sessions };
  });

  // ── GET ────────────────────────────────────────────────────────────────

  ipcMain.handle(CORE_CHANNELS.CHAT_GET_SESSION, async (_, id) => {
    if (!id) return null;

    const db = await getDb();
    const thread = getChatThread(db, id);
    if (thread) {
      const messages = readMessages(userDataDir, id);
      return {
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        provider: thread.provider,
        model: thread.model,
        thinkingLevel: thread.thinkingLevel,
        webSearchEnabled: thread.webSearchEnabled,
        contextSummary: thread.contextSummary,
        messages,
      };
    }

    // Fallback: read old chat-sessions/<id>.json
    const old = readOldSession(userDataDir, id);
    if (old) {
      return {
        id: old.id,
        title: old.title || '',
        createdAt: old.createdAt || Date.now(),
        updatedAt: old.updatedAt || Date.now(),
        provider: old.provider || 'claude',
        model: old.model || '',
        thinkingLevel: old.thinkingLevel || 'off',
        webSearchEnabled: !!old.webSearchEnabled,
        contextSummary: old.contextSummary || '',
        messages: Array.isArray(old.messages) ? old.messages : [],
      };
    }

    return null;
  });

  // ── SAVE ───────────────────────────────────────────────────────────────

  ipcMain.handle(CORE_CHANNELS.CHAT_SAVE_SESSION, async (_, { id, data }) => {
    if (!id) return false;

    const db = await getDb();

    // Write metadata to SQLite
    const metaResult = upsertChatThread(db, {
      id,
      title: data.title || '',
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      provider: data.provider || 'claude',
      model: data.model || '',
      thinkingLevel: data.thinkingLevel || 'off',
      webSearchEnabled: !!data.webSearchEnabled,
      contextSummary: data.contextSummary || '',
    });
    if (!metaResult.ok) {
      console.error('[chatPersistence] upsertChatThread failed:', metaResult.error);
      return false;
    }

    // Write message bodies to JSONL file
    writeMessages(userDataDir, id, data.messages || []);

    // Persist sql.js in-memory DB to disk
    await persistDb();

    return true;
  });

  // ── DELETE ─────────────────────────────────────────────────────────────

  ipcMain.handle(CORE_CHANNELS.CHAT_DELETE_SESSION, async (_, id) => {
    if (!id) return false;

    const db = await getDb();

    // Remove from SQLite
    const deleteResult = deleteChatThread(db, id);
    if (!deleteResult.ok) {
      console.error('[chatPersistence] deleteChatThread failed:', deleteResult.error);
      return false;
    }

    // Remove message files (non-fatal on errors)
    try {
      deleteThreadDir(userDataDir, id);
    } catch (e) {
      console.error('[chatPersistence] deleteThreadDir error:', e.message);
    }

    // Clean up old chat-sessions file + update old index.json during transition
    try {
      const oldFile = path.join(userDataDir, 'chat-sessions', `${id}.json`);
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);

      const indexFile = path.join(userDataDir, 'chat-sessions', 'index.json');
      if (fs.existsSync(indexFile)) {
        const oldIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        if (oldIndex && Array.isArray(oldIndex.sessions)) {
          oldIndex.sessions = oldIndex.sessions.filter(s => s.id !== id);
          fs.writeFileSync(indexFile, JSON.stringify(oldIndex, null, 2), 'utf8');
        }
      }
    } catch (e) {
      console.error('[chatPersistence] old-index cleanup error:', e.message);
    }

    await persistDb();
    return true;
  });

  // ── GENERATE TITLE ─────────────────────────────────────────────────────

  ipcMain.handle(CORE_CHANNELS.CHAT_GENERATE_TITLE, async (_, { messages, provider, model }) => {
    // Fallback: first user message first 30 chars
    const firstUser = messages?.find(m => m.role === 'user');
    const fallback = firstUser?.content
      ? (typeof firstUser.content === 'string'
          ? firstUser.content
          : firstUser.content[0]?.text || lt('claude.sessionTitle')
        ).slice(0, 30)
      : lt('claude.sessionTitle');
    return fallback;
  });
}

module.exports = { registerChatPersistenceIpc };
