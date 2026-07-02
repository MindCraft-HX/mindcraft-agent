/**
 * Token Turn Store 测试 (Phase 2)
 *
 * 覆盖：live → final / final 后 poll 不覆盖 / turnId 不匹配拒绝 / context-only poll
 *
 * 用法：node packages/agent/electron/tokenMetrics/turnStore.test.cjs
 */

const assert = require('assert')
const {
  beginTurn,
  applySample,
  getCurrentSnapshot,
  getFinalSnapshot,
  clearCurrentTurn,
  isTurnFinalized,
  removeStore,
  clearAllStores,
  getTurnCount,
} = require('./turnStore')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

function reset() {
  removeStore('test-chat')
}

// ==================== beginTurn ====================

test('beginTurn creates a new turn', () => {
  reset()
  const turnId = beginTurn({
    provider: 'claude',
    chatKey: 'test-chat',
    providerSessionId: 'cli-1',
  })
  assert.ok(turnId)
  assert.ok(turnId.startsWith('turn_'))
  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap, null) // no live data yet
})

// ==================== live → final flow ====================

test('sdk-live updates live snapshot', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({
    provider: 'claude', source: 'sdk-live', chatKey: 'test-chat',
    inputTokens: 100, outputTokens: 50, cacheReadTokens: 20,
  })
  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.phase, 'live')
  assert.strictEqual(snap.inputTokens, 100)
  assert.strictEqual(snap.outputTokens, 50)
  assert.strictEqual(snap.cacheReadTokens, 20)
})

test('sdk-live merges with max values', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 100 })
  applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 50 })
  applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 200 })
  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.inputTokens, 200) // max
})

test('sdk-result finalizes turn', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 100 })
  applySample({
    provider: 'claude', source: 'sdk-result', chatKey: 'test-chat',
    inputTokens: 500, outputTokens: 300, cacheReadTokens: 50,
  })
  assert.strictEqual(isTurnFinalized('test-chat'), true)
  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.phase, 'final')
  assert.strictEqual(snap.inputTokens, 500)
  assert.strictEqual(snap.cacheReadTokens, 50)
})

test('final snapshot stored in turns map', () => {
  reset()
  beginTurn({ provider: 'codex', chatKey: 'test-chat' })
  applySample({
    provider: 'codex', source: 'sdk-result', chatKey: 'test-chat',
    inputTokens: 500, outputTokens: 300,
  })
  assert.strictEqual(getTurnCount('test-chat'), 1)
})

// ==================== final 后拒绝覆盖 ====================

test('sdk-live rejected after final', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-result', chatKey: 'test-chat', inputTokens: 500 })
  const result = applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 999 })
  assert.strictEqual(result.accepted, false)
  assert.ok(result.reason.includes('finalized'))
  // snapshot unchanged
  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.inputTokens, 500)
})

test('jsonl-poll rejected after final', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-result', chatKey: 'test-chat', inputTokens: 500 })
  const result = applySample({ provider: 'claude', source: 'jsonl-poll', chatKey: 'test-chat', contextUsage: 9999 })
  assert.strictEqual(result.accepted, false)
})

test('sdk-result rejected after final (double finalize)', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-result', chatKey: 'test-chat', inputTokens: 500 })
  const result = applySample({ provider: 'claude', source: 'sdk-result', chatKey: 'test-chat', inputTokens: 999 })
  assert.strictEqual(result.accepted, false)
})

// ==================== jsonl-poll 只更新 context/duration ====================

test('jsonl-poll only updates context/duration, not in/out/cache', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 100, outputTokens: 50 })

  // jsonl-poll with huge cache — should NOT overwrite
  applySample({
    provider: 'claude', source: 'jsonl-poll', chatKey: 'test-chat',
    inputTokens: 99999, outputTokens: 99999, cacheReadTokens: 50000,
    contextUsage: 10000, durationMs: 5000,
  })

  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.inputTokens, 100)    // unchanged
  assert.strictEqual(snap.outputTokens, 50)    // unchanged
  assert.strictEqual(snap.cacheReadTokens, 0)  // unchanged (live didn't set it)
  assert.strictEqual(snap.contextUsage, 10000) // updated
  assert.strictEqual(snap.durationMs, 5000)    // updated
})

test('session-total scope never updates current-turn token fields', () => {
  reset()
  beginTurn({ provider: 'codex', chatKey: 'test-chat' })
  applySample({ provider: 'codex', source: 'token-count', scope: 'turn-live', chatKey: 'test-chat', inputTokens: 100, outputTokens: 20 })
  applySample({
    provider: 'codex',
    source: 'jsonl-poll',
    scope: 'session-total',
    chatKey: 'test-chat',
    inputTokens: 99999999,
    outputTokens: 99999999,
    cacheReadTokens: 88888888,
    contextUsage: 12345,
    contextWindow: 258400,
  })

  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.inputTokens, 100)
  assert.strictEqual(snap.outputTokens, 20)
  assert.strictEqual(snap.cacheReadTokens, 0)
  assert.strictEqual(snap.contextUsage, 12345)
  assert.strictEqual(snap.contextWindow, 258400)
})

