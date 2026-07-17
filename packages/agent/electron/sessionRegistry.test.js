const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  buildSessionRecordFromChat,
  deleteSessionRecordsByProvider,
  detachSessionProviderBinding,
  deleteSessionRecord,
  findSessionRecordByProvider,
  getSessionDraft,
  getSessionInstruction,
  getSessionRecordPath,
  listSessionRecords,
  makeProviderKeys,
  restorePanelStateFromSessionRegistry,
  resolveSessionByProvider,
  clearSessionDraft,
  setSessionTitle,
  setSessionDraft,
  setSessionInstruction,
  syncPanelStateSessions,
  attachRegistrySessionToScanSummary,
  upsertSessionFromProviderScan,
  upsertRuntimeByProvider,
  upsertSessionRecord,
  normalizeSessionInstructionInput,
} = require('./sessionRegistry')

function makeTempUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-session-registry-'))
}

test('buildSessionRecordFromChat normalizes Claude chat mapping', () => {
  const record = buildSessionRecordFromChat(
    'claudeCode',
    { id: 'project-1', cwd: 'D:/repo' },
    {
      id: 'chat-1',
      sessionId: 'chat-key-1',
      name: 'Feature work',
      cliSessionId: 'cli-1',
      filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      model: 'claude-sonnet',
      effort: 'high',
      modelTier: 'sonnet',
      createdAt: 100,
      updatedAt: 200,
    },
  )

  assert.equal(record.chatKey, 'chat-key-1')
  assert.equal(record.agent, 'claude')
  assert.equal(record.projectId, 'project-1')
  assert.equal(record.provider.cliSessionId, 'cli-1')
  assert.equal(record.runtime.model, 'claude-sonnet')
  assert.equal(record.runtime.effort, 'high')
  assert.equal(record.runtime.modelTier, 'sonnet')
  assert.equal(record.titleSource, 'provider')
})

test('syncPanelStateSessions writes records under userData session-registry', () => {
  const userDataDir = makeTempUserData()

  const count = syncPanelStateSessions('codex', {
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
      }],
    }],
  }, { userDataDir })

  assert.equal(count, 1)
  const recordPath = getSessionRecordPath('chat-key-1', { userDataDir })
  assert.equal(fs.existsSync(recordPath), true)
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  assert.equal(record.agent, 'codex')
  assert.equal(record.provider.cliSessionId, 'thread-1')
  assert.equal(record.runtime.reasoningEffort, 'medium')
  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.equal(index.schemaVersion, 2)
  assert.equal(index.providers['codex:session:thread-1'], 'chat-key-1')
  assert.equal(index.providers['codex:path:c:/users/demo/.codex/sessions/thread-1.jsonl'], 'chat-key-1')
})

test('syncPanelStateSessions skips empty Codex local drafts', () => {
  const userDataDir = makeTempUserData()

  const count = syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-empty',
        name: '新对话',
        cliSessionId: '',
        filePath: '',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  assert.equal(count, 0)
  assert.equal(fs.existsSync(getSessionRecordPath('chat-key-empty', { userDataDir })), false)
  assert.deepEqual(listSessionRecords({ userDataDir }), [])
})

test('makeProviderKeys normalizes agent and file paths', () => {
  assert.deepEqual(makeProviderKeys('CodeX', {
    cliSessionId: 'thread-1',
    filePath: 'C:\\Users\\demo\\.codex\\sessions\\thread-1.jsonl',
  }), [
    'codex:session:thread-1',
    'codex:path:c:/users/demo/.codex/sessions/thread-1.jsonl',
  ])
})

test('resolveSessionByProvider uses provider index', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-1',
        name: 'Indexed session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const bySid = resolveSessionByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.equal(bySid.chatKey, 'chat-key-1')

  const byPath = resolveSessionByProvider({
    agent: 'codex',
    filePath: 'C:\\Users\\demo\\.codex\\sessions\\thread-1.jsonl',
  }, { userDataDir })
  assert.equal(byPath.chatKey, 'chat-key-1')
})

test('legacy _userRenamed becomes user titleSource and survives panel sync', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'User title',
        _userRenamed: true,
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Provider title should not win',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const record = resolveSessionByProvider({ agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.equal(record.title, 'User title')
  assert.equal(record.titleSource, 'user')
})

