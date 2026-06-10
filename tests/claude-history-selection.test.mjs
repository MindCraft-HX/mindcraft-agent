import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveClaudeHistorySelection } from '../packages/agent/src/components/claudeCode/utils/historyRestoreSelection.mjs'

test('restores previously active chat instead of forcing latest chat', () => {
  const projects = [{
    id: 'proj-1',
    chats: [
      { id: 'chat-old', updatedAt: '2026-06-08T10:00:00.000Z' },
      { id: 'chat-bug', updatedAt: '2026-06-09T10:00:00.000Z' },
    ],
  }]

  const selection = resolveClaudeHistorySelection(projects, 'proj-1', 'chat-old')

  assert.equal(selection.activeProjectId, 'proj-1')
  assert.equal(selection.activeChatId, 'chat-old')
})

test('falls back to latest chat when restored active chat is missing', () => {
  const projects = [{
    id: 'proj-1',
    chats: [
      { id: 'chat-old', updatedAt: '2026-06-08T10:00:00.000Z' },
      { id: 'chat-new', updatedAt: '2026-06-09T10:00:00.000Z' },
    ],
  }]

  const selection = resolveClaudeHistorySelection(projects, 'proj-1', 'chat-missing')

  assert.equal(selection.activeProjectId, 'proj-1')
  assert.equal(selection.activeChatId, 'chat-new')
})

test('falls back to the last project when restored project is missing', () => {
  const projects = [
    { id: 'proj-1', chats: [{ id: 'chat-1', updatedAt: '2026-06-08T10:00:00.000Z' }] },
    { id: 'proj-2', chats: [{ id: 'chat-2', updatedAt: '2026-06-09T10:00:00.000Z' }] },
  ]

  const selection = resolveClaudeHistorySelection(projects, 'proj-missing', 'chat-missing')

  assert.equal(selection.activeProjectId, 'proj-2')
  assert.equal(selection.activeChatId, 'chat-2')
})