test('jsonl-poll can update current-turn tokens when explicitly scoped to this turn', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({
    provider: 'claude',
    source: 'jsonl-poll',
    chatKey: 'test-chat',
    inputTokens: 120,
    outputTokens: 40,
    cacheReadTokens: 30,
    contextUsage: 9000,
    durationMs: 3000,
    allowTurnTokens: true,
  })

  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.phase, 'live')
  assert.strictEqual(snap.inputTokens, 120)
  assert.strictEqual(snap.outputTokens, 40)
  assert.strictEqual(snap.cacheReadTokens, 30)
  assert.strictEqual(snap.contextUsage, 9000)
  assert.strictEqual(snap.durationMs, 3000)
})

test('sdk-result with empty context preserves live context', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({
    provider: 'claude',
    source: 'jsonl-poll',
    chatKey: 'test-chat',
    contextUsage: 12000,
    contextWindow: 200000,
  })
  applySample({
    provider: 'claude',
    source: 'sdk-result',
    chatKey: 'test-chat',
    inputTokens: 500,
    outputTokens: 20,
    contextUsage: 0,
    contextWindow: 0,
  })

  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.inputTokens, 500)
  assert.strictEqual(snap.outputTokens, 20)
  assert.strictEqual(snap.contextUsage, 12000)
  assert.strictEqual(snap.contextWindow, 200000)
})

test('session-context updates context only and never changes turn tokens', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({
    provider: 'claude',
    source: 'sdk-live',
    scope: 'turn-live',
    chatKey: 'test-chat',
    inputTokens: 300,
    outputTokens: 40,
    cacheReadTokens: 20,
  })
  applySample({
    provider: 'claude',
    source: 'context-snapshot',
    scope: 'session-context',
    chatKey: 'test-chat',
    inputTokens: 999999,
    outputTokens: 999999,
    cacheReadTokens: 999999,
    contextUsage: 45000,
    contextWindow: 200000,
  })

  const snap = getCurrentSnapshot('test-chat')
  assert.strictEqual(snap.inputTokens, 300)
  assert.strictEqual(snap.outputTokens, 40)
  assert.strictEqual(snap.cacheReadTokens, 20)
  assert.strictEqual(snap.contextUsage, 45000)
  assert.strictEqual(snap.contextWindow, 200000)
})

// ==================== clearCurrentTurn ====================

test('clearCurrentTurn removes unfinalized turn', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-live', chatKey: 'test-chat', inputTokens: 100 })
  clearCurrentTurn('test-chat')
  assert.strictEqual(getCurrentSnapshot('test-chat'), null)
})

test('clearCurrentTurn preserves finalized turns in history', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-result', chatKey: 'test-chat', inputTokens: 500 })
  clearCurrentTurn('test-chat')
  // finalized turn still in history
  assert.strictEqual(getTurnCount('test-chat'), 1)
})

test('clearAllStores removes all finalized turn history', () => {
  reset()
  beginTurn({ provider: 'claude', chatKey: 'test-chat' })
  applySample({ provider: 'claude', source: 'sdk-result', chatKey: 'test-chat', inputTokens: 500 })
  assert.strictEqual(getTurnCount('test-chat'), 1)
  clearAllStores()
  assert.strictEqual(getCurrentSnapshot('test-chat'), null)
  assert.strictEqual(getFinalSnapshot('test-chat'), null)
  assert.strictEqual(getTurnCount('test-chat'), 0)
})

// ==================== no active turn ====================

test('applySample auto-begins for sdk-live without active turn', () => {
  reset()
  applySample({ provider: 'codex', source: 'token-count', chatKey: 'test-chat', inputTokens: 100 })
  const snap = getCurrentSnapshot('test-chat')
  assert.ok(snap)
  assert.strictEqual(snap.inputTokens, 100)
})

test('applySample rejects jsonl-poll without active turn', () => {
  reset()
  const result = applySample({ provider: 'claude', source: 'jsonl-poll', chatKey: 'test-chat', inputTokens: 100 })
  assert.strictEqual(result.accepted, false)
})

// ==================== Summary ====================

console.log(`\n${'='.repeat(50)}`)
if (failed === 0) {
  console.log(`全部通过: ${passed} tests`)
} else {
  console.log(`${passed} passed, ${failed} FAILED`)
}
process.exit(failed > 0 ? 1 : 0)
