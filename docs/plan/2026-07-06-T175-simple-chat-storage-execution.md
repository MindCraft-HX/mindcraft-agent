# T175: Simple Chat Storage Boundary — Execution Plan

> Date: 2026-07-06
> Status: ready for implementation
> Parent: `docs/plan/2026-07-06-storage-phase-2-chat-settings-session.md`

## 1. Goal

Split Simple Chat persistence from "single JSON file per session" into SQLite metadata + append-only message files. Renderer API stays stable; the change is transparent to all UI consumers.

## 2. Current Architecture (baseline)

```
Renderer                            Preload                     Main Process
─────────                           ───────                     ────────────
useChatSession.js ──IPC──>  chatListSessions()  ──invoke──>  CHAT_LIST_SESSIONS  ──> readChatIndex()
                           chatGetSession(id)   ──invoke──>  CHAT_GET_SESSION    ──> fs.readFile(<id>.json)
                           chatSaveSession(id,d)──invoke──>  CHAT_SAVE_SESSION   ──> write <id>.json + update index.json
                           chatDeleteSession(id)──invoke──>  CHAT_DELETE_SESSION ──> unlink <id>.json + filter index
                           chatGenerateTitle(m) ──invoke──>  CHAT_GENERATE_TITLE ──> extract first user msg

Storage:
  {userData}/chat-sessions/
    index.json             → { sessions: [{id, title, createdAt, updatedAt, provider, model}] }
    <id>.json              → { id, title, createdAt, updatedAt, provider, model, thinkingLevel, webSearchEnabled, messages: [...], contextSummary }
```

Key facts:
- Session metadata and messages are stored together in one JSON blob per session
- Every save writes the entire session JSON (messages included) → O(n) where n = message count
- `index.json` is a lightweight summary; updated on every save/delete
- Index writes use a serialized promise queue to prevent concurrent overwrites
- Renderer `saveSession()` deep-clones via `JSON.parse(JSON.stringify(...))` before sending
- Streaming saves on: stream end (finally block) and abort/stop path
- Home page calls `chatListSessions()` directly (no useChatSession), sorts by updatedAt, shows top 4
- `localStorage` keys used: `mindcraft_agent_chat_target_session`, `mindcraft_agent_last_chat_session`

Files involved:

| File | Role |
|------|------|
| `packages/agent/src/composables/useChatSession.js` | Renderer composable: session CRUD, message ops |
| `packages/agent/src/composables/useChatStream.js` | Streaming: calls saveSession on done/abort |
| `packages/agent/shared/ipcChannels.js` | 5 CORE_CHANNELS constants |
| `packages/agent/preload/index.js` | Preload bridge (lines ~188-192) |
| `packages/agent/electron/claude/chatPersistenceIpc.js` | Main-process IPC handlers (file-based) |
| `packages/agent/electron/claude/index.js` | Leaf IPC aggregation, passes deps |
| `packages/agent/electron/claudeAgent.js` | Provides CHAT_SESSIONS_DIR, index helpers (~lines 2546-2584) |
| `packages/agent/src/views/ChatView.vue` | Chat view: uses useChatSession |
| `packages/agent/src/components/chat/SessionList.vue` | Sidebar list: rename/delete |
| `src/views/Home.vue` | Home: recent chats (direct IPC call) |
| `packages/agent/electron/db/schema.js` | DB schema constants |
| `packages/agent/electron/db/index.js` | DB singleton, DAO exports |
| `packages/agent/electron/db/migrations/v1_initial.js` | Migrations v1-v3 |

## 3. Target Architecture

```
Renderer (unchanged)                Preload (unchanged)          Main Process
─────────                           ───────                     ────────────
useChatSession.js ──IPC──>  chatListSessions()  ──invoke──>  CHAT_LIST_SESSIONS  ──> chatThreadDao.listAll(db)
                           chatGetSession(id)   ──invoke──>  CHAT_GET_SESSION    ──> chatThreadDao.getById(db, id)
                                                                                   + fs read messages.jsonl
                           chatSaveSession(id,d)──invoke──>  CHAT_SAVE_SESSION   ──> chatThreadDao.upsert(db, meta)
                                                                                   + fs append messages.jsonl
                           chatDeleteSession(id)──invoke──>  CHAT_DELETE_SESSION ──> chatThreadDao.delete(db, id)
                                                                                   + fs unlink messages.jsonl
                           chatGenerateTitle(m) ──invoke──>  CHAT_GENERATE_TITLE ──> extract first user msg (unchanged)

Storage:
  SQLite mindcraft.db:
    chat_threads table        → { id, title, createdAt, updatedAt, provider, model, thinkingLevel, webSearchEnabled, contextSummary }

  {userData}/simple-chat/
    threads/
      <threadId>/
        messages.jsonl        → one JSON object per line (append-only)
```

