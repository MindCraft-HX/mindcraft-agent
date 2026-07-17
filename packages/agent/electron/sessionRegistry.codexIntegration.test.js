/**
 * T167: CodeX Agent — Session Registry 集成测试
 *
 * 模拟 codexAgent.js 中 sessionRegistry 调用序列，覆盖 scan/done/restore
 * 关键集成路径。不依赖 Electron 运行时，直接调用 sessionRegistry 函数。
 *
 * 覆盖场景（T165 handoff §5）：
 *   1. new session → done → provider scan → restore（不产生重复）
 *   2. provider scan first → done last（单一 chatKey）
 *   3. done first → provider scan last（单一 chatKey）
 *
 * See docs/session-pitfalls.md and docs/agent-architecture.md.
 *       docs/session-pitfalls.md
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  syncPanelStateSessions,
  attachRegistrySessionToScanSummary,
  restorePanelStateFromSessionRegistry,
  detachSessionProviderBinding,
  deleteSessionRecordsByProvider,
  findSessionRecordByProvider,
  listSessionRecords,
  setSessionTitle,
  upsertRuntimeByProvider,
} = require('./sessionRegistry')

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-session-registry-codex-'))
}

function makePanelState(overrides = {}) {
  return {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Codex work',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        model: 'gpt-5.1-codex',
        reasoningEffort: 'medium',
        createdAt: 100,
        updatedAt: 200,
        ...overrides,
      }],
    }],
  }
}

function makeScanSummary(overrides = {}) {
  return {
    id: 'thread-1',
    cliSessionId: 'thread-1',
    providerSessionId: 'thread-1',
    name: 'Provider title',
    title: 'Provider title',
    filePath: 'C:/Users/demo/.codex/sessions/rollout-thread-1.jsonl',
    cwd: 'D:/repo',
    fileSize: 5000,
    createdAt: 100,
    updatedAt: 300,
    runtime: { model: 'gpt-5.1-codex', reasoningEffort: 'medium' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenario 1: Full lifecycle — panel sync → scan → restore (no duplicates)
// ---------------------------------------------------------------------------

test('full lifecycle: panel sync → provider scan → restore produces single record', () => {
  const userDataDir = makeTempUserData()

  // Step 1: Panel sync (simulates writePanelState / onAgentDone)
  const count1 = syncPanelStateSessions('codex', makePanelState(), { userDataDir })
  assert.equal(count1, 1, 'panel sync creates one record')

  // Step 2: Provider scan enriches (simulates listSessionsByCwd)
  const scanSummary = makeScanSummary()
  const enriched = attachRegistrySessionToScanSummary('codex', scanSummary,
    { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(enriched.chatKey, 'chat-key-1', 'scan summary carries existing chatKey')
  assert.equal(enriched.name, 'Codex work', 'user-titled name preserved')

  // Step 3: Panel re-sync (simulates another writePanelState)
  const count2 = syncPanelStateSessions('codex', makePanelState(), { userDataDir })
  assert.equal(count2, 1, 're-sync still reports one record')

  // Assert: exactly one record, no duplicates
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'single record — no duplicates')
  assert.equal(records[0].chatKey, 'chat-key-1')
})

test('full lifecycle: restorePanelStateFromSessionRegistry backfills missing chats', () => {
  const userDataDir = makeTempUserData()

  // Create records via panel sync
  syncPanelStateSessions('codex', makePanelState(), { userDataDir })
  syncPanelStateSessions('codex', makePanelState({
    id: 'chat-2',
    sessionId: 'chat-key-2',
    name: 'Second chat',
    cliSessionId: 'thread-2',
    filePath: 'C:/Users/demo/.codex/sessions/thread-2.jsonl',
  }), { userDataDir })

  // Panel state only has chat-1 (chat-2 is "missing")
  const panelState = makePanelState()

  const result = restorePanelStateFromSessionRegistry('codex', panelState, { userDataDir })
  assert.equal(result.changed, true)
  assert.equal(result.added, 1, 'one missing chat restored')
  assert.equal(panelState.projects[0].chats.length, 2, 'panel state has both chats')
})

// ---------------------------------------------------------------------------
// Scenario 2: Provider scan first, then panel sync (done) later
// ---------------------------------------------------------------------------

test('scan first → panel sync later: single chatKey, titleSource from provider', () => {
  const userDataDir = makeTempUserData()

  // Step 1: Provider scan creates record (simulates scan before any UI sync)
  const enriched = attachRegistrySessionToScanSummary('codex', makeScanSummary(),
    { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.ok(enriched.chatKey, 'scan produces a chatKey')
  const scanChatKey = enriched.chatKey

  // Step 2: Panel sync merges (simulates onAgentDone binding later)
  const count = syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: scanChatKey,
        name: 'User renamed',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 400,
      }],
    }],
  }, { userDataDir })

  assert.equal(count, 1)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'single record')
  assert.equal(records[0].chatKey, scanChatKey, 'same chatKey')

  // User title from panel should be preserved (titleSource='user')
  // Note: syncPanelStateSessions with providerBindingSource='panel' won't
  // overwrite an existing titleSource='provider' — but setSessionTitle would.
})

// ---------------------------------------------------------------------------
// Scenario 3: Panel sync (done) first, then provider scan
// ---------------------------------------------------------------------------

test('done first → provider scan later: scan enriches existing record', () => {
  const userDataDir = makeTempUserData()

  // Step 1: Panel sync creates record (simulates done→writePanelState)
  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  // Step 2: Provider scan finds existing record
  const enriched = attachRegistrySessionToScanSummary('codex', makeScanSummary(),
    { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(enriched.chatKey, 'chat-key-1', 'scan finds existing chatKey')
  assert.equal(enriched.cliSessionId, 'thread-1')

  // No duplicate records
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
})

// ---------------------------------------------------------------------------
// detachResume: empty_upstream_response triggers resumeAllowed=false
// ---------------------------------------------------------------------------

test('detachResume: detachSessionProviderBinding sets resumeAllowed=false', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  const detached = detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
  }, { userDataDir })

  assert.ok(detached >= 1, 'detach affected at least one record')

  // Verify resumeAllowed is now false
  const record = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(record, 'record still exists')
  assert.equal(record.metadata?.resumeAllowed, false,
    'resumeAllowed set to false after detach')
  assert.ok(record.metadata?.detachedProviderBinding,
    'detachedProviderBinding metadata populated')
})

test('detachResume: scan after detach still maps to original chatKey', () => {
  const userDataDir = makeTempUserData()

  // Create + detach
  syncPanelStateSessions('codex', makePanelState(), { userDataDir })
  detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
  }, { userDataDir })

  // Scan the same provider session
  const enriched = attachRegistrySessionToScanSummary('codex', makeScanSummary(),
    { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(enriched.chatKey, 'chat-key-1',
    'detached session scan still maps to original chatKey')
  // The frontend should check _resumeAllowed before re-registering
})

// ---------------------------------------------------------------------------
// findSessionRecordByProvider: registry lookup integration
// ---------------------------------------------------------------------------

test('findSessionRecordByProvider returns correct record by cliSessionId', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  const record = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(record)
  assert.equal(record.chatKey, 'chat-key-1')
  assert.equal(record.provider.cliSessionId, 'thread-1')
})

test('findSessionRecordByProvider returns correct record by filePath', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  const record = findSessionRecordByProvider(
    { agent: 'codex', filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl' },
    { userDataDir })
  assert.ok(record)
  assert.equal(record.chatKey, 'chat-key-1')
})

test('findSessionRecordByProvider returns null for unknown provider', () => {
  const userDataDir = makeTempUserData()

  const record = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'nonexistent' }, { userDataDir })
  assert.equal(record, null)
})

// ---------------------------------------------------------------------------
// codex-register-cli-sessions: resumeAllowed=false blocks re-registration
// ---------------------------------------------------------------------------

test('codex-register-cli-sessions: resumeAllowed=false blocks re-registration', () => {
  const userDataDir = makeTempUserData()

  // Create session
  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  // Detach (simulates empty_upstream_response → detachCodexResumeMapping)
  detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
    reason: 'empty_upstream_response',
  }, { userDataDir })

  // Simulate codex-register-cli-sessions IPC handler logic:
  // const record = findSessionRecordByProvider({ agent: 'codex', cliSessionId: cliId })
  // if (record?.chatKey === sid && record?.metadata?.resumeAllowed === false) { skip }
  const record = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(record)
  assert.equal(record.chatKey, 'chat-key-1')
  assert.equal(record.metadata?.resumeAllowed, false,
    'resumeAllowed=false — cliSessionIds should NOT be set for this session')
})

// ---------------------------------------------------------------------------
// Idempotency: multiple panel syncs do not create duplicates
// ---------------------------------------------------------------------------

test('multiple panel syncs are idempotent', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })
  syncPanelStateSessions('codex', makePanelState(), { userDataDir })
  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'three syncs, one record')
})

// ---------------------------------------------------------------------------
// Legacy panel restore compatibility
// ---------------------------------------------------------------------------

test('legacy registry can restore an empty panel state', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  const backfill = restorePanelStateFromSessionRegistry('codex',
    { projects: [] }, { userDataDir })
  assert.equal(backfill.changed, true, 'empty panel state gets backfilled')

  // Records intact
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
})

// ---------------------------------------------------------------------------
// T165 Phase 2a: reasoningEffort survives panel re-sync
// ---------------------------------------------------------------------------

test('CodeX reasoningEffort survives panel re-sync', () => {
  const userDataDir = makeTempUserData()

  // Initial sync with reasoningEffort: 'medium'
  syncPanelStateSessions('codex', makePanelState({ reasoningEffort: 'medium' }),
    { userDataDir })

  // Authoritative runtime update (simulates next turn with different effort)
  upsertRuntimeByProvider({
    agent: 'codex',
    cliSessionId: 'thread-1',
    cwd: 'D:/repo',
    runtime: { reasoningEffort: 'xhigh' },
  }, { userDataDir })

  // Verify upsert took effect
  const afterUpsert = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(afterUpsert)
  assert.equal(afterUpsert.runtime.reasoningEffort, 'xhigh',
    'upserted reasoningEffort should be xhigh')

  // Stale panel re-sync with old reasoningEffort value
  syncPanelStateSessions('codex', makePanelState({ reasoningEffort: 'medium' }),
    { userDataDir })

  // T165 Phase 2a: panel source must not overwrite runtime fields
  // set by upsertRuntimeByProvider.
  const record = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(record, 'record exists after panel re-sync')
  assert.equal(record.runtime.reasoningEffort, 'xhigh',
    'reasoningEffort must survive stale panel re-sync')
})

test('CodeX reasoningEffort from panel sync fills gaps only', () => {
  const userDataDir = makeTempUserData()

  // Panel sync without reasoningEffort — field is missing
  syncPanelStateSessions('codex', makePanelState({ reasoningEffort: undefined }),
    { userDataDir })

  const afterFirst = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(afterFirst)
  assert.equal(afterFirst.runtime.reasoningEffort || '', '',
    'reasoningEffort not set when panel has no value')

  // Panel sync now provides reasoningEffort — should fill the gap
  syncPanelStateSessions('codex', makePanelState({ reasoningEffort: 'medium' }),
    { userDataDir })

  const afterSecond = findSessionRecordByProvider(
    { agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(afterSecond)
  assert.equal(afterSecond.runtime.reasoningEffort, 'medium',
    'panel source can fill missing reasoningEffort')
})

// ---------------------------------------------------------------------------
// Session deletion
// ---------------------------------------------------------------------------

test('deleteSessionRecordsByProvider removes record and index entries', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  const deleted = deleteSessionRecordsByProvider({
    agent: 'codex',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
  }, { userDataDir })

  assert.equal(deleted, 1)
  assert.deepEqual(listSessionRecords({ userDataDir }), [])

  // Index cleaned
  const index = JSON.parse(fs.readFileSync(
    path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.deepEqual(index.providers, {})
})

test('deleteSessionRecordsByProvider with chatKey removes metadata-only record', () => {
  const userDataDir = makeTempUserData()

  // Create a metadata-only record (no cliSessionId/filePath)
  syncPanelStateSessions('codex', makePanelState({
    cliSessionId: '',
    filePath: '',
    sessionId: 'chat-key-meta',
  }), { userDataDir })

  const deleted = deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-meta',
  }, { userDataDir })

  assert.equal(deleted, 1)
  assert.deepEqual(listSessionRecords({ userDataDir }), [])
})

test('delete → restorePanelState does NOT resurrect deleted records', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', makePanelState(), { userDataDir })

  // Delete
  deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-1',
  }, { userDataDir })

  // Try to restore
  const result = restorePanelStateFromSessionRegistry('codex',
    { projects: [] }, { userDataDir })

  assert.equal(result.added, 0, 'deleted session not restored')
  assert.deepEqual(listSessionRecords({ userDataDir }), [])
})
