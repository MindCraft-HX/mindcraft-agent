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

function run() {
  runNativeClaudeModelTest()
  runThirdPartyClaudeSdkModelTest()
  runUnknownModelFallsBackToConservativeSumTest()
  runNativeClaudeUiNormalizationTest()
  runThirdPartyClaudeUiNormalizationTest()
  console.log('claude context usage tests passed')
}

run()