test('setSessionTitle writes registry title without changing provider mapping', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Original',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const result = setSessionTitle('chat-key-1', 'User picked title', { userDataDir })
  assert.equal(result.ok, true)

  const record = resolveSessionByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.equal(record.title, 'User picked title')
  assert.equal(record.titleSource, 'user')
  assert.equal(record.provider.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
})

test('title changes from stale panel state refresh registry updatedAt', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Original title',
        _userRenamed: true,
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  const before = resolveSessionByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.ok(before.updatedAt >= 200)

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Renamed title',
        titleSource: 'user',
        _userRenamed: true,
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  const after = resolveSessionByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.equal(after.title, 'Renamed title')
  assert.equal(after.titleSource, 'user')
  assert.ok(after.updatedAt > before.updatedAt)

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Renamed title',
        titleSource: 'user',
        _userRenamed: true,
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  const unchanged = resolveSessionByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.equal(unchanged.updatedAt, after.updatedAt)
})

test('provider scan real filePath replaces stale registry filePath in summary', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'User title',
        titleSource: 'user',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const summary = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-1',
    name: 'Provider title',
    filePath: 'C:/Users/demo/.codex/sessions/2026/06/19/rollout-thread-1.jsonl',
    updatedAt: 300,
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(summary.chatKey, 'chat-key-1')
  assert.equal(summary.name, 'User title')
  assert.equal(summary.filePath, 'C:/Users/demo/.codex/sessions/2026/06/19/rollout-thread-1.jsonl')

  const record = resolveSessionByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.equal(record.provider.filePath, 'C:/Users/demo/.codex/sessions/2026/06/19/rollout-thread-1.jsonl')
})

test('provider scans still return raw summaries when registry write fails', () => {
  const userDataDir = makeTempUserData()
  const blockedRegistryRoot = path.join(userDataDir, 'session-registry')
  fs.writeFileSync(blockedRegistryRoot, 'not a directory')

  const summary = attachRegistrySessionToScanSummary('claude', {
    id: 'cli-visible',
    cliSessionId: 'cli-visible',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-visible.jsonl',
    title: 'Visible provider prompt',
  }, { cwd: 'D:/repo' }, { userDataDir })

  assert.equal(summary.cliSessionId, 'cli-visible')
  assert.equal(summary.title, 'Visible provider prompt')
})

test('setSessionTitle can seed provider mapping before transcript scan', () => {
  const userDataDir = makeTempUserData()

  const result = setSessionTitle('chat-key-1', 'User picked title', {
    userDataDir,
    agent: 'codex',
    cwd: 'D:/repo',
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    model: 'gpt-5.1-codex',
    reasoningEffort: 'medium',
  })
  assert.equal(result.ok, true)

  const summary = upsertSessionFromProviderScan('codex', {
    id: 'thread-1',
    name: 'Provider title',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
  }, { cwd: 'D:/repo' }, { userDataDir })

  assert.equal(summary.chatKey, 'chat-key-1')
  assert.equal(summary.title, 'User picked title')
  assert.equal(summary.titleSource, 'user')
  assert.equal(summary.provider.cliSessionId, 'thread-1')
  assert.equal(summary.provider.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
  assert.equal(summary.runtime.model, 'gpt-5.1-codex')
  assert.equal(summary.runtime.reasoningEffort, 'medium')
})

test('upsertSessionRecord keeps one canonical record per provider identity', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-canonical',
        name: 'Canonical user title',
        _userRenamed: true,
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'thread-1',
        name: 'Scanned provider title',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-canonical')
  assert.equal(records[0].title, 'Canonical user title')
  assert.equal(records[0].titleSource, 'user')

  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.equal(index.providers['codex:session:thread-1'], 'chat-key-canonical')
  assert.equal(index.sessions['thread-1'], undefined)
})

