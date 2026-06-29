'use strict';

/**
 * Unit tests for codex/contextWindow.js — pure helpers.
 */

const assert = require('assert')
const {
  getCodexContextWindowForModel,
  toPositiveNumber,
  pickCodexContextUsage,
  pickCodexContextWindow,
  estimateCodexCostUsd,
} = require('../packages/agent/electron/codex/contextWindow.js')

// ---- getCodexContextWindowForModel ----

function runModelWindowTests() {
  assert.equal(getCodexContextWindowForModel(''), 258400)
  assert.equal(getCodexContextWindowForModel(null), 258400)
  assert.equal(getCodexContextWindowForModel(undefined), 258400)
  assert.equal(getCodexContextWindowForModel('gpt-5'), 258400)
  assert.equal(getCodexContextWindowForModel('gpt-5-turbo'), 258400)
  assert.equal(getCodexContextWindowForModel('gpt-4'), 128000)
  assert.equal(getCodexContextWindowForModel('gpt-4-turbo'), 128000)
  // NOTE: 'gpt-4' check precedes 'gpt-4o', so gpt-4o* gets 128K (existing behaviour)
  assert.equal(getCodexContextWindowForModel('gpt-4o'), 128000)
  assert.equal(getCodexContextWindowForModel('gpt-4o-mini'), 128000)
  assert.equal(getCodexContextWindowForModel('o1'), 200000)
  assert.equal(getCodexContextWindowForModel('o3-mini'), 200000)
  assert.equal(getCodexContextWindowForModel('claude-3.5-sonnet'), 200000)
  assert.equal(getCodexContextWindowForModel('unknown-model'), 258400)
}

// ---- toPositiveNumber ----

function runToPositiveNumberTests() {
  assert.equal(toPositiveNumber(), 0)
  assert.equal(toPositiveNumber(0), 0)
  assert.equal(toPositiveNumber(-1), 0)
  assert.equal(toPositiveNumber(NaN), 0)
  assert.equal(toPositiveNumber(Infinity), 0)
  assert.equal(toPositiveNumber(42), 42)
  assert.equal(toPositiveNumber(0, 0, 5), 5)
  assert.equal(toPositiveNumber(null, undefined, 3.14), 3.14)
  assert.equal(toPositiveNumber('10'), 10)
  assert.equal(toPositiveNumber('0'), 0)
}

// ---- pickCodexContextUsage ----

function runContextUsageTests() {
  assert.equal(pickCodexContextUsage(), 0)
  assert.equal(pickCodexContextUsage({}), 0)
  assert.equal(pickCodexContextUsage({ context_usage: 50000 }), 50000)
  assert.equal(pickCodexContextUsage({ context_token_usage: 60000 }), 60000)
  assert.equal(pickCodexContextUsage({}, { context_tokens: 70000 }), 70000)
  // Fallback to last_token_usage.total_tokens
  assert.equal(pickCodexContextUsage({ last_token_usage: { total_tokens: 80000 } }), 80000)
  // Explicit wins over fallback
  assert.equal(pickCodexContextUsage(
    { context_usage: 50000, last_token_usage: { total_tokens: 80000 } }
  ), 50000)
}

// ---- pickCodexContextWindow ----

function runContextWindowTests() {
  assert.equal(pickCodexContextWindow(), 0)
  assert.equal(pickCodexContextWindow({}, {}, 1000), 1000)
  assert.equal(pickCodexContextWindow({ model_context_window: 200000 }), 200000)
  assert.equal(pickCodexContextWindow({ context_window: 128000 }), 128000)
  assert.equal(pickCodexContextWindow({}, { context_window_size: 100000 }), 100000)
}

// ---- estimateCodexCostUsd ----

function runCostEstimateTests() {
  assert.equal(estimateCodexCostUsd(0, 0, 0), 0)
  assert.equal(estimateCodexCostUsd(1000000, 0, 0), 1.25)
  assert.equal(estimateCodexCostUsd(0, 1000000, 0), 10.0)
  assert.equal(estimateCodexCostUsd(0, 0, 1000000), 0.125)
  // Typical call: 100K input, 5K output, 20K cache read
  const cost = estimateCodexCostUsd(100000, 5000, 20000)
  assert.ok(cost > 0.175 && cost < 0.18, `expected ~0.1775, got ${cost}`)
}

// ---- runner ----

function run() {
  runModelWindowTests()
  runToPositiveNumberTests()
  runContextUsageTests()
  runContextWindowTests()
  runCostEstimateTests()
  console.log('codex context window tests passed')
}

run()
