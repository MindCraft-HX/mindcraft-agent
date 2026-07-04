const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/claudeMetrics.js')
const {
  __test__: claudeAgentTest,
} = require('../packages/agent/electron/claudeAgent.js')
const {
  buildClaudeHistoryTurnTokensFromEntry,
  annotateClaudeHistoryMessagesWithTurnTokens,
} = require('../packages/agent/electron/claude/historyReader.js')

function runNativeClaudeModelTest() {
  const total = __test__.getClaudeSystemContextUsageFromData({
    input_tokens: 1200,
    cache_read_input_tokens: 8000,
    cache_creation_input_tokens: 400,
  })

  assert.equal(total, 9600)
}

function runThirdPartyClaudeSdkModelTest() {
  const total = __test__.getClaudeSystemContextUsageFromData({
    input_tokens: 139,
    cache_read_input_tokens: 41344,
    cache_creation_input_tokens: 256,
  })

  assert.equal(total, 41739)
}

function runUnknownModelFallsBackToConservativeSumTest() {
  const total = __test__.getClaudeSystemContextUsageFromData({
    input_tokens: 500,
    cache_read_input_tokens: 2000,
    cache_creation_input_tokens: 0,
  })

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
    inputTokens: 1300,
    outputTokens: 50,
    cacheReadTokens: 800,
    cacheCreationTokens: 100,
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
  })
}

function runClaudeTurnDurationTest() {
  assert.equal(__test__.pickClaudeTurnDurationMs(1000, 4500, null), 3500)
  assert.equal(__test__.pickClaudeTurnDurationMs(null, 4500, 2800), 2800)
  assert.equal(__test__.pickClaudeTurnDurationMs(5000, 3000, 1200), 1200)
  assert.equal(__test__.pickClaudeTurnDurationMs(null, null, null), null)
}

function runClaudeContextWindowMappingTest() {
  assert.equal(__test__.getContextWindowForModel('claude-sonnet-4-6-20260601'), 1000000)
  assert.equal(__test__.getContextWindowForModel('claude-opus-4-6-20260601'), 1000000)
  assert.equal(__test__.getContextWindowForModel('claude-sonnet-4-20250514'), 200000)
}

function runAssistantUsageUpdatesContextEstimateTest() {
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
  assert.equal(metrics.contextUsage, 630100)
  assert.equal(metrics.contextWindow, 200000)
}

function runClaudeAgentLiveUsageEmitsContextEstimateTest() {
  const metrics = claudeAgentTest.extractClaudeLiveUsageMetricsFromSdkMessage({
    message: {
      model: 'deepseek-v4-pro',
      usage: {
        input_tokens: 7900,
        cache_read_input_tokens: 619600,
        cache_creation_input_tokens: 0,
        output_tokens: 2600,
      },
    },
  })

  assert.deepEqual(metrics, {
    inputTokens: 7900,
    outputTokens: 2600,
    cacheReadTokens: 619600,
    cacheCreationTokens: 0,
    contextUsage: 630100,
    contextWindow: 200000,
  })
}

function runClaudeAgentFinalResultUsageEmitsContextEstimateTest() {
  const metrics = claudeAgentTest.buildClaudeFinalUsageMetricsFromResultUsage({
    input_tokens: 364,
    cache_read_input_tokens: 136320,
    cache_creation_input_tokens: 0,
    output_tokens: 240,
  }, 'deepseek-v4-pro')

  assert.deepEqual(metrics, {
    hasResultUsage: true,
    inputTokens: 364,
    outputTokens: 240,
    cacheReadTokens: 136320,
    cacheCreationTokens: 0,
    contextUsage: 136924,
    contextWindow: 200000,
  })
}

function runCompactBoundaryProvidesContextTest() {
  const metrics = __test__.collectClaudeTokenMetricsFromLines([
    JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      timestamp: '2026-06-26T10:00:00.000Z',
      compactMetadata: {
        preTokens: 167615,
        postTokens: 4580,
      },
    }),
  ])

  assert.equal(metrics.contextUsage, 4580)
  assert.equal(metrics.contextWindow, 200000)
}

function runLatestSessionCwdFromLinesTest() {
  const cwd = __test__.getLatestSessionCwdFromLines([
    JSON.stringify({ type: 'assistant', cwd: '' }),
    JSON.stringify({ type: 'system', cwd: 'D:\\company\\mindcraft-agent' }),
  ])
  assert.equal(cwd, 'D:\\company\\mindcraft-agent')
}

function runClaudeHistoryTurnTokensUsesUnifiedSemanticsTest() {
  const tokens = buildClaudeHistoryTurnTokensFromEntry({
    duration_ms: 4321,
    message: {
      model: 'deepseek-v4-pro',
      usage: {
        input_tokens: 139,
        cache_read_input_tokens: 41344,
        cache_creation_input_tokens: 256,
        output_tokens: 812,
      },
    },
  })

  assert.deepEqual(tokens, {
    inputTokens: 395,
    outputTokens: 812,
    cacheReadTokens: 41344,
    cacheCreationTokens: 256,
    durationMs: 4321,
  })
}

function runCompactBoundaryThenAssistantUsageUsesLaterEstimateTest() {
  const metrics = __test__.collectClaudeTokenMetricsFromLines([
    JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      timestamp: '2026-06-26T10:00:00.000Z',
      compactMetadata: {
        preTokens: 167615,
        postTokens: 4580,
      },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:10:00.000Z',
      model_name: 'deepseek-v4-pro',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 275,
          cache_read_input_tokens: 123264,
          cache_creation_input_tokens: 0,
          output_tokens: 59,
        },
      },
    }),
  ])

  assert.equal(metrics.contextUsage, 123598)
  assert.equal(metrics.contextWindow, 200000)
}

