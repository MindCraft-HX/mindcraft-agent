'use strict';

/**
 * Claude chat session persistence IPC handlers — list, get, save, delete, generate title.
 *
 * Extracted from claudeAgent.js (R09 main handler setup split).
 */

const path = require('path');
const fs = require('fs');

function registerChatPersistenceIpc(ipcMain, {
  CHAT_SESSIONS_DIR,
  ensureChatSessionsDir,
  readChatIndex,
  writeChatIndexAsync,
  lt,
}) {
  ipcMain.handle('chat-list-sessions', () => readChatIndex());

  ipcMain.handle('chat-get-session', (_, id) => {
    const file = path.join(CHAT_SESSIONS_DIR, `${id}.json`);
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {}
    return null;
  });

  ipcMain.handle('chat-save-session', async (_, { id, data }) => {
    ensureChatSessionsDir();
    const file = path.join(CHAT_SESSIONS_DIR, `${id}.json`);
    const tmp = file + '.tmp';
    // P1-1：去掉缩进格式化，节省 CPU；异步写入不在主线程阻塞
    await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.promises.rename(tmp, file);

    // 更新 index（串行队列防竞态）
    const idx = readChatIndex();
    const existing = idx.sessions.findIndex(s => s.id === id);
    const entry = {
      id,
      title: data.title || '',
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      provider: data.provider || '',
      model: data.model || '',
    };
    if (existing >= 0) idx.sessions[existing] = entry;
    else idx.sessions.unshift(entry);
    idx.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    await writeChatIndexAsync(idx);
    return true;
  });

  ipcMain.handle('chat-delete-session', async (_, id) => {
    const file = path.join(CHAT_SESSIONS_DIR, `${id}.json`);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
    const idx = readChatIndex();
    idx.sessions = idx.sessions.filter(s => s.id !== id);
    await writeChatIndexAsync(idx);
    return true;
  });

  ipcMain.handle('chat-generate-title', async (_, { messages, provider, model }) => {
    // 用首条用户消息的前 30 字符作为标题（fallback）
    const firstUser = messages?.find(m => m.role === 'user');
    const fallback = firstUser?.content
      ? (typeof firstUser.content === 'string' ? firstUser.content : firstUser.content[0]?.text || lt('claude.sessionTitle')).slice(0, 30)
      : lt('claude.sessionTitle');
    return fallback;
  });
}

module.exports = { registerChatPersistenceIpc };
