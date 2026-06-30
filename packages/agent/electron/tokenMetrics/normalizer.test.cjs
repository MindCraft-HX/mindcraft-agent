'use strict'

const assert = require('assert')
const {
  normalizeClaudeUsage,
  normalizeCodexUsage,
  normalizeUsage,
  isNativeClaudeModel,
} = require('./normalizer')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
  } catch (err) {
    failed += 1
    console.error(`FAILED: ${name}`)
    console.error(`  ${err.message}`)
  }
}

test('isNativeClaudeModel: empty model returns false', () => {
  assert.strictEqual(isNativeClaudeModel(''), false)
  assert.strictEqual(isNativeClaudeModel(null), false)
  assert.strictEqual(isNativeClaudeModel(undefined), false)
})

test('isNativeClaudeModel: Claude model names return true', () => {
  assert.strictEqual(isNativeClaudeModel('claude-sonnet-4-20250514'), true)
  assert.strictEqual(isNativeClaudeModel('claude-3.5-sonnet'), true)
  assert.strictEqual(isNativeClaudeModel('sonnet'), true)
  assert.strictEqual(isNativeClaudeModel('claude-opus-4'), true)
  assert.strictEqual(isNativeClaudeModel('haiku'), true)
  assert.strictEqual(isNativeClaudeModel('us.anthropic.claude-sonnet-4-20250514'), true)
})

test('normalizeClaudeUsage: empty usage returns zeros', () => {
  const r = normalizeClaudeUsage(null)
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.outputTokens, 0)
  assert.strictEqual(r.cacheReadTokens, 0)
  assert.strictEqual(r.cacheCreationTokens, 0)
})

test('normalizeClaudeUsage: input is raw input plus cache creation', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 1000,
    output_tokens: 300,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
  }, 'claude-sonnet-4-20250514')
  assert.strictEqual(r.inputTokens, 1050)
  assert.strictEqual(r.outputTokens, 300)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.cacheCreationTokens, 50)
})

test('normalizeClaudeUsage: cache read does not reduce input', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 300,
    cache_creation_input_tokens: 25,
  }, 'claude-3.5-sonnet')
  assert.strictEqual(r.inputTokens, 125)
  assert.strictEqual(r.cacheReadTokens, 300)
})

test('normalizeClaudeUsage: third-party Claude-compatible fields use same formula', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 800,
    output_tokens: 400,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
  }, 'gpt-4o')
  assert.strictEqual(r.inputTokens, 850)
  assert.strictEqual(r.outputTokens, 400)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.cacheCreationTokens, 50)
})

test('normalizeClaudeUsage: Sonnet cache write counts as input', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 3,
    output_tokens: 31,
    cache_read_input_tokens: 36152,
    cache_creation_input_tokens: 2479,
  }, 'claude-sonnet-4-6')
  assert.strictEqual(r.inputTokens, 2482)
  assert.strictEqual(r.cacheReadTokens, 36152)
  assert.strictEqual(r.outputTokens, 31)
})

test('normalizeClaudeUsage: zero cache keeps input unchanged', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 500,
    output_tokens: 100,
  }, 'claude-sonnet')
  assert.strictEqual(r.inputTokens, 500)
  assert.strictEqual(r.cacheReadTokens, 0)
  assert.strictEqual(r.cacheCreationTokens, 0)
})

test('normalizeCodexUsage: empty usage returns zeros', () => {
  const r = normalizeCodexUsage(null)
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.outputTokens, 0)
  assert.strictEqual(r.cacheReadTokens, 0)
  assert.strictEqual(r.cacheCreationTokens, 0)
})

test('normalizeCodexUsage: cached input is a subset of input', () => {
  const r = normalizeCodexUsage({
    input_tokens: 1000,
    output_tokens: 300,
    cached_input_tokens: 200,
    cache_creation_input_tokens: 50,
  })
  assert.strictEqual(r.inputTokens, 850)
  assert.strictEqual(r.outputTokens, 300)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.cacheCreationTokens, 50)
})

test('normalizeCodexUsage: cache_read_input_tokens takes precedence', () => {
  const r = normalizeCodexUsage({
    input_tokens: 1000,
    output_tokens: 300,
    cache_read_input_tokens: 150,
    cached_input_tokens: 200,
  })
  assert.strictEqual(r.cacheReadTokens, 150)
})

test('normalizeCodexUsage: input_tokens_details.cached_tokens fallback', () => {
  const r = normalizeCodexUsage({
    input_tokens: 1000,
    output_tokens: 300,
    input_tokens_details: { cached_tokens: 100 },
  })
  assert.strictEqual(r.cacheReadTokens, 100)
})

test('normalizeCodexUsage: input cannot go negative', () => {
  const r = normalizeCodexUsage({
    input_tokens: 100,
    output_tokens: 50,
    cached_input_tokens: 500,
  })
  assert.strictEqual(r.inputTokens, 0)
})

test('normalizeUsage: delegates to Claude normalizer', () => {
  const r = normalizeUsage({
    provider: 'claude',
    usage: { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 200 },
    model: 'claude-sonnet',
  })
  assert.strictEqual(r.inputTokens, 1000)
  assert.strictEqual(r.cacheReadTokens, 200)
})

test('normalizeUsage: delegates to CodeX normalizer', () => {
  const r = normalizeUsage({
    provider: 'codex',
    usage: { input_tokens: 1000, output_tokens: 300, cached_input_tokens: 200 },
  })
  assert.strictEqual(r.inputTokens, 800)
  assert.strictEqual(r.cacheReadTokens, 200)
})

test('normalizeUsage: unknown provider falls back to passthrough', () => {
  const r = normalizeUsage({
    provider: 'unknown',
    usage: { input_tokens: 500, output_tokens: 100 },
  })
  assert.strictEqual(r.inputTokens, 500)
  assert.strictEqual(r.outputTokens, 100)
})

test('normalizeUsage: missing usage returns zeros', () => {
  const r = normalizeUsage({ provider: 'claude' })
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.outputTokens, 0)
})

console.log(`\n${'='.repeat(50)}`)
if (failed === 0) {
  console.log(`All passed: ${passed} tests`)
} else {
  console.log(`${passed} passed, ${failed} FAILED`)
}
process.exit(failed > 0 ? 1 : 0)