Design principles:
- Renderer API is 100% backward compatible — no UI changes needed
- Messages live in JSONL files (append-only, no full-rewrite on each save)
- Message JSONL format: `{ "role": "...", "content": ..., "tool_calls": [...], ... }` — same shape as current `messages[]` items
- Old `{userData}/chat-sessions/` is read fallback only during migration window

## 4. Implementation Phases

### Phase 1: DB Layer — `chat_threads` table + DAO

**Files to create:**
- `packages/agent/electron/db/dao/chatThreads.js`

**Files to modify:**
- `packages/agent/electron/db/schema.js` — add table DDL, index, update SCHEMA_VERSION
- `packages/agent/electron/db/migrations/v1_initial.js` — add migrateV4
- `packages/agent/electron/db/index.js` — re-export chatThreads DAO

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  model TEXT NOT NULL DEFAULT '',
  thinking_level TEXT NOT NULL DEFAULT 'off',
  web_search_enabled INTEGER NOT NULL DEFAULT 0,
  context_summary TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_updated
  ON chat_threads(updated_at DESC);
```

**DAO operations needed:**

| Function | SQL / Operation |
|----------|----------------|
| `listChatThreads(db)` | `SELECT * FROM chat_threads ORDER BY updated_at DESC` |
| `getChatThread(db, id)` | `SELECT * FROM chat_threads WHERE id = ?` |
| `upsertChatThread(db, thread)` | `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` |
| `deleteChatThread(db, id)` | `DELETE FROM chat_threads WHERE id = ?` |

**Row parser** (sql.js returns array rows):
```js
function parseThreadRow(row) {
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
  }
}
```

**SCHEMA_VERSION bump:** 3 → 4

**Migration v4:**
- Create `chat_threads` table + index
- Data migration: read old `{userData}/chat-sessions/*.json`, extract metadata → INSERT into `chat_threads`, extract messages → write `messages.jsonl`
- Idempotent: skip if `PRAGMA user_version >= 4`
- Migration needs `userDataDir` passed as parameter (unlike v1-v3 which only need the db instance)
  - **Design decision:** pass `{ userDataDir }` opts to `runMigrations()`. v4 migration reads old files only when `userDataDir` is provided.
  - If no `userDataDir` (e.g. test env), skip data migration, only create the table.

**Migration file structure:**
```js
function migrateV4(db, { userDataDir } = {}) {
  // 1. Version guard
  if (getDbVersion(db) >= 4) return { ok: true, version: 4, message: 'Already at v4' }
  if (getDbVersion(db) < 3) return { ok: false, version: getDbVersion(db), message: 'Must run migrateV3 before migrateV4' }

  // 2. Create table + index
  db.run(CHAT_THREADS_DDL)
  db.run('CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at DESC)')

  // 3. Data migration (only if userDataDir provided)
  let migrated = 0
  if (userDataDir) {
    const oldDir = path.join(userDataDir, 'chat-sessions')
    if (fs.existsSync(oldDir)) {
      // iterate *.json, skip index.json
      // for each: parse metadata → INSERT, messages → write messages.jsonl
    }
  }

  db.run('PRAGMA user_version = 4')
  return { ok: true, version: 4, migrated }
}
```

**Contract tests:**
- `packages/agent/electron/db/dao/chatThreads.test.js`
  - list returns empty for fresh DB
  - upsert + get round-trip
  - upsert updates existing by id
  - delete removes record
  - list ordered by updatedAt DESC
  - `webSearchEnabled` round-trips as boolean (stored as INTEGER 0/1)

### Phase 2: Message File Layer

**New file:** `packages/agent/electron/chat/chatMessageFiles.js`

This module handles reading/writing `{userData}/simple-chat/threads/<threadId>/messages.jsonl`.

```js
// chatMessageFiles.js

const path = require('path')
const fs = require('fs')

function getThreadDir(userDataDir, threadId) {
  return path.join(userDataDir, 'simple-chat', 'threads', threadId)
}

function ensureThreadDir(userDataDir, threadId) {
  const dir = getThreadDir(userDataDir, threadId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Read all messages as parsed objects */
