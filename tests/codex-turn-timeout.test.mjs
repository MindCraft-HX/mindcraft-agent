import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldStopTurnTimeoutOnEvent } = require('../packages/agent/electron/codexTurnState.js')

test('terminal Codex events stop turn timeout immediately', () => {
  assert.equal(shouldStopTurnTimeoutOnEvent('turn.completed'), true)
  assert.equal(shouldStopTurnTimeoutOnEvent('turn.failed'), true)
  assert.equal(shouldStopTurnTimeoutOnEvent('task_complete'), true)
})

test('non-terminal Codex events do not stop turn timeout', () => {
  assert.equal(shouldStopTurnTimeoutOnEvent('thread.started'), false)
  assert.equal(shouldStopTurnTimeoutOnEvent('item.updated'), false)
  assert.equal(shouldStopTurnTimeoutOnEvent('compaction'), false)
})