test('upsertSessionRecord deletes orphan record file after provider merge', () => {
  const userDataDir = makeTempUserData()
  const providerFilePath = 'C:/Users/demo/.codex/sessions/thread-1.jsonl'

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-canonical',
        name: 'Canonical user title',
        _userRenamed: true,
        cliSessionId: 'thread-1',
        filePath: providerFilePath,
      }],
    }],
  }, { userDataDir })

  const orphanPath = getSessionRecordPath('thread-1', { userDataDir })
  fs.writeFileSync(orphanPath, JSON.stringify({
    schemaVersion: 1,
    chatKey: 'thread-1',
    agent: 'codex',
    projectId: 'project-1',
    cwd: 'D:/repo',
    title: 'Orphan provider title',
    titleSource: 'provider',
    provider: {
      cliSessionId: 'thread-1',
      filePath: providerFilePath,
    },
    createdAt: 100,
    updatedAt: 200,
  }, null, 2), 'utf8')
  assert.equal(fs.existsSync(orphanPath), true)

  const ok = upsertSessionRecord({
    chatKey: 'thread-1',
    agent: 'codex',
    projectId: 'project-1',
    cwd: 'D:/repo',
    title: 'Scanned provider title',
    titleSource: 'provider',
    provider: {
      cliSessionId: 'thread-1',
      filePath: providerFilePath,
    },
  }, { userDataDir })

  assert.equal(ok, true)
  assert.equal(fs.existsSync(orphanPath), false)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-canonical')
  assert.equal(records[0].title, 'Canonical user title')
  assert.equal(records[0].titleSource, 'user')
})

test('upsertSessionRecord cleans duplicate provider records even when index misses the orphan', () => {
  const userDataDir = makeTempUserData()
  const providerFilePath = 'C:/Users/demo/.codex/sessions/thread-1.jsonl'

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-canonical',
        name: 'Canonical user title',
        titleSource: 'user',
        cliSessionId: 'thread-1',
        filePath: providerFilePath,
      }],
    }],
  }, { userDataDir })

  const orphanPath = getSessionRecordPath('chat-key-orphan', { userDataDir })
  fs.writeFileSync(orphanPath, JSON.stringify({
    schemaVersion: 1,
    chatKey: 'chat-key-orphan',
    agent: 'codex',
    projectId: 'project-1',
    cwd: 'D:/repo',
    title: 'Orphan provider title',
    titleSource: 'provider',
    provider: {
      cliSessionId: 'thread-1',
      filePath: providerFilePath,
    },
    createdAt: 100,
    updatedAt: 300,
  }, null, 2), 'utf8')

  const indexPath = path.join(userDataDir, 'session-registry', 'index.json')
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  delete index.providers['codex:session:thread-1']
  delete index.providers['codex:path:c:/users/demo/.codex/sessions/thread-1.jsonl']
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8')

  const ok = upsertSessionRecord({
    chatKey: 'chat-key-fresh',
    agent: 'codex',
    projectId: 'project-1',
    cwd: 'D:/repo',
    title: 'Scanned provider title',
    titleSource: 'provider',
    provider: {
      cliSessionId: 'thread-1',
      filePath: providerFilePath,
    },
  }, { userDataDir })

  assert.equal(ok, true)
  assert.equal(fs.existsSync(orphanPath), false)
  assert.equal(fs.existsSync(getSessionRecordPath('chat-key-fresh', { userDataDir })), false)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-canonical')
  const repairedIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  assert.equal(repairedIndex.providers['codex:session:thread-1'], 'chat-key-canonical')
})

test('panel-state sync does not overwrite an existing provider binding', () => {
  const userDataDir = makeTempUserData()

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Original thread',
        cliSessionId: 'thread-old',
        filePath: 'C:/Users/demo/.codex/sessions/thread-old.jsonl',
      }],
    }],
  }, { userDataDir })

  const rebound = setSessionTitle('chat-key-1', 'Retargeted thread', {
    userDataDir,
    agent: 'codex',
    cwd: 'D:/repo',
    cliSessionId: 'thread-new',
    filePath: 'C:/Users/demo/.codex/sessions/thread-new.jsonl',
  })
  assert.equal(rebound.ok, true)

  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Stale panel cache',
        cliSessionId: 'thread-old',
        filePath: 'C:/Users/demo/.codex/sessions/thread-old.jsonl',
      }],
    }],
  }, { userDataDir })

  const record = listSessionRecords({ userDataDir })[0]
  assert.equal(record.chatKey, 'chat-key-1')
  assert.equal(record.provider.cliSessionId, 'thread-new')
  assert.equal(record.provider.filePath, 'C:/Users/demo/.codex/sessions/thread-new.jsonl')
  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.equal(index.providers['codex:session:thread-new'], 'chat-key-1')
  assert.equal(index.providers['codex:session:thread-old'], undefined)
})

