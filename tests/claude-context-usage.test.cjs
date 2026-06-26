const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/claudeMetrics.js')

function runNativeClaudeModelTest() {
  const total = __test__.getClaudeContextUsageFromUsageLike({
    input_tokens: 1200,
    cache_read_input_tokens: 8000,
    cache_creation_input_tokens: 400,
  }, 'claude-sonnet-4-20250514')

  assert.equal(total, 1200)
  assert.equal(__test__.isNativeClaudeModel('claude-sonnet-4-20250514'), true)
}

function runThirdPartyClaudeSdkModelTest() {
  const total = __test__.getClaudeContextUsageFromUsageLike({
    input_tokens: 139,
    cache_read_input_tokens: 41344,
    cache_creation_input_tokens: 256,
  }, 'deepseek-v4-pro')

  assert.equal(total, 41739)
  assert.equal(__test__.isNativeClaudeModel('deepseek-v4-pro'), false)
}

function runUnknownModelFallsBackToConservativeSumTest() {
  const total = __test__.getClaudeContextUsageFromUsageLike({
    input_tokens: 500,
    cache_read_input_tokens: 2000,
    cache_creation_input_tokens: 0,
  }, '')

  assert.equal(total, 2500)
}

function runNativeClaudeUiNormalizationTest() {
  const metrics = __test__.normalizeClaudeUsageForUi({
    input_tokens: 1200,
    cache_read_input_tokens: 800,
    cache_creation_input_tokens: 100,
    output_tokens: 50,
  }, 'claude-sonnet-4-20250514')

  assert.deepEqual(metrics, {
    inputTokens: 400,
    outputTokens: 50,
    cacheReadTokens: 800,
    cacheCreationTokens: 100,
    contextUsage: 1200,
  })
}

function runThirdPartyClaudeUiNormalizationTest() {
  const metrics = __test__.normalizeClaudeUsageForUi({
    input_tokens: 139,
    cache_read_input_tokens: 41344,
    cache_creation_input_tokens: 256,
    output_tokens: 812,
  }, 'deepseek-v4-pro')

  assert.deepEqual(metrics, {
    inputTokens: 395,
    outputTokens: 812,
    cacheReadTokens: 41344,
    cacheCreationTokens: 256,
    contextUsage: 41739,
  })
}

function runClaudeTurnDurationTest() {
  assert.equal(__test__.pickClaudeTurnDurationMs(1000, 4500, null), 3500)
  assert.equal(__test__.pickClaudeTurnDurationMs(null, 4500, 2800), 2800)
  assert.equal(__test__.pickClaudeTurnDurationMs(5000, 3000, 1200), 1200)
  assert.equal(__test__.pickClaudeTurnDurationMs(null, null, null), null)
}

function runAssistantUsageDoesNotFallbackToContextTest() {
  const metrics = __test__.collectClaudeTokenMetricsFromLines([
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-26T10:00:00.000Z',
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:00:05.000Z',
      model_name: 'deepseek-v4-pro',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 7900,
          cache_read_input_tokens: 619600,
          cache_creation_input_tokens: 0,
          output_tokens: 2600,
        },
      },
    }),
  ])

  assert.equal(metrics.inputTokens, 7900)
  assert.equal(metrics.outputTokens, 2600)
  assert.equal(metrics.cacheReadTokens, 619600)
  assert.equal(metrics.contextUsage, 0)
  assert.equal(metrics.contextWindow, 0)
}

function run() {
  runNativeClaudeModelTest()
  runThirdPartyClaudeSdkModelTest()
  runUnknownModelFallsBackToConservativeSumTest()
  runNativeClaudeUiNormalizationTest()
  runThirdPartyClaudeUiNormalizationTest()
  runClaudeTurnDurationTest()
  runAssistantUsageDoesNotFallbackToContextTest()
  console.log('claude context usage tests passed')
}

run()
