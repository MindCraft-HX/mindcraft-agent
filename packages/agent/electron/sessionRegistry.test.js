const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  buildSessionRecordFromChat,
  deleteSessionRecordsByProvider,
  findSessionRecordByProvider,
  getSessionRecordPath,
  listSessionRecords,
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
