import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldStopTurnTimeoutOnEvent } = require('../packages/agent/electron/codexTurnState.js')

test('logical terminal Codex events keep the watchdog until transport closes', () => {
  assert.equal(shouldStopTurnTimeoutOnEvent('turn.completed'), false)
  assert.equal(shouldStopTurnTimeoutOnEvent('turn.failed'), false)
  assert.equal(shouldStopTurnTimeoutOnEvent('task_complete'), false)
})

test('non-terminal Codex events do not stop turn timeout', () => {
  assert.equal(shouldStopTurnTimeoutOnEvent('thread.started'), false)
  assert.equal(shouldStopTurnTimeoutOnEvent('item.updated'), false)
  assert.equal(shouldStopTurnTimeoutOnEvent('compaction'), false)
})