function runAssistantUsageBeforeCompactBoundaryPreservesCompactContextTest() {
  const metrics = __test__.collectClaudeTokenMetricsFromLines([
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:00:00.000Z',
      model_name: 'claude-sonnet-4-20250514',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 50,
          output_tokens: 20,
        },
      },
    }),
    JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      timestamp: '2026-06-26T10:01:00.000Z',
      compactMetadata: {
        preTokens: 167615,
        postTokens: 4580,
      },
    }),
  ])

  assert.equal(metrics.contextUsage, 4580)
  assert.equal(metrics.contextWindow, 200000)
}

function runMultipleAssistantUsageAccumulatesTurnTokensButUsesLatestContextTest() {
  const metrics = __test__.collectClaudeTokenMetricsFromLines([
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:00:00.000Z',
      model_name: 'claude-sonnet-4-20250514',
      message: {
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 50,
          output_tokens: 20,
        },
      },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:01:00.000Z',
      model_name: 'claude-sonnet-4-20250514',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 200,
          cache_read_input_tokens: 2000,
          cache_creation_input_tokens: 100,
          output_tokens: 30,
        },
      },
    }),
  ])

  assert.equal(metrics.inputTokens, 450)
  assert.equal(metrics.outputTokens, 50)
  assert.equal(metrics.cacheReadTokens, 3000)
  assert.equal(metrics.cacheCreationTokens, 150)
  assert.equal(metrics.contextUsage, 2330)
  assert.equal(metrics.contextWindow, 200000)
}

function runDefaultMetricsUseLatestTurnNotWholeSessionTest() {
  const metrics = __test__.collectClaudeTokenMetricsFromLines([
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-26T10:00:00.000Z',
      message: { content: 'first' },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:00:10.000Z',
      model_name: 'claude-sonnet-4-20250514',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1000,
          cache_read_input_tokens: 100000,
          cache_creation_input_tokens: 0,
          output_tokens: 500,
        },
      },
    }),
    JSON.stringify({
      type: 'user',
      timestamp: '2026-06-26T10:01:00.000Z',
      message: { content: 'second' },
    }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-06-26T10:01:05.000Z',
      model_name: 'claude-sonnet-4-20250514',
      message: {
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 0,
          output_tokens: 5,
        },
      },
    }),
  ])

  assert.equal(metrics.inputTokens, 10)
  assert.equal(metrics.outputTokens, 5)
  assert.equal(metrics.cacheReadTokens, 20)
  assert.equal(metrics.durationMs, 5000)
  assert.equal(metrics.contextUsage, 35)
}

function runHistoryTurnTokensAggregateOneUserTurnTest() {
  const entries = [
    {
      type: 'user',
      timestamp: '2026-06-26T10:00:00.000Z',
      message: { content: 'do work' },
    },
    {
      type: 'assistant',
      timestamp: '2026-06-26T10:00:10.000Z',
      message: {
        role: 'assistant',
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 50,
          output_tokens: 20,
        },
      },
    },
    {
      type: 'user',
      timestamp: '2026-06-26T10:00:15.000Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1' }] },
    },
    {
      type: 'assistant',
      timestamp: '2026-06-26T10:00:30.000Z',
      message: {
        role: 'assistant',
        usage: {
          input_tokens: 200,
          cache_read_input_tokens: 2000,
          cache_creation_input_tokens: 100,
          output_tokens: 30,
        },
      },
    },
  ]
  const messages = entries.map((entry) => {
    if (entry.type === 'assistant') return { role: 'assistant', _source_type: 'assistant' }
    return { role: entry.type, _source_type: entry.type }
  })

  annotateClaudeHistoryMessagesWithTurnTokens(messages, entries)

  assert.equal(messages[1]._turnTokens, undefined)
  assert.deepEqual(messages[3]._turnTokens, {
    inputTokens: 450,
    outputTokens: 50,
    cacheReadTokens: 3000,
    cacheCreationTokens: 150,
    durationMs: 30000,
    costUsd: 0,
  })
}

function run() {
  runNativeClaudeModelTest()
  runThirdPartyClaudeSdkModelTest()
  runUnknownModelFallsBackToConservativeSumTest()
  runNativeClaudeUiNormalizationTest()
  runThirdPartyClaudeUiNormalizationTest()
  runClaudeTurnDurationTest()
  runClaudeContextWindowMappingTest()
  runAssistantUsageUpdatesContextEstimateTest()
  runClaudeAgentLiveUsageEmitsContextEstimateTest()
  runClaudeAgentFinalResultUsageEmitsContextEstimateTest()
  runCompactBoundaryProvidesContextTest()
  runClaudeHistoryTurnTokensUsesUnifiedSemanticsTest()
  runCompactBoundaryThenAssistantUsageUsesLaterEstimateTest()
  runAssistantUsageBeforeCompactBoundaryPreservesCompactContextTest()
  runMultipleAssistantUsageAccumulatesTurnTokensButUsesLatestContextTest()
  runDefaultMetricsUseLatestTurnNotWholeSessionTest()
  runHistoryTurnTokensAggregateOneUserTurnTest()
  runLatestSessionCwdFromLinesTest()
  console.log('claude context usage tests passed')
}

run()
