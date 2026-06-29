import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSaveCooldownGuard, filterSubagentChats } from '../packages/agent/src/components/agentCommon/utils/historyHelpers.mjs'

describe('createSaveCooldownGuard', () => {
  it('allows first call (not in cooldown)', () => {
    const guard = createSaveCooldownGuard(500)
    assert.equal(guard(), false)
  })

  it('blocks second call within cooldown', () => {
    const guard = createSaveCooldownGuard(500)
    guard() // first call — sets timestamp
    assert.equal(guard(), true) // second call — in cooldown
  })

  it('default cooldown is 500ms', () => {
    const guard = createSaveCooldownGuard()
    guard()
    assert.equal(guard(), true)
  })

  it('custom cooldown is respected', () => {
    const guard = createSaveCooldownGuard(1)
    guard()
    // 1ms cooldown — still blocks same-tick calls
    assert.equal(guard(), true)
  })

  it('each guard instance is independent', () => {
    const a = createSaveCooldownGuard(500)
    const b = createSaveCooldownGuard(500)
    a()
    assert.equal(a(), true)
    assert.equal(b(), false) // b not called yet
  })
})

describe('filterSubagentChats', () => {
  it('filters chats with filePath containing subagents', () => {
    const chats = [
      { id: 'a', filePath: '/sessions/normal.jsonl' },
      { id: 'b', filePath: '/subagents/task.jsonl' },
      { id: 'c', filePath: null },
      { id: 'd' },
    ]
    const result = filterSubagentChats(chats)
    assert.equal(result.length, 3)
    assert.deepEqual(result.map(c => c.id), ['a', 'c', 'd'])
  })

  it('returns empty for non-array input', () => {
    assert.deepEqual(filterSubagentChats(null), [])
    assert.deepEqual(filterSubagentChats(undefined), [])
    assert.deepEqual(filterSubagentChats('not-array'), [])
  })

  it('preserves order', () => {
    const chats = [
      { id: 'first' },
      { id: 'sub', filePath: '/subagents/x.jsonl' },
      { id: 'last' },
    ]
    const result = filterSubagentChats(chats)
    assert.deepEqual(result.map(c => c.id), ['first', 'last'])
  })

  it('handles empty array', () => {
    assert.deepEqual(filterSubagentChats([]), [])
  })
})

console.log('historyHelpers characterization test passed')
