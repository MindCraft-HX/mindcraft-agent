const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  buildSessionRecordFromChat,
  deleteSessionRecordsByProvider,
  findSessionRecordByProvider,
  getSessionInstruction,
  getSessionRecordPath,
  listSessionRecords,
  makeProviderKeys,
  repairSessionRegistry,
  resolveSessionByProvider,
  setSessionTitle,
  setSessionInstruction,
  syncPanelStateSessions,
  upsertSessionFromProviderScan,
  upsertRuntimeByProvider,
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

test('repairSessionRegistry rewrites polluted provider chatKey and panel state only under userData', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'thread-1',
        name: 'Polluted session',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })
  fs.writeFileSync(path.join(userDataDir, 'codex-panel-state.json'), JSON.stringify({
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'thread-1',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }), 'utf8')

  const report = repairSessionRegistry({ userDataDir })

  assert.equal(report.ok, true)
  assert.equal(report.changed, true)
  assert.ok(report.backupPath)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.notEqual(records[0].chatKey, 'thread-1')
  assert.equal(records[0].provider.cliSessionId, 'thread-1')
  const panelState = JSON.parse(fs.readFileSync(path.join(userDataDir, 'codex-panel-state.json'), 'utf8'))
  assert.equal(panelState.projects[0].chats[0].sessionId, records[0].chatKey)
  assert.equal(panelState.projects[0].chats[0].cliSessionId, 'thread-1')
  assert.equal(fs.existsSync(path.join(userDataDir, 'session-registry-backups')), true)
})

test('repairSessionRegistry merges duplicate provider records and keeps user title', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        sessionId: 'chat-key-user',
        name: 'User title',
        titleSource: 'user',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
      }],
    }],
  }, { userDataDir })
  const duplicate = {
    schemaVersion: 1,
    chatKey: 'cli-1',
    agent: 'claude',
    projectId: 'project-1',
    cwd: 'D:/repo',
    title: 'Provider title',
    titleSource: 'provider',
    provider: {
      cliSessionId: 'cli-1',
      filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    },
    runtime: { model: 'claude-sonnet', effort: 'high' },
    instruction: { enabled: true, content: 'Keep instruction', attachments: [] },
    createdAt: 100,
    updatedAt: 300,
  }
  fs.writeFileSync(getSessionRecordPath('cli-1', { userDataDir }), JSON.stringify(duplicate, null, 2), 'utf8')

  const report = repairSessionRegistry({ userDataDir })

  assert.equal(report.ok, true)
  assert.equal(report.changed, true)
  const records = listSessionRecords({ userDataDir })
  assert.equal(records.length, 1)
  assert.equal(records[0].chatKey, 'chat-key-user')
  assert.equal(records[0].title, 'User title')
  assert.equal(records[0].titleSource, 'user')
  assert.equal(records[0].instruction.content, 'Keep instruction')
  assert.equal(records[0].runtime.model, 'claude-sonnet')
  const resolved = resolveSessionByProvider({ agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.equal(resolved.chatKey, 'chat-key-user')
})

test('repairSessionRegistry updates polluted panel chatKey when registry is already canonical', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('codex', {
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'chat-key-canonical',
        name: 'Canonical',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }, { userDataDir })
  fs.writeFileSync(path.join(userDataDir, 'codex-panel-state.json'), JSON.stringify({
    projects: [{
      id: 'project-1',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-1',
        sessionId: 'thread-1',
        cliSessionId: 'thread-1',
        filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
      }],
    }],
  }), 'utf8')

  const report = repairSessionRegistry({ userDataDir })

  assert.equal(report.ok, true)
  assert.equal(report.changed, true)
  assert.equal(report.repairedGroups.length, 0)
  const panelState = JSON.parse(fs.readFileSync(path.join(userDataDir, 'codex-panel-state.json'), 'utf8'))
  assert.equal(panelState.projects[0].chats[0].sessionId, 'chat-key-canonical')
})

test('repairSessionRegistry does not rewrite a panel from another agent on provider id collision', () => {
  const userDataDir = makeTempUserData()
  syncPanelStateSessions('claude', {
    projects: [{
      id: 'project-claude',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-claude',
        sessionId: 'claude-chat-key',
        name: 'Claude canonical',
        cliSessionId: 'same-provider-id',
        filePath: 'C:/Users/demo/.claude/projects/repo/same-provider-id.jsonl',
      }],
    }],
  }, { userDataDir })
  fs.writeFileSync(path.join(userDataDir, 'codex-panel-state.json'), JSON.stringify({
    projects: [{
      id: 'project-codex',
      cwd: 'D:/repo',
      chats: [{
        id: 'chat-codex',
        sessionId: 'same-provider-id',
        cliSessionId: 'same-provider-id',
        filePath: 'C:/Users/demo/.codex/sessions/same-provider-id.jsonl',
      }],
    }],
  }), 'utf8')

  const report = repairSessionRegistry({ userDataDir })

  assert.equal(report.changed, false)
  const panelState = JSON.parse(fs.readFileSync(path.join(userDataDir, 'codex-panel-state.json'), 'utf8'))
  assert.equal(panelState.projects[0].chats[0].sessionId, 'same-provider-id')
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