test('upsertSessionFromProviderScan generates MindCraft chatKey instead of using provider sessionId', () => {
  const userDataDir = makeTempUserData()
  const record = upsertSessionFromProviderScan('codex', {
    id: 'thread-1',
    sessionId: 'thread-1',
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    cwd: 'D:/repo',
    providerTitle: 'Provider title',
  }, { cwd: 'D:/repo' }, { userDataDir })

  assert.ok(record.chatKey)
  assert.notEqual(record.chatKey, 'thread-1')
  assert.equal(record.provider.cliSessionId, 'thread-1')
  assert.equal(record.title, 'Provider title')
  assert.equal(record.titleSource, 'provider')
})

test('deleteSessionRecordsByProvider removes matching provider filePath records', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Delete me',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const deleted = deleteSessionRecordsByProvider({
    agent: 'claude',
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
  }, { userDataDir })

  assert.equal(deleted, 1)
  assert.deepEqual(listSessionRecords({ userDataDir }), [])
  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.deepEqual(index.sessions, {})
  assert.deepEqual(index.providers, {})
})

test('deleteSessionRecordsByProvider removes matching Codex metadata-only record by chatKey', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-meta-only',
        name: 'Metadata only',
        cliSessionId: '',
        filePath: '',
      }],
    }],
  }, { userDataDir })

  const deleted = deleteSessionRecordsByProvider({
    agent: 'codex',
    chatKey: 'chat-key-meta-only',
  }, { userDataDir })

  assert.equal(deleted, 1)
  assert.deepEqual(listSessionRecords({ userDataDir }), [])
  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.deepEqual(index.sessions, {})
  assert.deepEqual(index.providers, {})
})

test('detachSessionProviderBinding disables resume without deleting provider identity', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Keep me',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        model: 'deepseek-v4-pro',
      }],
    }],
  }, { userDataDir })
  setSessionInstruction('chat-key-1', {
    enabled: true,
    content: 'Session instruction',
  }, { userDataDir })

  const detached = detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
  }, { userDataDir })

  assert.equal(detached, 1)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-1')
  assert.equal(records[0].title, 'Keep me')
  assert.equal(records[0].provider.cliSessionId, 'thread-1')
  assert.equal(records[0].provider.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
  assert.equal(records[0].instruction.content, 'Session instruction')
  assert.equal(records[0].metadata.resumeAllowed, false)
  assert.equal(records[0].metadata.detachedProviderBinding.cliSessionId, 'thread-1')
  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.equal(index.sessions['chat-key-1'].cliSessionId, 'thread-1')
  assert.equal(index.providers['codex:session:thread-1'], 'chat-key-1')
})

test('detached provider binding is not re-enabled by stale panel-state sync', () => {
  const userDataDir = makeTempUserData()
  const panelState = {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Keep me',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }
  syncPanelStateSessions('codex', panelState, { userDataDir })
  detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
  }, { userDataDir })

  syncPanelStateSessions('codex', panelState, { userDataDir })

  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].provider.cliSessionId, 'thread-1')
  assert.equal(records[0].provider.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
  assert.equal(records[0].metadata.resumeAllowed, false)
  assert.equal(records[0].metadata.detachedProviderBinding.cliSessionId, 'thread-1')
  const index = JSON.parse(fs.readFileSync(path.join(userDataDir, 'session-registry', 'index.json'), 'utf8'))
  assert.equal(index.providers['codex:session:thread-1'], 'chat-key-1')
})

test('detached provider scan remains visible and maps back to original chat', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Keep me',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })
  detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-1',
  }, { userDataDir })

  const summary = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-1',
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    name: 'Provider title',
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(summary.chatKey, 'chat-key-1')
  assert.equal(summary.cliSessionId, 'thread-1')
  assert.equal(summary.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-1')
  assert.equal(records[0].provider.cliSessionId, 'thread-1')
  assert.equal(records[0].metadata.resumeAllowed, false)
})

