import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeNextActiveTab, sanitizeTabName } from '../packages/agent/src/components/agentCommon/utils/tabHelpers.mjs'

describe('computeNextActiveTab', () => {
  it('returns null activeId and no-create when deleted was not active', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = computeNextActiveTab(tabs, 1, false)
    assert.equal(result.activeId, null)
    assert.equal(result.shouldCreateNew, false)
  })

  it('selects previous tab when active tab is deleted', () => {
    // tabs after splice: ['a', 'c'] (b was at index 1, deleted)
    const tabs = [{ id: 'a' }, { id: 'c' }]
    const result = computeNextActiveTab(tabs, 1, true)
    assert.equal(result.activeId, 'a')
    assert.equal(result.shouldCreateNew, false)
  })

  it('selects next (new index 0) when first tab is deleted', () => {
    // tabs after splice: ['b', 'c'] (a was at index 0, deleted)
    const tabs = [{ id: 'b' }, { id: 'c' }]
    const result = computeNextActiveTab(tabs, 0, true)
    assert.equal(result.activeId, 'b')
    assert.equal(result.shouldCreateNew, false)
  })

  it('signals shouldCreateNew when all tabs deleted', () => {
    const result = computeNextActiveTab([], 0, true)
    assert.equal(result.activeId, null)
    assert.equal(result.shouldCreateNew, true)
  })

  it('no-op when empty tabs and not active', () => {
    const result = computeNextActiveTab([], 0, false)
    assert.equal(result.activeId, null)
    assert.equal(result.shouldCreateNew, false)
  })
})

describe('sanitizeTabName', () => {
  it('trims whitespace and reports valid', () => {
    const result = sanitizeTabName('  代码评审  ')
    assert.equal(result.value, '代码评审')
    assert.equal(result.isValid, true)
  })

  it('rejects empty string', () => {
    const result = sanitizeTabName('')
    assert.equal(result.value, '')
    assert.equal(result.isValid, false)
  })

  it('rejects whitespace-only', () => {
    const result = sanitizeTabName('   ')
    assert.equal(result.value, '')
    assert.equal(result.isValid, false)
  })

  it('handles null/undefined', () => {
    assert.equal(sanitizeTabName(null).isValid, false)
    assert.equal(sanitizeTabName(undefined).isValid, false)
  })

  it('accepts single character', () => {
    const result = sanitizeTabName('X')
    assert.equal(result.value, 'X')
    assert.equal(result.isValid, true)
  })
})

console.log('tabHelpers characterization test passed')
