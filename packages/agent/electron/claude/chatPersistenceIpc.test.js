'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

let SQL = null;

async function createFreshDb() {
  if (!SQL) {
    const mod = require('sql.js');
    const init = mod.default || mod;
    SQL = await init();
  }
  const db = new SQL.Database();
  const { runMigrations } = require('../db/migrations/v1_initial');
  const result = runMigrations(db);
  if (!result.ok) throw new Error(result.message);
  return db;
}

test('saving an empty simple-chat history clears the persisted message file', async () => {
  const { registerChatPersistenceIpc } = require('./chatPersistenceIpc');
  const { CORE_CHANNELS } = require('../../shared/ipcChannels');
  const db = await createFreshDb();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-chat-clear-'));
  const handlers = new Map();
  let persistCount = 0;

  try {
    registerChatPersistenceIpc({
      handle(channel, handler) { handlers.set(channel, handler); },
    }, {
      getDb: async () => db,
      persistDb: async () => { persistCount++; },
      userDataDir,
      lt: () => 'New Chat',
    });

    const save = handlers.get(CORE_CHANNELS.CHAT_SAVE_SESSION);
    const get = handlers.get(CORE_CHANNELS.CHAT_GET_SESSION);
    assert.equal(typeof save, 'function');
    assert.equal(typeof get, 'function');

    const base = {
      id: 'clear-regression',
      title: 'Clear regression',
      createdAt: 1,
      updatedAt: 1,
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      thinkingLevel: 'off',
      webSearchEnabled: false,
      contextSummary: '',
    };
    assert.equal(await save(null, {
      id: base.id,
      data: { ...base, messages: [{ role: 'user', content: 'before clear' }] },
    }), true);

    assert.equal(await save(null, {
      id: base.id,
      data: { ...base, updatedAt: 2, messages: [] },
    }), true);

    const restored = await get(null, base.id);
    assert.deepEqual(restored.messages, []);
    assert.equal(restored.contextSummary, '');
    assert.equal(persistCount, 2);
  } finally {
    db.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
