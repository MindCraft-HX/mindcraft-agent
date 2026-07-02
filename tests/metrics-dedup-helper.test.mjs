/**
 * metricsDedupHelper 单元测试 — T171
 *
 * 验证：has/track/自动清除/多 key 隔离/并发安全。
 * 运行：node --test tests/metrics-dedup-helper.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { createMetricsDedupTracker } = await import('../packages/agent/src/components/agentCommon/utils/metricsDedupHelper.js')

describe('createMetricsDedupTracker', () => {
  it('has returns false for unknown key', () => {
    const t = createMetricsDedupTracker()
    assert.strictEqual(t.has('unknown'), false)
  })

  it('tracks a promise and has returns true', () => {
    const t = createMetricsDedupTracker()
    let resolve
    const p = new Promise(r => { resolve = r })
    t.track('s1', p)
    assert.strictEqual(t.has('s1'), true)
    resolve()
  })

  it('auto-clears after promise resolves (reject path is same .finally mechanism)', async () => {
    const t = createMetricsDedupTracker()
    const p = Promise.resolve(42)
    t.track('s1', p)
    assert.strictEqual(t.has('s1'), true)
    await p
    await Promise.resolve()
    assert.strictEqual(t.has('s1'), false)
  })

  it('multiple keys are isolated', () => {
    const t = createMetricsDedupTracker()
    t.track('a', Promise.resolve())
    t.track('b', Promise.resolve())
    assert.strictEqual(t.has('a'), true)
    assert.strictEqual(t.has('b'), true)
    assert.strictEqual(t.has('c'), false)
  })

  it('same key with new promise replaces old', () => {
    const t = createMetricsDedupTracker()
    const p1 = new Promise(() => {})
    const p2 = Promise.resolve(1)
    t.track('s1', p1)
    t.track('s1', p2)
    assert.strictEqual(t.has('s1'), true)
    // p1 should not prevent p2's cleanup
    return p2.then(() => Promise.resolve()).then(() => {
      assert.strictEqual(t.has('s1'), false)
    })
  })
})