function readMessages(userDataDir, threadId) {
  const file = path.join(getThreadDir(userDataDir, threadId), 'messages.jsonl')
  try {
    if (!fs.existsSync(file)) return []
    const text = fs.readFileSync(file, 'utf8')
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch (_) { return [] }
}

/** Overwrite entire message file (used on saveSession which sends full messages[]) */
function writeMessages(userDataDir, threadId, messages) {
  const dir = ensureThreadDir(userDataDir, threadId)
  const file = path.join(dir, 'messages.jsonl')
  const lines = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, lines, 'utf8')
  fs.renameSync(tmp, file)
}

/** Delete thread directory */
function deleteThreadDir(userDataDir, threadId) {
  const dir = getThreadDir(userDataDir, threadId)
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) {}
}
```

**Design note on write strategy:** The current renderer calls `saveSession()` with the full `currentSession` object including all messages. Since `saveSession` happens at stream end (not per-message), and the message count for Simple Chat is typically modest, we use **overwrite** rather than append-only. This keeps the renderer contract simple (send all messages, not a diff). If Simple Chat grows to very large histories, a future optimization could switch to append-only with per-message saves.

### Phase 3: Main Process Integration

**Rewrite `chatPersistenceIpc.js`** to use DB + file layer instead of old JSON files.

```js
// chatPersistenceIpc.js (v2)

const path = require('path')
const { CORE_CHANNELS } = require('../../shared/ipcChannels')
const { chatThreadsDao } = require('../db')

