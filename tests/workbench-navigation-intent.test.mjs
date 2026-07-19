import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createIntentQueue,
  createLegacyNavigationAdapter,
  documentPayloadToIntent,
  normalizeWorkbenchIntent,
} from '../src/workbench/navigationIntent.mjs'

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

test('document payload becomes a bounded open-document intent', () => {
  assert.deepEqual(documentPayloadToIntent({
    __mdRequestId: 'md-1',
    filePath: 'D:/repo/README.md',
    source: 'file-association',
  }), {
    requestId: 'md-1',
    type: 'open-document',
    target: 'active',
    source: 'file-association',
    resourceId: 'D:/repo/README.md',
  })
  assert.equal(documentPayloadToIntent({ filePath: 'D:/repo/README.md' }), null)
})

test('legacy navigation adapter maps typed intents without exposing domain state', async () => {
  const routes = []
  const adapter = createLegacyNavigationAdapter({ router: { push: route => { routes.push(route) } } })

  const agentResult = await adapter.dispatch({
    requestId: 'agent-1', type: 'focus-agent', agentTarget: { agent: 'codex', projectId: 'project-1' },
  })
  const chatResult = await adapter.dispatch({
    requestId: 'chat-1', type: 'focus-chat', chatTarget: { sessionId: 'session-1' },
  })
  const documentResult = await adapter.dispatch({
    requestId: 'doc-1', type: 'open-document', resourceId: 'D:/repo/a.md', target: 'beside',
  })

  assert.equal(agentResult.accepted, true)
  assert.equal(chatResult.accepted, true)
  assert.equal(documentResult.accepted, true)
  // query keys mirror what CodeHub consumes: agent / projectId / chatId / sessionId
  assert.deepEqual(routes, [
    { path: '/main/codeHub', query: { agent: 'codex', projectId: 'project-1' } },
    { path: '/main/chat', query: { sessionId: 'session-1' } },
    { path: '/main/mdViewer' },
  ])
})

test('focus-agent carries chatId/sessionId through to the CodeHub query', async () => {
  const routes = []
  const adapter = createLegacyNavigationAdapter({ router: { push: route => { routes.push(route) } } })

  await adapter.dispatch({
    requestId: 'agent-2',
    type: 'focus-agent',
    agentTarget: { agent: 'claude', projectId: 'p1', chatId: 'c1', sessionId: 's1' },
  })
  await adapter.dispatch({ requestId: 'agent-3', type: 'focus-agent' })

  assert.deepEqual(routes, [
    { path: '/main/codeHub', query: { agent: 'claude', projectId: 'p1', chatId: 'c1', sessionId: 's1' } },
    { path: '/main/codeHub' },
  ])
})

test('focus-chat without a session target routes to the plain chat surface', async () => {
  const routes = []
  const adapter = createLegacyNavigationAdapter({ router: { push: route => { routes.push(route) } } })
  const result = await adapter.dispatch({ requestId: 'chat-2', type: 'focus-chat' })
  assert.equal(result.accepted, true)
  assert.deepEqual(routes, [{ path: '/main/chat' }])
})

test('legacy navigation adapter reports router failures instead of throwing', async () => {
  const result = await createLegacyNavigationAdapter({
    router: { push: () => Promise.reject(new Error('route failed')) },
  }).dispatch({ requestId: 'fail-1', type: 'focus-chat' })
  assert.deepEqual(result, { accepted: false, requestId: 'fail-1', reason: 'route failed' })
})
