/**
 * Token Metrics Normalizer 测试 (Phase 1)
 *
 * 覆盖：Claude 原生 / Claude 第三方 / CodeX / cache-only / 缺字段
 *
 * 用法：node packages/agent/electron/tokenMetrics/normalizer.test.cjs
 */

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
    passed++
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
  }
}

// ==================== isNativeClaudeModel ====================

test('isNativeClaudeModel: empty model → false', () => {
  assert.strictEqual(isNativeClaudeModel(''), false)
  assert.strictEqual(isNativeClaudeModel(null), false)
  assert.strictEqual(isNativeClaudeModel(undefined), false)
})

test('isNativeClaudeModel: claude-* → true', () => {
  assert.strictEqual(isNativeClaudeModel('claude-sonnet-4-20250514'), true)
  assert.strictEqual(isNativeClaudeModel('claude-3.5-sonnet'), true)
})

test('isNativeClaudeModel: sonnet/opus/haiku → true', () => {
  assert.strictEqual(isNativeClaudeModel('sonnet'), true)
  assert.strictEqual(isNativeClaudeModel('claude-opus-4'), true)
  assert.strictEqual(isNativeClaudeModel('haiku'), true)
})

test('isNativeClaudeModel: us.anthropic.* → true (contains claude pattern)', () => {
  // us.anthropic.claude-sonnet-4-20250514 → contains 'claude' → true
  assert.strictEqual(isNativeClaudeModel('us.anthropic.claude-sonnet-4-20250514'), true)
})

// ==================== normalizeClaudeUsage ====================

test('normalizeClaudeUsage: empty/null returns zeros', () => {
  const r = normalizeClaudeUsage(null)
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.outputTokens, 0)
  assert.strictEqual(r.cacheReadTokens, 0)
  assert.strictEqual(r.cacheCreationTokens, 0)
})

test('normalizeClaudeUsage: native Claude — input excludes cache read', () => {
  // input_tokens=1000 (包含 cache read), cache_read=200, cache_creation=50
  const r = normalizeClaudeUsage({
    input_tokens: 1000,
    output_tokens: 300,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
  }, 'claude-sonnet-4-20250514')
  assert.strictEqual(r.inputTokens, 800)  // 1000 - 200
  assert.strictEqual(r.outputTokens, 300)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.cacheCreationTokens, 50)
})

test('normalizeClaudeUsage: native Claude — input cannot go negative', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 300,
  }, 'claude-3.5-sonnet')
  assert.strictEqual(r.inputTokens, 0)  // max(0, 100-300)
})

test('normalizeClaudeUsage: third-party — input adds cache creation', () => {
  // 第三方 provider：input_tokens=800（常规输入）, cache_read=200, cache_creation=50
  const r = normalizeClaudeUsage({
    input_tokens: 800,
    output_tokens: 400,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
  }, 'gpt-4o')  // not claude/sonnet/opus/haiku
  assert.strictEqual(r.inputTokens, 850)  // 800 + 50
  assert.strictEqual(r.outputTokens, 400)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.cacheCreationTokens, 50)
})

test('normalizeClaudeUsage: zero cache → input unchanged for native', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 500,
    output_tokens: 100,
  }, 'claude-sonnet')
  assert.strictEqual(r.inputTokens, 500)
  assert.strictEqual(r.cacheReadTokens, 0)
  assert.strictEqual(r.cacheCreationTokens, 0)
})

// ==================== normalizeCodexUsage ====================

test('normalizeCodexUsage: empty/null returns zeros', () => {
  const r = normalizeCodexUsage(null)
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.outputTokens, 0)
  assert.strictEqual(r.cacheReadTokens, 0)
  assert.strictEqual(r.cacheCreationTokens, 0)
})

test('normalizeCodexUsage: cached_input_tokens 是 input_tokens 子集', () => {
  const r = normalizeCodexUsage({
    input_tokens: 1000,
    output_tokens: 300,
    cached_input_tokens: 200,
    cache_creation_input_tokens: 50,
  })
  assert.strictEqual(r.inputTokens, 850)  // max(0, 1000-200) + 50
  assert.strictEqual(r.outputTokens, 300)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.cacheCreationTokens, 50)
})

test('normalizeCodexUsage: cache_read_input_tokens 优先于 cached_input_tokens', () => {
  const r = normalizeCodexUsage({
    input_tokens: 1000,
    output_tokens: 300,
    cache_read_input_tokens: 150,
    cached_input_tokens: 200,  // should be ignored when cache_read_input_tokens present
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

test('normalizeCodexUsage: no negative input', () => {
  const r = normalizeCodexUsage({
    input_tokens: 100,
    output_tokens: 50,
    cached_input_tokens: 500,
  })
  assert.strictEqual(r.inputTokens, 0)  // max(0, 100-500) + 0
})

// ==================== normalizeUsage (unified entry) ====================

test('normalizeUsage: delegates to claude for provider=claude', () => {
  const r = normalizeUsage({
    provider: 'claude',
    usage: { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 200 },
    model: 'claude-sonnet',
  })
  assert.strictEqual(r.inputTokens, 800)
  assert.strictEqual(r.cacheReadTokens, 200)
})

test('normalizeUsage: delegates to codex for provider=codex', () => {
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

test('normalizeUsage: nil/missing usage returns zeros', () => {
  const r = normalizeUsage({ provider: 'claude' })
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.outputTokens, 0)
})

// ==================== cache-only samples ====================

test('cache-only: only cache read, zero regular input', () => {
  const r = normalizeClaudeUsage({
    input_tokens: 200,
    output_tokens: 0,
    cache_read_input_tokens: 200,
  }, 'claude-sonnet')
  // native: inputTokens = max(0, 200-200) = 0
  assert.strictEqual(r.inputTokens, 0)
  assert.strictEqual(r.cacheReadTokens, 200)
  assert.strictEqual(r.outputTokens, 0)
})

// ==================== Summary ====================

console.log(`\n${'='.repeat(50)}`)
if (failed === 0) {
  console.log(`全部通过: ${passed} tests`)
} else {
  console.log(`${passed} passed, ${failed} FAILED`)
}
process.exit(failed > 0 ? 1 : 0)