test('detached provider scan repairs legacy cleared provider identity', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Keep me',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const recordPath = getSessionRecordPath('chat-key-1', { userDataDir })
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  record.provider = { cliSessionId: '', filePath: '' }
  record.metadata = {
    ...(record.metadata || {}),
    resumeAllowed: false,
    detachedProviderBinding: {
      cliSessionId: 'thread-1',
      filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      reason: 'empty_upstream_response',
      detachedAt: Date.now(),
    },
  }
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf8')

  const summary = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-1',
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    name: 'Provider title',
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(summary.chatKey, 'chat-key-1')
  assert.equal(summary.cliSessionId, 'thread-1')
  const records = listSessionRecords({ userDataDir })
  assert.equal(records[0].provider.cliSessionId, 'thread-1')
  assert.equal(records[0].provider.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
  assert.equal(records[0].metadata.resumeAllowed, false)
})

test('runtime fingerprint detach prevents old Codex thread from reappearing as a new chat', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Original thread',
        cliSessionId: 'thread-old',
        filePath: 'C:/Users/demo/.codex/sessions/thread-old.jsonl',
        model: 'gpt-5.5',
      }],
    }],
  }, { userDataDir })

  const detached = detachSessionProviderBinding({
    agent: 'codex',
    chatKey: 'chat-key-1',
    cliSessionId: 'thread-old',
    filePath: 'C:/Users/demo/.codex/sessions/thread-old.jsonl',
    reason: 'runtime_fingerprint_changed',
  }, { userDataDir })
  assert.equal(detached, 1)

  const rebound = setSessionTitle('chat-key-1', 'Retargeted thread', {
    userDataDir,
    agent: 'codex',
    cwd: 'D:/repo',
    cliSessionId: 'thread-new',
    filePath: 'C:/Users/demo/.codex/sessions/thread-new.jsonl',
    model: 'gpt-5.4',
    reasoningEffort: 'high',
  })
  assert.equal(rebound.ok, true)

  const staleSummary = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-old',
    cliSessionId: 'thread-old',
    filePath: 'C:/Users/demo/.codex/sessions/thread-old.jsonl',
    name: 'Stale provider title',
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(staleSummary.chatKey, 'chat-key-1')
  assert.equal(staleSummary.cliSessionId, 'thread-new')

  const activeSummary = attachRegistrySessionToScanSummary('codex', {
    id: 'thread-new',
    cliSessionId: 'thread-new',
    filePath: 'C:/Users/demo/.codex/sessions/thread-new.jsonl',
    name: 'Active provider title',
  }, { id: 'project-1', cwd: 'D:/repo' }, { userDataDir })

  assert.equal(activeSummary.chatKey, 'chat-key-1')
  assert.equal(activeSummary.cliSessionId, 'thread-new')
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-1')
  assert.equal(records[0].provider.cliSessionId, 'thread-new')
  assert.equal(records[0].metadata.detachedProviderBinding.reason, 'runtime_fingerprint_changed')
})

test('upsertRuntimeByProvider updates runtime for an existing provider mapping', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Runtime update',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
        model: 'old-model',
        effort: 'medium',
      }],
    }],
  }, { userDataDir })

  const updated = upsertRuntimeByProvider({
    agent: 'claude',
    cliSessionId: 'cli-1',
    runtime: {
      model: 'new-model',
      effort: 'xhigh',
      modelTier: 'reasoning',
    },
  }, { userDataDir })

  assert.equal(updated, true)
  const record = findSessionRecordByProvider({ agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.equal(record.runtime.model, 'new-model')
  assert.equal(record.runtime.effort, 'xhigh')
  assert.equal(record.runtime.modelTier, 'reasoning')
})

test('setSessionInstruction stores instruction without losing session mapping', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Mapped session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
        model: 'gpt-5.1-codex',
        reasoningEffort: 'high',
      }],
    }],
  }, { userDataDir })

  const result = setSessionInstruction('chat-key-1', {
    enabled: true,
    description: 'Customer A macro session',
    content: 'Use customer A macro mapping.',
  }, { userDataDir })

  assert.equal(result.ok, true)
  assert.equal(result.instruction.enabled, true)
  assert.equal(result.instruction.description, 'Customer A macro session')
  assert.equal(result.instruction.content, 'Use customer A macro mapping.')

  const record = findSessionRecordByProvider({ agent: 'codex', cliSessionId: 'thread-1' }, { userDataDir })
  assert.equal(record.chatKey, 'chat-key-1')
  assert.equal(record.title, 'Mapped session')
  assert.equal(record.description, 'Customer A macro session')
  assert.equal(record.provider.filePath, 'C:/Users/demo/.codex/sessions/thread-1.jsonl')
  assert.equal(record.runtime.model, 'gpt-5.1-codex')
  assert.equal(record.runtime.reasoningEffort, 'high')
  assert.equal(record.instruction.enabled, true)
  assert.equal(record.instruction.instructionId, '')
  assert.equal(record.instruction.content, 'Use customer A macro mapping.')
})

