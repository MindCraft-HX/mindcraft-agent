import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getClaudeChatBindingKey,
  getClaudeChatKey,
  getClaudeCliSessionId,
  getClaudeSessionFilePath,
  isBoundClaudeChat,
  isDraftClaudeChat,
  isPendingClaudeSessionBindingCandidate,
  usesLegacyCliSessionAsChatKey,
} from '../packages/agent/src/components/claudeCode/utils/claudeSessionIdentity.mjs'

test('claude identity helper distinguishes draft chat key from CLI session id', () => {
  const draft = {
    sessionId: 'session-chat-1-1780000000000',
    cliSessionId: '',
    filePath: '',
  }

  assert.equal(getClaudeChatKey(draft), 'session-chat-1-1780000000000')
  assert.equal(getClaudeCliSessionId(draft), '')
  assert.equal(getClaudeSessionFilePath(draft), '')
  assert.equal(isDraftClaudeChat(draft), true)
  assert.equal(isBoundClaudeChat(draft), false)
})

test('claude identity helper treats CLI id and file path as durable binding keys', () => {
  assert.equal(getClaudeChatBindingKey({
    sessionId: 'runtime-key',
    cliSessionId: '11111111-1111-1111-1111-111111111111',
    filePath: 'C:/repo/session.jsonl',
  }), 'sid:11111111-1111-1111-1111-111111111111')

  assert.equal(getClaudeChatBindingKey({
    sessionId: 'runtime-key',
    cliSessionId: '',
    filePath: 'C:\\repo\\session.jsonl',
  }), 'path:c:/repo/session.jsonl')
})

test('pending binding candidate requires draft state plus explicit pending signal or sent user message', () => {
  assert.equal(isPendingClaudeSessionBindingCandidate({
    sessionId: 'session-chat-1-1780000000000',
    cliSessionId: '',
    filePath: '',
  }), false)

  assert.equal(isPendingClaudeSessionBindingCandidate({
    sessionId: 'session-chat-1-1780000000000',
    cliSessionId: '',
    filePath: '',
    messages: [{ role: 'user', text: 'hello' }],
  }), true)

  assert.equal(isPendingClaudeSessionBindingCandidate({
    sessionId: 'session-chat-1-1780000000000',
    cliSessionId: '11111111-1111-1111-1111-111111111111',
    filePath: '',
    _pendingSessionBinding: true,
  }), false)
})

test('legacy CLI UUID used as renderer key is recognized for dedupe preference only', () => {
  assert.equal(usesLegacyCliSessionAsChatKey({
    sessionId: '11111111-1111-1111-1111-111111111111',
    cliSessionId: '11111111-1111-1111-1111-111111111111',
  }), true)

  assert.equal(usesLegacyCliSessionAsChatKey({
    sessionId: 'runtime-key',
    cliSessionId: '11111111-1111-1111-1111-111111111111',
  }), false)
})
