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
  setSessionInstruction,
  syncPanelStateSessions,
  upsertRuntimeByProvider,
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
    },
  }, { userDataDir })

  assert.equal(updated, true)
  const record = findSessionRecordByProvider({ agent: 'claude', cliSessionId: 'cli-1' }, { userDataDir })
  assert.equal(record.runtime.model, 'new-model')
  assert.equal(record.runtime.effort, 'xhigh')
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
