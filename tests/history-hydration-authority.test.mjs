import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canHydrateChatFromDisk,
  hasRenderableMessages,
  shouldPreserveInMemoryHistory,
  shouldResetMessagesForDiskReload,
} from '../packages/agent/src/components/agentCommon/utils/historyHydrationAuthority.mjs'
import { shouldReloadClaudeChatFromDisk } from '../packages/agent/src/components/claudeCode/utils/sessionRefreshGuard.mjs'
import { shouldHydrateHistoryFromDisk } from '../packages/agent/src/components/codeX/utils/sessionLifecycle.mjs'

test('running chat with renderable messages keeps in-memory history authoritative', () => {
  const runningChat = {
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    messages: [{ role: 'user', text: 'hello' }],
    thinking: true,
    _awaitingDone: false,
  }

  assert.equal(hasRenderableMessages(runningChat), true)
  assert.equal(shouldPreserveInMemoryHistory(runningChat), true)
  assert.equal(canHydrateChatFromDisk(runningChat), false)
  assert.equal(shouldResetMessagesForDiskReload(runningChat), false)
})

test('awaiting-done Codex chat also keeps memory authoritative until terminal done', () => {
  const finishingChat = {
    filePath: 'C:/Users/demo/.codex/sessions/thread-1.jsonl',
    messages: [{ role: 'assistant', text: 'partial reply' }],
    thinking: false,
    _awaitingDone: true,
  }

  assert.equal(shouldHydrateHistoryFromDisk(finishingChat), false)
  assert.equal(shouldPreserveInMemoryHistory(finishingChat), true)
  assert.equal(canHydrateChatFromDisk(finishingChat), false)
})

test('idle file-backed chat returns to disk-authoritative hydration', () => {
  const idleChat = {
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    messages: [{ role: 'assistant', text: 'stable reply' }],
    thinking: false,
    _awaitingDone: false,
  }

  assert.equal(shouldPreserveInMemoryHistory(idleChat), false)
  assert.equal(canHydrateChatFromDisk(idleChat), true)
  assert.equal(shouldResetMessagesForDiskReload(idleChat), true)
})

test('Claude running chat requires both guards to avoid disk overwrite', () => {
  const runningChat = {
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    messages: [{ role: 'tool', toolName: 'thinking', text: 'working', status: 'running' }],
    thinking: true,
  }

  assert.equal(shouldReloadClaudeChatFromDisk(runningChat), true)
  assert.equal(canHydrateChatFromDisk(runningChat), false)
  assert.equal(shouldReloadClaudeChatFromDisk(runningChat) && canHydrateChatFromDisk(runningChat), false)
})

test('Claude pending tool sessions stay protected even after runtime settles', () => {
  const pendingToolChat = {
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    messages: [{ role: 'tool', toolName: 'askUserQuestion', status: 'pending', requestId: 'req-1' }],
    thinking: false,
  }

  assert.equal(canHydrateChatFromDisk(pendingToolChat), true)
  assert.equal(shouldReloadClaudeChatFromDisk(pendingToolChat), false)
})

test('empty running chats do not block initial disk hydrate after restart', () => {
  const emptyRunningChat = {
    filePath: 'C:/Users/demo/.claude/projects/repo/cli-1.jsonl',
    messages: [],
    thinking: true,
  }

  assert.equal(hasRenderableMessages(emptyRunningChat), false)
  assert.equal(shouldPreserveInMemoryHistory(emptyRunningChat), false)
  assert.equal(canHydrateChatFromDisk(emptyRunningChat), true)
})
