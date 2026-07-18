import test from 'node:test'
import assert from 'node:assert/strict'

import { createIntentQueue, normalizeWorkbenchIntent } from '../src/workbench/navigationIntent.mjs'

test('normalizes a bounded document open intent', () => {
  const intent = normalizeWorkbenchIntent({
    requestId: 'open-1',
    type: 'open-document',
    target: 'beside',
    source: 'file-association',
    resourceId: 'D:/repo/README.md',
    workspaceKey: 'cwd:D:/repo',
  })
  assert.deepEqual(intent, {
    requestId: 'open-1',
    type: 'open-document',
    target: 'beside',
    source: 'file-association',
    resourceId: 'D:/repo/README.md',
    workspaceKey: 'cwd:D:/repo',
  })
})

test('rejects malformed intent payloads', () => {
  assert.equal(normalizeWorkbenchIntent({ requestId: 'x', type: 'open-document' }), null)
  assert.equal(normalizeWorkbenchIntent({ requestId: '', type: 'focus-agent' }), null)
  assert.equal(normalizeWorkbenchIntent({ requestId: 'x', type: 'unknown' }), null)
})

test('queue is idempotent by request id and bounded', () => {
  const queue = createIntentQueue({ limit: 2 })
  assert.equal(queue.push({ requestId: 'a', type: 'focus-agent' }), true)
  assert.equal(queue.push({ requestId: 'a', type: 'focus-agent' }), false)
  assert.equal(queue.push({ requestId: 'b', type: 'focus-chat' }), true)
  assert.equal(queue.push({ requestId: 'c', type: 'focus-agent' }), true)
  assert.deepEqual(queue.drain().map(intent => intent.requestId), ['b', 'c'])
})