test('syncPanelStateSessions preserves existing instruction data (no overwrite)', () => {
  const userDataDir = makeTempUserData()
  // 1. Create a session via sync
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Keep my instruction',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  // 2. Set instruction
  const result = setSessionInstruction('chat-key-1', {
    enabled: true,
    description: 'My session',
    content: 'Important instruction content',
  }, { userDataDir })
  assert.equal(result.ok, true)
  assert.equal(result.instruction.enabled, true)

  // 3. Sync panel state again (simulates tab switch / panel state save)
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Keep my instruction',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  // 4. Instruction should still be there
  const instruction = getSessionInstruction('chat-key-1', { userDataDir })
  assert.equal(instruction.enabled, true, 'enabled should survive panel state sync')
  assert.equal(instruction.content, 'Important instruction content', 'content should survive panel state sync')
})

test('setSessionDraft stores draft in session registry without changing provider mapping', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Draft session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })

  const result = setSessionDraft('chat-key-1', { text: 'unfinished prompt', updatedAt: 1234 }, { userDataDir })

  assert.equal(result.ok, true)
  assert.deepEqual(getSessionDraft('chat-key-1', { userDataDir }), {
    text: 'unfinished prompt',
    updatedAt: 1234,
  })

  const resolved = findSessionRecordByProvider({
    agent: 'codex',
    cliSessionId: 'thread-1',
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
  }, { userDataDir })
  assert.equal(resolved.chatKey, 'chat-key-1')
  assert.equal(resolved.draft.text, 'unfinished prompt')
})

test('syncPanelStateSessions preserves existing draft data', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Draft session',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  setSessionDraft('chat-key-1', { text: 'keep this draft', updatedAt: 2222 }, { userDataDir })
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-1',
        name: 'Draft session updated',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })

  assert.deepEqual(getSessionDraft('chat-key-1', { userDataDir }), {
    text: 'keep this draft',
    updatedAt: 2222,
  })
})

test('clearSessionDraft clears only draft content', () => {
  const userDataDir = makeTempUserData()
  setSessionInstruction('chat-key-1', {
    enabled: true,
    description: 'Instruction',
    content: 'Keep instruction',
  }, { userDataDir })
  setSessionDraft('chat-key-1', { text: 'temporary draft', updatedAt: 3333 }, { userDataDir })

  const cleared = clearSessionDraft('chat-key-1', { userDataDir })
  const instruction = getSessionInstruction('chat-key-1', { userDataDir })

  assert.equal(cleared.ok, true)
  assert.equal(getSessionDraft('chat-key-1', { userDataDir }).text, '')
  assert.equal(instruction.enabled, true)
  assert.equal(instruction.content, 'Keep instruction')
})

test('getSessionInstruction returns disabled empty state for unknown chat', () => {
  const userDataDir = makeTempUserData()
  const instruction = getSessionInstruction('missing-chat', { userDataDir })

  assert.deepEqual(instruction, {
    enabled: false,
    instructionId: '',
    description: '',
    content: '',
    attachments: [],
  })
})

test('getSessionInstruction reads legacy instruction record as fallback', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-legacy',
        name: 'Legacy mapped session',
        instruction: {
          enabled: true,
          instructionId: 'instruction-legacy',
        },
      }],
    }],
  }, { userDataDir })

  const legacyDir = path.join(userDataDir, 'session-registry', 'instructions')
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'instruction-legacy.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'instruction-legacy',
    title: 'Legacy description',
    content: 'Legacy instruction content.',
    attachments: ['legacy.md'],
  }), 'utf8')

  const instruction = getSessionInstruction('chat-key-legacy', { userDataDir })

  assert.equal(instruction.enabled, true)
  assert.equal(instruction.instructionId, 'instruction-legacy')
  assert.equal(instruction.description, 'Legacy description')
  assert.equal(instruction.content, 'Legacy instruction content.')
  assert.deepEqual(instruction.attachments, ['legacy.md'])
})

