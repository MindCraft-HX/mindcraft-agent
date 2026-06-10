import assert from 'node:assert/strict'
import {
  buildHistoryLoadGuard,
  shouldPersistInlineMessages,
  shouldRestoreInlineMessages,
} from '../packages/agent/src/components/codeX/utils/historyLoadSafety.mjs'

const riskyGuard = buildHistoryLoadGuard({
  fileSize: 987131,
  tailLargeOutputCount: 1,
  tailMaxOutputChars: 28277,
})

assert.equal(riskyGuard.shouldDefer, true)
assert.equal(riskyGuard.reason, 'heavy-tail-output')

const safeGuard = buildHistoryLoadGuard({
  fileSize: 120000,
  tailLargeOutputCount: 0,
  tailMaxOutputChars: 2048,
})

assert.equal(safeGuard.shouldDefer, false)
assert.equal(safeGuard.reason, 'normal')

assert.equal(shouldPersistInlineMessages({ filePath: 'C:/tmp/session.jsonl' }), false)
assert.equal(shouldPersistInlineMessages({ filePath: '' }), true)

assert.equal(shouldRestoreInlineMessages({ filePath: 'C:/tmp/session.jsonl' }), false)
assert.equal(shouldRestoreInlineMessages({ filePath: '' }), true)

console.log('history-load safety test passed')