function registerChatPersistenceIpc(ipcMain, deps) {
  const { getDb, userDataDir, lt } = deps
  const { readMessages, writeMessages, deleteThreadDir } = require('./chatMessageFiles')

  // LIST — from SQLite only
  ipcMain.handle(CORE_CHANNELS.CHAT_LIST_SESSIONS, async () => {
    const db = await getDb()
    const threads = chatThreadsDao.listChatThreads(db)
    return { sessions: threads.map(t => ({
      id: t.id, title: t.title, createdAt: t.createdAt,
      updatedAt: t.updatedAt, provider: t.provider, model: t.model,
    })) }
  })

  // GET — metadata from SQLite, messages from JSONL
  ipcMain.handle(CORE_CHANNELS.CHAT_GET_SESSION, async (_, id) => {
    const db = await getDb()
    const thread = chatThreadsDao.getChatThread(db, id)
    if (!thread) return null
    const messages = readMessages(userDataDir, id)
    return { ...thread, messages }
  })

  // SAVE — metadata to SQLite, messages to JSONL
  ipcMain.handle(CORE_CHANNELS.CHAT_SAVE_SESSION, async (_, { id, data }) => {
    const db = await getDb()
    chatThreadsDao.upsertChatThread(db, {
      id, title: data.title || '', createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(), provider: data.provider || 'claude',
      model: data.model || '', thinkingLevel: data.thinkingLevel || 'off',
      webSearchEnabled: !!data.webSearchEnabled,
      contextSummary: data.contextSummary || '',
    })
    writeMessages(userDataDir, id, data.messages || [])
    await persistDb()
    return true
  })

  // DELETE — remove from SQLite + delete message files
  ipcMain.handle(CORE_CHANNELS.CHAT_DELETE_SESSION, async (_, id) => {
    const db = await getDb()
    chatThreadsDao.deleteChatThread(db, id)
    deleteThreadDir(userDataDir, id)
    await persistDb()
    return true
  })

  // GENERATE_TITLE — unchanged
  ipcMain.handle(CORE_CHANNELS.CHAT_GENERATE_TITLE, async (_, { messages, provider, model }) => {
    const firstUser = messages?.find(m => m.role === 'user')
    return firstUser?.content
      ? (typeof firstUser.content === 'string' ? firstUser.content : firstUser.content[0]?.text || lt('claude.sessionTitle')).slice(0, 30)
      : lt('claude.sessionTitle')
  })
}
```

**Deps change in `claude/index.js`:**

Before:
```js
registerChatPersistenceIpc(ipcMain, {
  CHAT_SESSIONS_DIR: deps.CHAT_SESSIONS_DIR,
  ensureChatSessionsDir: deps.ensureChatSessionsDir,
  readChatIndex: deps.readChatIndex,
  writeChatIndexAsync: deps.writeChatIndexAsync,
  lt: deps.lt,
})
```

After:
```js
registerChatPersistenceIpc(ipcMain, {
  getDb: () => getDb({ userDataDir: getMindCraftUserDataDir() }),
  userDataDir: getMindCraftUserDataDir(),
  lt: deps.lt,
})
```

**Deps change in `claudeAgent.js`:**

The old `CHAT_SESSIONS_DIR`, `ensureChatSessionsDir`, `readChatIndex`, `writeChatIndexAsync` definitions can be removed (~lines 2546-2584). The `registerClaudeLeafIpcs` call no longer passes them.

Wait — these are passed through `claude/index.js` → `claudeAgent.js`. Let me trace the exact dep flow:

1. `claudeAgent.js` defines `CHAT_SESSIONS_DIR` etc. and calls `registerClaudeLeafIpcs(ipcMain, { CHAT_SESSIONS_DIR, ensureChatSessionsDir, readChatIndex, writeChatIndexAsync, lt })`
2. `claude/index.js` receives these deps and passes them to `registerChatPersistenceIpc`

After T175, `claudeAgent.js` no longer needs to define chat session paths or pass them as deps. `chatPersistenceIpc.js` now takes `getDb` + `userDataDir` from `claude/index.js`, which gets them from `claudeAgent.js`'s existing imports (`getDb` from `./db`, `getMindCraftUserDataDir` from `./userDataPath`).

### Phase 4: Migration Execution

**Migration from old `chat-sessions/` to new storage:**

Happens in `migrateV4()` during DB open. Steps:

1. Check if `chat_threads` is empty AND old `{userData}/chat-sessions/` exists
2. Read `index.json` for list of session IDs
3. For each session:
   a. Read `<id>.json`, parse metadata + messages
   b. `INSERT INTO chat_threads` metadata
   c. Write `messages.jsonl`
4. Log migration count
5. Do NOT delete old files (keep as manual rollback option)

**Migration contract:**
- The migration reads old `chat-sessions/` data into the new storage
- After migration, new writes go exclusively to SQLite + JSONL
- Old `chat-sessions/` is NOT deleted — serves as manual rollback
- If migration fails, DB transaction rolls back, old files untouched

### Phase 5: Fallback Reader (compatibility window)

If `chat_threads` is empty after migration (edge case: migration skipped or failed), and old `chat-sessions/` files exist, the IPC handlers should fall back to reading old JSON files.

This is a one-version compatibility window. After 1.2.x ships and confirms no issues, the fallback can be removed.

Implementation: In `CHAT_LIST_SESSIONS` and `CHAT_GET_SESSION` handlers:

```js
// After trying SQLite:
if (results.length === 0) {
  // Fallback: try old chat-sessions/
  const oldDir = path.join(userDataDir, 'chat-sessions')
  if (fs.existsSync(oldDir)) {
    // read old index.json / <id>.json
    // return results in new format
  }
}
```

This is layered **inside the IPC handler**, not in the DAO. The DAO only speaks SQLite.

## 5. Files Changed Summary

| File | Action | Phase |
|------|--------|-------|
| `packages/agent/electron/db/schema.js` | Add `CHAT_THREADS_DDL`, index, bump version to 4 | Phase 1 |
| `packages/agent/electron/db/migrations/v1_initial.js` | Add `migrateV4()`, update `runMigrations()` | Phase 1 |
| `packages/agent/electron/db/dao/chatThreads.js` | **New:** CRUD DAO for chat_threads table | Phase 1 |
| `packages/agent/electron/db/dao/chatThreads.test.js` | **New:** Contract tests | Phase 1 |
| `packages/agent/electron/db/index.js` | Re-export chatThreads DAO | Phase 1 |
| `packages/agent/electron/chat/chatMessageFiles.js` | **New:** Message JSONL read/write/delete helpers | Phase 2 |
| `packages/agent/electron/claude/chatPersistenceIpc.js` | Rewrite handlers to use DB + JSONL | Phase 3 |
| `packages/agent/electron/claude/index.js` | Update deps passed to chatPersistenceIpc | Phase 3 |
| `packages/agent/electron/claudeAgent.js` | Remove old chat-sessions path/helper definitions | Phase 3 |
| `docs/TODO.md` | Update T175 status | All |

**Files NOT changed (renderer API stable):**
- `packages/agent/src/composables/useChatSession.js` — unchanged
- `packages/agent/src/composables/useChatStream.js` — unchanged
- `packages/agent/src/views/ChatView.vue` — unchanged
- `packages/agent/src/components/chat/SessionList.vue` — unchanged
- `src/views/Home.vue` — unchanged
- `packages/agent/shared/ipcChannels.js` — unchanged
- `packages/agent/preload/index.js` — unchanged

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration data loss | HIGH | Old files NOT deleted; DB transaction wraps migration; old files serve as manual rollback |
| sql.js DB grows (chat_threads is small metadata) | LOW | Chat threads are O(100) records, each ~200 bytes → negligible |
| Message file corruption on concurrent writes | LOW | saveSession is serialized in renderer; one save at a time per session |
| renderer sends old-style data (missing new fields) | LOW | upsertChatThread handles defaults; missing fields → default values |
| Home page breakage | MEDIUM | Home calls chatListSessions directly — must return same `{ sessions: [...] }` shape with id/title/createdAt/updatedAt/provider/model |
| Context summary migration | LOW | `contextSummary` is a rarely-used field; if missing on migration, default to `''` |

## 7. Acceptance Criteria

1. **Chat list:** Home page shows recent chats ordered by updatedAt
2. **Create:** New chat appears in list, persists across restart
3. **Rename:** Rename updates title in list and detail view
4. **Delete:** Delete removes from list, detail view clears
5. **Stream save:** Messages persist after stream ends (finally block)
6. **Abort save:** Messages persist after user stops streaming
7. **Restart:** All chats and messages survive app restart
8. **Large history:** Session with 500+ messages no longer rewrites whole JSON every save
9. **Migration:** Old `chat-sessions/` data is migrated on first launch after upgrade
10. **Contract tests:** All new DAO tests pass; existing tests unaffected

## 8. Execution Order

```
Phase 1 (DB layer)
  ├── 1a. Update schema.js: add CHAT_THREADS_DDL, bump SCHEMA_VERSION to 4
  ├── 1b. Add migrateV4 to v1_initial.js
  ├── 1c. Create dao/chatThreads.js
  ├── 1d. Create dao/chatThreads.test.js
  └── 1e. Re-export from db/index.js

Phase 2 (Message files)
  └── 2a. Create chat/chatMessageFiles.js

Phase 3 (Integration)
  ├── 3a. Rewrite chatPersistenceIpc.js
  ├── 3b. Update claude/index.js deps
  └── 3c. Clean up claudeAgent.js old helpers

Phase 4 (Verify)
  ├── 4a. Run contract tests: npm test
  ├── 4b. Build: npm run build
  └── 4c. Smoke: create/rename/delete/restart chat sessions
```

## 9. Open Questions

1. **Should `contextSummary` stay in SQLite?** Yes — it's a metadata field, typically < 500 chars. It's not a message body.
2. **Should old `chat-sessions/` files be deleted after migration?** No — keep for one release as manual rollback option. Add a cleanup task in a later maintenance phase.
3. **What about `chatGenerateTitle`?** Unchanged — it's a pure function that extracts text from messages. No storage involved.
4. **Does `persistDb()` cause a full DB rewrite on every chat save?** Yes, but chat saves are infrequent (stream end, rename, delete) and DB size is tiny (< 1MB for provider + thread metadata). If this becomes a concern later, batch persists or use a debounced persist.