test('getSessionInstruction preserves legacy inline instruction title as description', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-inline-title',
        name: 'Inline title session',
        instruction: {
          enabled: true,
          title: 'Inline legacy title',
          content: 'Inline content',
        },
      }],
    }],
  }, { userDataDir })

  const instruction = getSessionInstruction('chat-key-inline-title', { userDataDir })

  assert.equal(instruction.enabled, true)
  assert.equal(instruction.description, 'Inline legacy title')
  assert.equal(instruction.content, 'Inline content')
})

test('setSessionInstruction rejects oversized content without overwriting existing data', () => {
  const userDataDir = makeTempUserData()
  const initial = setSessionInstruction('chat-key-limit', {
    enabled: true,
    description: 'Initial',
    content: 'short',
  }, { userDataDir })
  assert.equal(initial.ok, true)

  const rejected = setSessionInstruction('chat-key-limit', {
    enabled: true,
    description: 'Initial',
    content: 'x'.repeat(100001),
  }, { userDataDir })

  assert.deepEqual(rejected, { ok: false, error: 'content_too_large' })
  const instruction = getSessionInstruction('chat-key-limit', { userDataDir })
  assert.equal(instruction.content, 'short')
})

test('normalizeSessionInstructionInput rejects oversized attachment payloads', () => {
  assert.deepEqual(
    normalizeSessionInstructionInput({ attachments: ['x'.repeat(4097)] }),
    { ok: false, error: 'attachment_too_large' },
  )
  assert.deepEqual(
    normalizeSessionInstructionInput({ attachments: Array.from({ length: 21 }, (_, i) => `a-${i}`) }),
    { ok: false, error: 'attachments_too_many' },
  )
})

test('restorePanelStateFromSessionRegistry backfills missing Codex chats into existing cwd project', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-bound',
        name: 'Bound chat',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }, {
        id: 'chat-2',
        sessionId: 'chat-key-local',
        name: 'Local draft',
        cliSessionId: '',
        filePath: '',
        model: 'gpt-5.1',
        reasoningEffort: 'medium',
        createdAt: 100,
        updatedAt: 200,
      }],
    }],
  }, { userDataDir })

  const panelState = {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-bound',
        name: 'Bound chat',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }

  const result = restorePanelStateFromSessionRegistry('codex', panelState, { userDataDir })

  assert.equal(result.changed, true)
  assert.equal(result.added, 1)
  assert.equal(result.addedProjects, 0)
  assert.equal(panelState.projects[0].chats.length, 2)
  const restored = panelState.projects[0].chats.find(chat => chat.sessionId === 'chat-key-local')
  assert.ok(restored)
  assert.equal(restored.id, 'chat-chat-key-local')
  assert.equal(restored.name, 'Local draft')
  assert.equal(restored.cliSessionId, '')
  assert.equal(restored.filePath, '')
  assert.equal(restored.model, 'gpt-5.1')
  assert.equal(restored.reasoningEffort, 'medium')
  assert.equal(restored._resumeAllowed, true)
})

test('restorePanelStateFromSessionRegistry rebuilds projects only when Codex panel is empty', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo-a',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-a',
        name: 'Repo A',
        cliSessionId: 'thread-a',
        filePath: 'C:/missing/thread-a.jsonl',
      }],
    }, {
      id: 'project-2',
      cwd: 'D:/repo-b',
      chats: [{
        id: 'chat-2',
        sessionId: 'chat-key-b',
        name: 'Repo B',
        cliSessionId: '',
        filePath: '',
      }],
    }],
  }, { userDataDir })

  const panelState = { projects: [] }
  const result = restorePanelStateFromSessionRegistry('codex', panelState, { userDataDir })

  assert.equal(result.changed, true)
  assert.equal(result.addedProjects, 2)
  assert.equal(result.added, 2)
  assert.deepEqual(panelState.projects.map(project => project.cwd).sort(), ['D:/repo-a', 'D:/repo-b'])
  const restoredBound = panelState.projects.find(project => project.cwd === 'D:/repo-a').chats[0]
  assert.equal(restoredBound.cliSessionId, 'thread-a')
  assert.equal(restoredBound._resumeAllowed, false)

  syncPanelStateSessions('codex', panelState, { userDataDir })
  const record = findSessionRecordByProvider({ agent: 'codex', cliSessionId: 'thread-a' }, { userDataDir })
  assert.equal(record.metadata.resumeAllowed, false)
})

