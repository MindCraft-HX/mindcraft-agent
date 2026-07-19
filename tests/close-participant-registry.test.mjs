import assert from 'node:assert/strict'
import test from 'node:test'
import { createCloseParticipantRegistry } from '../src/lifecycle/closeParticipantRegistry.mjs'

test('runs close participants in registration order and short-circuits cancellation', async () => {
  const registry = createCloseParticipantRegistry()
  const calls = []
  registry.register('document', () => { calls.push('document'); return { status: 'cancel' } })
  registry.register('agent-flush', () => { calls.push('agent-flush') })

  assert.deepEqual(await registry.beforeCloseAll({ requestId: 'close-1', reason: 'quit' }), {
    requestId: 'close-1', status: 'cancel', participantId: 'document',
  })
  assert.deepEqual(calls, ['document'])
})

test('deduplicates an in-flight request and retains its terminal aggregate', async () => {
  const registry = createCloseParticipantRegistry()
  let calls = 0
  registry.register('document', async () => {
    calls += 1
    await new Promise(resolve => setTimeout(resolve, 5))
    return { status: 'ready' }
  })

  const first = registry.beforeCloseAll({ requestId: 'close-2' })
  const second = registry.beforeCloseAll({ requestId: 'close-2' })
  assert.strictEqual(first, second)
  assert.deepEqual(await first, { requestId: 'close-2', status: 'ready' })
  assert.deepEqual(await registry.beforeCloseAll({ requestId: 'close-2' }), { requestId: 'close-2', status: 'ready' })
  assert.equal(calls, 1)
})

test('turns a participant timeout into an error aggregate', async () => {
  const registry = createCloseParticipantRegistry({ timeoutMs: 100 })
  registry.register('document', () => new Promise(() => {}))
  assert.deepEqual(await registry.beforeCloseAll({ requestId: 'close-3' }), {
    requestId: 'close-3', status: 'error', participantId: 'document', reason: 'participant-timeout',
  })
})
