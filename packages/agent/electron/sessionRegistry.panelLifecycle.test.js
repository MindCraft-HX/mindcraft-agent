/**
 * T167: Cross-cutting Panel State Lifecycle 集成测试
 *
 * 覆盖跨 agent 的 panel state 生命周期场景：
 *   5. 旧 panel cache 不能覆盖 active registry binding（重启/恢复安全）
 *   6. 删除 session → registry/panel/index 一致性
 *
 * See docs/session-pitfalls.md and docs/agent-architecture.md.
 *       docs/session-pitfalls.md §Trap 8
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
  listSessionRecords,
  setSessionTitle,
  repairSessionRegistry,
} = require('./sessionRegistry')

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-session-registry-panel-'))
}

function getIndex(userDataDir) {
  return JSON.parse(fs.readFileSync(
    path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
}

// ---------------------------------------------------------------------------
// Scenario 5: Old panel cache cannot overwrite active registry binding
// ---------------------------------------------------------------------------

test('old panel cache with stale cliSessionId cannot overwrite active binding', () => {
  const userDataDir = makeTempUserData()

  // Step 1: Provider scan establishes record with thread-new as authoritative binding.
  // Scan source wins over panel (mergeProviderBinding without 'panel' source
  // uses incoming-wins strategy). This simulates the scenario after a restart
  // where the scan finds the latest provider session on disk.
  const enriched = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-new',
    cliSessionId: 'thread-new',
    providerSessionId: 'thread-new',
    name: 'Codex session',
    filePath: 'C:/Users/demo/.codex/sessions/thread-new.jsonl',
    cwd: 'D:/repo',
    fileSize: 6000,
    createdAt: 100,
    updatedAt: 300,
    runtime: { model: 'gpt-5.1-codex' },
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  const chatKey = enriched.chatKey
  assert.ok(chatKey, 'scan produces a chatKey')

  // Verify scan-established binding
  const afterScan = listSessionRecords({ userDataDir }).find(r => r.chatKey === chatKey)
  assert.ok(afterScan, 'record exists after scan')
  assert.equal(afterScan.provider.cliSessionId, 'thread-new',
    'scan-established binding is thread-new')
  assert.equal(afterScan.provider.filePath,
    'C:/Users/demo/.codex/sessions/thread-new.jsonl')

  // Step 2: Stale panel cache carries older cliSessionId (e.g., from before
  // restart, or from a different window's cached state).
  // syncPanelStateSessions uses providerBindingSource='panel', which
  // preserves the existing active binding — panel source cannot overwrite
  // a scan-established binding.
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: chatKey,
        name: 'Codex session (stale cache)',
        cliSessionId: 'thread-old',  // stale — from before the restart
        filePath: 'C:/Users/demo/.codex/sessions/thread-old.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  // Assert: the scan-established binding (thread-new) must survive stale panel sync
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'single record — no duplicate from stale cache')

  const finalRecord = records.find(r => r.chatKey === chatKey)
  assert.ok(finalRecord, 'record still exists after stale panel sync')
  assert.equal(finalRecord.provider.cliSessionId, 'thread-new',
    'active binding must remain thread-new — stale panel cannot overwrite')
  assert.equal(finalRecord.provider.filePath,
    'C:/Users/demo/.codex/sessions/thread-new.jsonl',
    'active filePath must remain thread-new')

  // Index must reflect active binding, not stale cache
  const index = getIndex(userDataDir)
  assert.ok(index.providers['codex:session:thread-new'],
    'index must contain codex:session:thread-new')
  assert.equal(index.providers['codex:session:thread-old'], undefined,
    'index must NOT contain stale codex:session:thread-old')
})

test('stale panel cache after provider unbind does not create orphan record', () => {
  const userDataDir = makeTempUserData()

  // Create and detach
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Codex session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  // Detach (empty_upstream → detachCodexResumeMapping)
  detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
    reason: 'empty_upstream_response',
  }, { userDataDir })

  // Stale panel still references the old cliSessionId
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Codex session (stale)',
        cliSessionId: 'thread-1',  // the detached one
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'no orphan duplicate from stale panel')

  // resumeAllowed should remain false (stale panel cannot re-enable)
  const record = listSessionRecords({ userDataDir }).find(r => r.chatKey === 'chat-key-1')
  assert.ok(record, 'record still exists')
  // Note: syncPanelStateSessions with providerBindingSource='panel'
  // preserves metadata from the existing record
})

test('detach → stale panel sync does not re-enable resumeAllowed', () => {
  const userDataDir = makeTempUserData()

  // Create
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Codex session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  // Detach
  detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
  }, { userDataDir })

  // Verify detach state
  const beforeRecord = listSessionRecords({ userDataDir }).find(r => r.chatKey === 'chat-key-1')
  assert.ok(beforeRecord, 'record exists after detach')
  assert.equal(beforeRecord.metadata?.resumeAllowed, false)

  // Stale panel sync (same data as before)
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Codex session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  // resumeAllowed should remain false
  const afterRecord = listSessionRecords({ userDataDir }).find(r => r.chatKey === 'chat-key-1')
  assert.ok(afterRecord, 'record still exists after stale sync')
  // The key assertion: panel sync should not flip resumeAllowed back to true
  assert.equal(afterRecord.metadata?.resumeAllowed, false,
    'stale panel sync must not re-enable resumeAllowed')
})

// ---------------------------------------------------------------------------
// Scenario 6: Delete session → registry/panel/index consistency
// ---------------------------------------------------------------------------

test('delete → restorePanelState does not resurrect deleted session', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'To delete',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  // Delete
  deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-1',
  }, { userDataDir })

  // Try restore
  const result = restorePanelStateFromSessionRegistry('codex',
    { projects: [{ id: 'project-1', cwd: 'D:/repo', chats: [] }] },
    { userDataDir })

  assert.equal(result.added, 0, 'deleted session not restored')
  assert.deepEqual(listSessionRecords({ userDataDir }), [])
})

test('delete by chatKey removes index entries', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Delete me',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-1',
  }, { userDataDir })

  const index = getIndex(userDataDir)
  assert.deepEqual(index.sessions, {}, 'session index entry removed')
  assert.deepEqual(index.providers, {}, 'provider index entries removed')
})

test('delete → recreate with same providerId gets new chatKey', () => {
  const userDataDir = makeTempUserData()

  // Create and delete
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'First session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-1',
  }, { userDataDir })

  // New session with same cliSessionId via scan
  const enriched = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-1',
    cliSessionId: 'thread-1',
    providerSessionId: 'thread-1',
    name: 'New session',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    cwd: 'D:/repo',
    fileSize: 6000,
    createdAt: 500,
    updatedAt: 600,
    runtime: { model: 'gpt-5.1-codex' },
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.ok(enriched.chatKey, 'new scan produces a chatKey')
  assert.notEqual(enriched.chatKey, 'chat-key-1',
    'new session gets a different chatKey — never reuses deleted key')

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1, 'single new record')
})

// ---------------------------------------------------------------------------
// Cross-agent isolation
// ---------------------------------------------------------------------------

test('CodeX panel sync does not affect Claude records', () => {
  const userDataDir = makeTempUserData()

  // Create one of each
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-codex',
        sessionId: 'chat-key-codex',
        name: 'CodeX',
        cliSessionId: 'thread-1',
        filePath: 'C:/codex/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-2',
      cwd: 'D:/repo-2',
      chats: [{
        id: 'chat-claude',
        sessionId: 'chat-key-claude',
        name: 'Claude',
        cliSessionId: 'cli-1',
        filePath: 'C:/claude/cli-1.jsonl',
        createdAt: 300,
        updatedAt: 400,
      }],
    }],
  }, { userDataDir })

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 2, 'both agents have sessions')

  // Delete only CodeX
  deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-codex',
  }, { userDataDir })

  const afterRecords = listSessionRecords({ userDataDir })
  assert.equal(afterRecords.length, 1, 'only Claude remains')
  assert.equal(afterRecords[0].agent, 'claude', 'Claude session untouched')
})

test('repairSessionRegistry does not cross agent boundaries', () => {
  const userDataDir = makeTempUserData()

  // Create both with valid data
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-c1',
        sessionId: 'chat-key-codex',
        name: 'CodeX',
        cliSessionId: 'thread-1',
        filePath: 'C:/codex/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-2',
      cwd: 'D:/repo-2',
      chats: [{
        id: 'chat-c2',
        sessionId: 'chat-key-claude',
        name: 'Claude',
        cliSessionId: 'cli-1',
        filePath: 'C:/claude/cli-1.jsonl',
        createdAt: 300,
        updatedAt: 400,
      }],
    }],
  }, { userDataDir })

  const repair = repairSessionRegistry({ userDataDir })
  assert.ok(repair.ok)
  assert.equal(repair.changed, false, 'clean data needs no repair')

  // Both still exist
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 2)
})

// ---------------------------------------------------------------------------
// User title stability
// ---------------------------------------------------------------------------

test('user title survives provider scan with different title', () => {
  const userDataDir = makeTempUserData()

  // Create via panel sync
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'User custom name',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  // User renames (simulates setSessionTitle from rename IPC)
  setSessionTitle('chat-key-1', 'My renamed session', {
    agent: 'codex',
    cwd: 'D:/repo',
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    userDataDir,
  })

  // Provider scan brings different title from JSONL
  const enriched = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-1',
    cliSessionId: 'thread-1',
    providerSessionId: 'thread-1',
    name: 'Auto-generated title from transcript',  // different
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    cwd: 'D:/repo',
    fileSize: 6000,
    createdAt: 100,
    updatedAt: 500,
    runtime: {},
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  // User title should be preserved in scan summary
  assert.equal(enriched.name, 'My renamed session',
    'user title preserved through provider scan')

  // Registry record should still have user title
  const record = listSessionRecords({ userDataDir }).find(r => r.chatKey === 'chat-key-1')
  assert.ok(record, 'record exists after scan + rename')
  assert.equal(record.titleSource, 'user')
})

// ---------------------------------------------------------------------------
// repairSessionRegistry full consistency
// ---------------------------------------------------------------------------

test('repairSessionRegistry on clean data reports no changes', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  const repair = repairSessionRegistry({ userDataDir })
  assert.ok(repair.ok)
  assert.equal(repair.changed, false, 'clean registry needs no repair')
  assert.equal(repair.scannedRecords, 1)
})

test('writePanelState → sync sequence is consistent', () => {
  const userDataDir = makeTempUserData()

  // Simulates writePanelState() in codexAgent.js L3599-3606:
  //   1. Write panel state JSON
  //   2. syncPanelStateSessions('codex', payload)
  const payload = {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-write',
        name: 'New write',
        cliSessionId: 'thread-write',
        filePath: 'C:/write/thread-write.jsonl',
        model: 'gpt-5.1-codex',
        reasoningEffort: 'medium',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }

  syncPanelStateSessions('codex', payload, { userDataDir })

  // Record exists immediately after sync
  const record = listSessionRecords({ userDataDir }).find(r => r.chatKey === 'chat-key-write')
  assert.ok(record, 'record exists after writePanelState sync')
  assert.equal(record.chatKey, 'chat-key-write')
  assert.equal(record.provider.cliSessionId, 'thread-write')
  assert.equal(record.runtime.model, 'gpt-5.1-codex')
})
