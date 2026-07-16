/**
 * T167: ClaudeCode Agent — Session Registry 集成测试
 *
 * 模拟 claudeAgent.js 中 sessionRegistry 调用序列，覆盖 scan/done/restore
 * 关键集成路径。不依赖 Electron 运行时，直接调用 sessionRegistry 函数。
 *
 * 覆盖场景（T165 handoff §5）：
 *   4. ClaudeCode equivalent scan/done/restore sequences
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
  deleteSessionRecordsByProvider,
  findSessionRecordByProvider,
  listSessionRecords,
  setSessionTitle,
  upsertRuntimeByProvider,
  repairSessionRegistry,
} = require('./sessionRegistry')

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-session-registry-claude-'))
}

function makePanelState(overrides = {}) {
  return {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Claude work',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
        model: 'claude-sonnet',
        effort: 'high',
        modelTier: 'sonnet',
        createdAt: 100,
        updatedAt: 200,
        ...overrides,
      }],
    }],
  }
}

function makeScanSummary(overrides = {}) {
  return {
    id: 'cli-1',
    cliSessionId: 'cli-1',
    providerSessionId: 'cli-1',
    name: 'Provider title',
    title: 'Provider title',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    cwd: 'D:/repo',
    fileSize: 5000,
    createdAt: 100,
    updatedAt: 300,
    isCustomTitle: false,
    runtime: { model: 'claude-sonnet', effort: 'high' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenario 4: Full lifecycle — panel sync → scan → restore (no duplicates)
// ---------------------------------------------------------------------------

test('full lifecycle: panel sync → provider scan → restore produces single record', () => {
  const userDataDir = makeTempUserData()

  // Step 1: Panel sync (simulates writeClaudeCodePanelState)
  const count1 = syncPanelStateSessions('claude', makePanelState(), { userDataDir })
  assert.equal(count1, 1)

  // Step 2: Provider scan enriches (simulates scanCliSessionsForProject)
  const scanSummary = makeScanSummary()
  const enriched = attachRegistrySessionToScanSummary('claude', scanSummary,
    { cwd: 'D:/repo' }, { userDataDir })

  assert.equal(enriched.chatKey, 'chat-key-1', 'scan summary carries existing chatKey')

  // Step 3: Re-sync (simulates another writeClaudeCodePanelState)
  const count2 = syncPanelStateSessions('claude', makePanelState(), { userDataDir })
  assert.equal(count2, 1)

  // Assert: single record
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'single record — no duplicates')
})

test('full lifecycle: restorePanelStateFromSessionRegistry backfills missing Claude chats', () => {
  const userDataDir = makeTempUserData()

  // Create two records
  syncPanelStateSessions('claude', makePanelState(), { userDataDir })
  syncPanelStateSessions('claude', makePanelState({
    id: 'chat-2',
    sessionId: 'chat-key-2',
    name: 'Second chat',
    cliSessionId: 'cli-2',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-2.jsonl',
  }), { userDataDir })

  // Panel state only has chat-1
  const panelState = makePanelState()

  const result = restorePanelStateFromSessionRegistry('claude', panelState, { userDataDir })
  assert.equal(result.changed, true)
  assert.equal(result.added, 1, 'one missing chat restored')
  assert.equal(panelState.projects[0].chats.length, 2)
})

// ---------------------------------------------------------------------------
// Scan first → panel sync later
// ---------------------------------------------------------------------------

test('scan first → panel sync later: single chatKey', () => {
  const userDataDir = makeTempUserData()

  // Scan creates record
  const enriched = attachRegistrySessionToScanSummary('claude', makeScanSummary(),
    { cwd: 'D:/repo' }, { userDataDir })

  const scanChatKey = enriched.chatKey
  assert.ok(scanChatKey)

  // Panel sync merges
  const count = syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: scanChatKey,
        name: 'User title',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
        createdAt: 100,
        updatedAt: 400,
      }],
    }],
  }, { userDataDir })

  assert.equal(count, 1)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
})

// ---------------------------------------------------------------------------
// Panel sync first → scan later
// ---------------------------------------------------------------------------

test('panel sync first → scan later: scan enriches existing record', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  const enriched = attachRegistrySessionToScanSummary('claude', makeScanSummary(),
    { cwd: 'D:/repo' }, { userDataDir })

  assert.equal(enriched.chatKey, 'chat-key-1')
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
})

// ---------------------------------------------------------------------------
// upsertRuntimeByProvider (writeClaudeSessionMeta simulation)
// ---------------------------------------------------------------------------

test('upsertRuntimeByProvider updates runtime fields on existing session', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  // Simulates writeClaudeSessionMeta: model/effort change on next turn
  upsertRuntimeByProvider({
    agent: 'claude',
    cliSessionId: 'cli-1',
    cwd: 'D:/repo',
    runtime: { model: 'claude-opus', effort: 'xhigh', modelTier: 'opus' },
  }, { userDataDir })

  const record = findSessionRecordByProvider(
    { agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.ok(record)
  assert.equal(record.runtime.model, 'claude-opus')
  assert.equal(record.runtime.effort, 'xhigh')
  assert.equal(record.runtime.modelTier, 'opus')
})

// ---------------------------------------------------------------------------
// readClaudeSessionMetaByFilePath: findSessionRecordByProvider lookup
// ---------------------------------------------------------------------------

test('findSessionRecordByProvider by filePath returns runtime metadata', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  // Simulates readClaudeSessionMetaByFilePath
  const record = findSessionRecordByProvider(
    { agent: 'claude', filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl' },
    { userDataDir })

  assert.ok(record)
  assert.equal(record.chatKey, 'chat-key-1')
  assert.equal(record.runtime.model, 'claude-sonnet')
  assert.equal(record.runtime.effort, 'high')
})

// ---------------------------------------------------------------------------
// deleteClaudeSessionArtifacts integration
// ---------------------------------------------------------------------------

test('deleteSessionRecordsByProvider removes Claude session record and index', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  // Simulates deleteClaudeSessionArtifacts:
  //   const record = findSessionRecordByProvider(...)
  //   fs.unlinkSync(filePath)
  //   deleteSessionRecordsByProvider(...)
  const record = findSessionRecordByProvider(
    { agent: 'claude', filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl' },
    { userDataDir })
  assert.ok(record, 'record found before delete')

  const deleted = deleteSessionRecordsByProvider({
    agent: 'claude',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
  }, { userDataDir })

  assert.equal(deleted, 1)
  assert.deepEqual(listSessionRecords({ userDataDir }), [])

  // Index cleaned
  const index = JSON.parse(fs.readFileSync(
    path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.deepEqual(index.providers, {})
})

// ---------------------------------------------------------------------------
// claude-rename-session integration (find + setTitle)
// ---------------------------------------------------------------------------

test('rename session: find → setTitle preserves user title through re-sync', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  // Simulates claude-rename-session IPC handler:
  //   const record = findSessionRecordByProvider(...)
  //   const result = setSessionTitle(record.chatKey, title, ...)
  const record = findSessionRecordByProvider(
    { agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.ok(record, 'record found')

  const result = setSessionTitle(record.chatKey, 'Custom user name', {
    agent: 'claude',
    cwd: 'D:/repo',
    cliSessionId: 'cli-1',
    filePath: record.provider?.filePath,
    runtime: record.runtime,
    userDataDir,
  })

  assert.ok(result.ok)
  assert.equal(result.record.title, 'Custom user name')
  assert.equal(result.record.titleSource, 'user')
})

// ---------------------------------------------------------------------------
// readClaudeCodePanelState: sync + repair sequence
// ---------------------------------------------------------------------------

test('readClaudeCodePanelState sequence: sync → repair is consistent', () => {
  const userDataDir = makeTempUserData()

  // Step 1: sync (simulates claudeAgent.js L623)
  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  // Step 2: repair (simulates claudeAgent.js L624)
  const repair = repairSessionRegistry({ userDataDir })
  assert.ok(repair.ok, 'repair succeeds on clean data')
  assert.equal(repair.changed, false, 'no changes needed')

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
})

// ---------------------------------------------------------------------------
// Multi-cwd isolation
// ---------------------------------------------------------------------------

test('sessions in different cwds are isolated', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('claude', {
    projects: [
      {
        id: 'project-1',
        cwd: 'D:/repo-a',
        chats: [{
          id: 'chat-a',
          sessionId: 'chat-key-a',
          name: 'Repo A',
          cliSessionId: 'cli-a',
          filePath: 'C:/Users/demo/.claude/projects/repo-a/cli-a.jsonl',
          createdAt: 100,
          updatedAt: 200,
        }],
      },
      {
        id: 'project-2',
        cwd: 'D:/repo-b',
        chats: [{
          id: 'chat-b',
          sessionId: 'chat-key-b',
          name: 'Repo B',
          cliSessionId: 'cli-b',
          filePath: 'C:/Users/demo/.claude/projects/repo-b/cli-b.jsonl',
          createdAt: 300,
          updatedAt: 400,
        }],
      },
    ],
  }, { userDataDir })

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 2, 'two independent sessions')

  const recordA = records.find(r => r.chatKey === 'chat-key-a')
  const recordB = records.find(r => r.chatKey === 'chat-key-b')
  assert.ok(recordA)
  assert.ok(recordB)
  assert.equal(recordA.projectId, 'project-1')
  assert.equal(recordB.projectId, 'project-2')
})

// ---------------------------------------------------------------------------
// Runtime meta survives panel re-sync
// ---------------------------------------------------------------------------

test('runtime metadata survives panel re-sync', () => {
  const userDataDir = makeTempUserData()

  // Initial sync
  syncPanelStateSessions('claude', makePanelState(), { userDataDir })

  // Update runtime via upsertRuntimeByProvider (simulates writeClaudeSessionMeta)
  upsertRuntimeByProvider({
    agent: 'claude',
    cliSessionId: 'cli-1',
    cwd: 'D:/repo',
    runtime: { model: 'claude-opus', effort: 'xhigh', modelTier: 'opus' },
  }, { userDataDir })

  // Verify upsertRuntimeByProvider took effect
  const afterUpsert = findSessionRecordByProvider(
    { agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.ok(afterUpsert)
  assert.equal(afterUpsert.runtime.model, 'claude-opus')
  assert.equal(afterUpsert.runtime.effort, 'xhigh')
  assert.equal(afterUpsert.runtime.modelTier, 'opus')

  // Re-sync panel with stale runtime values (panel cache from before
  // the next turn that changed model/effort).
  syncPanelStateSessions('claude', makePanelState({ model: 'claude-sonnet', effort: 'high' }),
    { userDataDir })

  // T165 Phase 2a: panel source (providerBindingSource='panel') must NOT
  // overwrite runtime fields already set by upsertRuntimeByProvider.
  // Panel can only fill in missing runtime fields; existing values from
  // authoritative writes (upsertRuntimeByProvider, scan) are preserved.
  const record = findSessionRecordByProvider(
    { agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.ok(record, 'record exists after panel re-sync')
  assert.equal(record.runtime.model, 'claude-opus',
    'runtime model must survive panel re-sync')
  assert.equal(record.runtime.effort, 'xhigh',
    'runtime effort must survive panel re-sync')
  assert.equal(record.runtime.modelTier, 'opus',
    'runtime modelTier must survive panel re-sync')
})