test('restorePanelStateFromSessionRegistry skips legacy empty Codex local drafts from registry', () => {
  const userDataDir = makeTempUserData()
  const recordPath = getSessionRecordPath('chat-key-empty', { userDataDir })
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(recordPath, JSON.stringify({
    schemaVersion: 1,
    chatKey: 'chat-key-empty',
    agent: 'codex',
    projectId: 'project-1',
    cwd: 'D:/repo',
    title: '新对话',
    titleSource: 'provider',
    description: '',
    metadata: {},
    provider: {
      cliSessionId: '',
      filePath: '',
    },
    runtime: {
      model: 'gpt-5.4',
      reasoningEffort: 'high',
    },
    createdAt: 100,
    updatedAt: 200,
  }, null, 2), 'utf8')
  fs.writeFileSync(path.join(userDataDir, 'session-registry', 'index.json'), JSON.stringify({
    schemaVersion: 2,
    sessions: {
      'chat-key-empty': {
        agent: 'codex',
        projectId: 'project-1',
        cwd: 'D:/repo',
        title: '新对话',
        titleSource: 'provider',
        description: '',
        cliSessionId: '',
        filePath: '',
        updatedAt: 200,
        path: 'sessions/chat-key-empty.json',
      },
    },
    providers: {},
  }, null, 2), 'utf8')

  const panelState = {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [],
    }],
  }

  const result = restorePanelStateFromSessionRegistry('codex', panelState, { userDataDir })

  assert.equal(result.changed, false)
  assert.equal(result.added, 0)
  assert.equal(panelState.projects[0].chats.length, 0)
})

// T173: cache isolation tests
test('draft cache isolates different userDataDir for same chatKey', () => {
  const dirA = makeTempUserData()
  const dirB = makeTempUserData()
  const optsA = { userDataDir: dirA }
  const optsB = { userDataDir: dirB }

  // Set up index in both directories (required for setSessionDraft to write)
  fs.mkdirSync(path.join(dirA, 'session-registry', 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dirA, 'session-registry', 'index.json'), JSON.stringify({
    schemaVersion: 2, sessions: {}, providers: {},
  }))
  fs.mkdirSync(path.join(dirB, 'session-registry', 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dirB, 'session-registry', 'index.json'), JSON.stringify({
    schemaVersion: 2, sessions: {}, providers: {},
  }))

  // Write different drafts to same chatKey in different directories
  setSessionDraft('chat-1', { text: 'draft-in-A', updatedAt: 100 }, optsA)
  setSessionDraft('chat-1', { text: 'draft-in-B', updatedAt: 200 }, optsB)

  // Read back: each directory should return its own draft
  const a = getSessionDraft('chat-1', optsA)
  const b = getSessionDraft('chat-1', optsB)

  assert.equal(a.text, 'draft-in-A', 'dirA should return its own draft')
  assert.equal(a.updatedAt, 100)
  assert.equal(b.text, 'draft-in-B', 'dirB should return its own draft')
  assert.equal(b.updatedAt, 200)
})

test('deleteSessionRecord clears draft cache so stale data does not revive', () => {
  const dir = makeTempUserData()
  const opts = { userDataDir: dir }

  // Set up index + draft
  fs.mkdirSync(path.join(dir, 'session-registry', 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'session-registry', 'index.json'), JSON.stringify({
    schemaVersion: 2,
    sessions: { 'chat-1': { agent: 'codex', chatKey: 'chat-1', cwd: '/test' } },
    providers: {},
  }))

  setSessionDraft('chat-1', { text: 'will-be-deleted' }, opts)
  const before = getSessionDraft('chat-1', opts)
  assert.equal(before.text, 'will-be-deleted', 'draft present before delete')

  deleteSessionRecord('chat-1', opts)

  const after = getSessionDraft('chat-1', opts)
  assert.equal(after.text, '', 'draft should be empty after session record deleted')
  assert.equal(after.updatedAt, 0)
})
