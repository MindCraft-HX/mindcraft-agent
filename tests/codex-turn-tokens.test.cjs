const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')

function runNormalizeCodexUsageTest() {
  const usage = __test__.normalizeCodexUsage({
    input_tokens: 12,
    output_tokens: 5,
    total_tokens: 17,
    input_tokens_details: {
      cached_tokens: 3,
    },
  })

  assert.deepEqual(usage, {
    input_tokens: 9,
    output_tokens: 5,
    total_tokens: 17,
    cache_read_input_tokens: 3,
    cache_creation_input_tokens: 0,
    raw_input_tokens: 12,
  })
}

function runBuildPerTurnTokensPrefersParsedMetricsTest() {
  const perTurn = __test__.buildCodexPerTurnTokens(
    {
      inputTokens: 600,
      outputTokens: 80,
      cacheReadTokens: 300,
      cacheCreationTokens: 0,
      durationMs: 7000,
    },
    {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 1,
    }
  )

  assert.deepEqual(perTurn, {
    inputTokens: 600,
    outputTokens: 80,
    cacheReadTokens: 300,
    cacheCreationTokens: 0,
    durationMs: 7000,
  })
}

function runBuildPerTurnTokensFallsBackToUsageTest() {
  const perTurn = __test__.buildCodexPerTurnTokens(
    null,
    {
      input_tokens: 42,
      output_tokens: 9,
      cache_read_input_tokens: 7,
      cache_creation_input_tokens: 2,
    }
  )

  assert.deepEqual(perTurn, {
    inputTokens: 33,
    outputTokens: 9,
    cacheReadTokens: 7,
    cacheCreationTokens: 2,
    durationMs: 0,
  })
}

function runBuildLiveMetricsFromTokenCountPayloadTest() {
  const metrics = __test__.buildCodexMetricsFromTokenCountPayload({
    info: {
      last_token_usage: {
        input_tokens: 12091,
        cached_input_tokens: 7552,
        output_tokens: 401,
        total_tokens: 12492,
      },
      model_context_window: 258400,
    },
  }, { model: 'gpt-5', durationMs: 2000 })

  assert.equal(metrics.inputTokens, 4539)
  assert.equal(metrics.outputTokens, 401)
  assert.equal(metrics.cacheReadTokens, 7552)
  assert.equal(metrics.cacheCreationTokens, 0)
  assert.equal(metrics.contextUsage, 12492)
  assert.equal(metrics.contextWindow, 258400)
  assert.equal(metrics.durationMs, 2000)
}

function runBuildPerTurnTokensReturnsNullForEmptyTest() {
  const perTurn = __test__.buildCodexPerTurnTokens(null, null)
  assert.equal(perTurn, null)
}

function run() {
  runNormalizeCodexUsageTest()
  runBuildPerTurnTokensPrefersParsedMetricsTest()
  runBuildPerTurnTokensFallsBackToUsageTest()
  runBuildLiveMetricsFromTokenCountPayloadTest()
  runBuildPerTurnTokensReturnsNullForEmptyTest()
  console.log('codex turn tokens tests passed')
}

run()
