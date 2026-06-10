import assert from 'node:assert/strict'
import test from 'node:test'

import {
  adoptScannedClaudeSession,
  findPendingClaudeSessionForAdoption,
  hasUnboundClaudeSessionPendingAdoption,
  isPendingClaudeSessionBinding,
  shouldDeferClaudeSessionMessageTitle,
} from '../packages/agent/src/components/claudeCode/utils/pendingSessionBinding.mjs'

test('findPendingClaudeSessionForAdoption prefers active pending chat', () => {
  const chats = [
    {
      id: 'chat-1',
      createdAt: 10,
      cliSessionId: '',
      filePath: '',
      _pendingSessionBinding: true,
    },
    {
      id: 'chat-2',
      createdAt: 20,
      cliSessionId: '',
      filePath: '',
      _pendingSessionBinding: true,
    },
  ]

  const adopted = findPendingClaudeSessionForAdoption(chats, { activeChatId: 'chat-1' })
  assert.equal(adopted?.id, 'chat-1')
})

test('adoptScannedClaudeSession upgrades pending chat instead of requiring duplicate insertion', () => {
  const pendingChat = {
    id: 'chat-1',
    name: '新对话',
    createdAt: 10,
    updatedAt: null,
    cliSessionId: '',
    filePath: '',
    fileSize: null,
    _pendingSessionBinding: true,
    _userRenamed: false,
  }

  const scanned = {
    id: '11111111-1111-1111-1111-111111111111',
    filePath: 'D:/repo/.claude/session.jsonl',
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:01:00.000Z',
    fileSize: 1234,
    isCustomTitle: false,
  }

  const changed = adoptScannedClaudeSession(pendingChat, scanned, '新增了一个模型，qwen3.7-plus,...')
  assert.equal(changed, true)
  assert.equal(pendingChat.cliSessionId, scanned.id)
  assert.equal(pendingChat.filePath, scanned.filePath)
  assert.equal(pendingChat.fileSize, 1234)
  assert.equal(pendingChat._pendingSessionBinding, false)
  assert.equal(pendingChat.name, '新增了一个模型，qwen3.7-plus,...')
})

test('pending session binding suppresses message-summary title fallback', () => {
  const chat = {
    id: 'chat-1',
    cliSessionId: '',
    filePath: '',
    _pendingSessionBinding: true,
  }

  assert.equal(isPendingClaudeSessionBinding(chat), true)
  assert.equal(shouldDeferClaudeSessionMessageTitle(chat), true)
})

test('unbound pending chat remains protected after thinking finishes', () => {
  const chats = [
    {
      id: 'chat-1',
      sessionId: 'session-chat-1-1780000000000',
      cliSessionId: '',
      filePath: '',
      thinking: false,
      _pendingSessionBinding: true,
      messages: [
        { role: 'user', text: 'UI 渲染优化' },
        { role: 'assistant', text: '已完成。' },
      ],
    },
  ]

  assert.equal(hasUnboundClaudeSessionPendingAdoption(chats), true)
})

test('restored sent chat without binding metadata is still adoptable', () => {
  const chats = [
    {
      id: 'chat-1',
      sessionId: 'session-chat-1-1780000000000',
      cliSessionId: '',
      filePath: '',
      thinking: false,
      messages: [
        { role: 'user', text: 'UI 渲染优化' },
      ],
    },
  ]

  const adopted = findPendingClaudeSessionForAdoption(chats, { activeChatId: 'chat-1' })
  assert.equal(adopted?.id, 'chat-1')
  assert.equal(hasUnboundClaudeSessionPendingAdoption(chats), true)
})
