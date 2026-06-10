import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveQueuedInputFlushTarget,
  canFlushQueuedInputTarget,
} from '../packages/agent/src/components/codeX/utils/queuedInputFlush.mjs'

test('resolveQueuedInputFlushTarget finds queued tab and owner project', () => {
  const tab = { id: 'chat-1', sessionId: 'sess-1', _queuedInput: 'next prompt' }
  const ownerProject = { id: 'proj-1', chats: [tab] }
  const projects = [ownerProject]

  const target = resolveQueuedInputFlushTarget({
    payload: { sessionId: 'sess-1' },
    projects,
    activeProject: { id: 'proj-2', chats: [] },
  })

  assert.equal(target?.sessionId, 'sess-1')
  assert.equal(target?.text, 'next prompt')
  assert.equal(target?.tab, tab)
  assert.equal(target?.ownerProject, ownerProject)
  assert.equal(canFlushQueuedInputTarget(target), true)
})

test('resolveQueuedInputFlushTarget returns null when no queued input exists', () => {
  const tab = { id: 'chat-1', sessionId: 'sess-1', _queuedInput: '' }
  const projects = [{ id: 'proj-1', chats: [tab] }]

  const target = resolveQueuedInputFlushTarget({
    payload: { sessionId: 'sess-1' },
    projects,
    activeProject: { id: 'proj-1', chats: [tab] },
  })

  assert.equal(target, null)
})

test('canFlushQueuedInputTarget rejects blank queued text', () => {
  assert.equal(canFlushQueuedInputTarget({ tab: {}, text: '   ' }), false)
  assert.equal(canFlushQueuedInputTarget(null), false)
})

test('canFlushQueuedInputTarget ignores active composer attachments and only validates queued text', () => {
  const target = {
    tab: { id: 'chat-1', sessionId: 'sess-1' },
    text: 'queued prompt',
    ownerProject: { id: 'proj-1' },
  }

  assert.equal(canFlushQueuedInputTarget(target), true)
})
