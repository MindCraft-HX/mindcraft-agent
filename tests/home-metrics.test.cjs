const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/homeMetrics.js')

function line(value) {
  return JSON.stringify(value)
}

function runParseClaudeLinesNativeModelTest() {
  const lines = [
    line({
      timestamp: '2026-06-25T10:00:00.000Z',
      type: 'assistant',
      model: 'claude-sonnet-4-20250514',
      message: {
        usage: {
          input_tokens: 1200,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 100,
          output_tokens: 50,
        },
        stop_reason: 'end_turn',
      },
    }),
  ]

  const result = __test__.parseClaudeLines(lines)
  assert.equal(result.input, 1300)
  assert.equal(result.output, 50)
  assert.equal(result.cacheRead, 800)
  assert.equal(result.cacheCreation, 100)
}

function runParseClaudeLinesThirdPartyModelTest() {
  const lines = [
    line({
      timestamp: '2026-06-25T10:00:00.000Z',
      type: 'assistant',
      model: 'deepseek-v4-pro',
      message: {
        usage: {
          input_tokens: 139,
          cache_read_input_tokens: 41344,
          cache_creation_input_tokens: 256,
          output_tokens: 812,
        },
        stop_reason: 'end_turn',
      },
    }),
  ]

  const result = __test__.parseClaudeLines(lines)
  assert.equal(result.input, 395)
  assert.equal(result.output, 812)
  assert.equal(result.cacheRead, 41344)
  assert.equal(result.cacheCreation, 256)
}

function runParseClaudeLinesSumsHistoricalCacheReadTest() {
  const lines = [
    line({
      timestamp: '2026-06-25T10:00:00.000Z',
      type: 'assistant',
      model: 'deepseek-v4-pro',
      message: {
        usage: {
          input_tokens: 1000,
          cache_read_input_tokens: 100000,
          cache_creation_input_tokens: 0,
          output_tokens: 100,
        },
        stop_reason: 'tool_use',
      },
    }),
    line({
      timestamp: '2026-06-25T10:01:00.000Z',
      type: 'assistant',
      model: 'deepseek-v4-pro',
      message: {
        usage: {
          input_tokens: 1200,
          cache_read_input_tokens: 140000,
          cache_creation_input_tokens: 0,
          output_tokens: 120,
        },
        stop_reason: 'end_turn',
      },
    }),
  ]

  const result = __test__.parseClaudeLines(lines)
  assert.equal(result.input, 2200)
  assert.equal(result.output, 220)
  assert.equal(result.cacheRead, 240000)
}

function runParseCodexLinesUsesCumulativeTotalsTest() {
  const lines = [
    line({
      timestamp: '2026-06-25T10:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 800,
            output_tokens: 100,
          },
        },
      },
    }),
    line({
      timestamp: '2026-06-25T10:01:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 2500,
            cached_input_tokens: 2200,
            output_tokens: 300,
          },
        },
      },
    }),
  ]

  const result = __test__.parseCodexLines(lines)
  assert.equal(result.input, 300)
  assert.equal(result.output, 300)
  assert.equal(result.cacheRead, 2200)
}

function runParseCodexLinesDateMapUsesCumulativeDeltasTest() {
  const lines = [
    line({
      timestamp: '2026-06-24T10:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 800,
            output_tokens: 100,
          },
        },
      },
    }),
    line({
      timestamp: '2026-06-25T10:01:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 2500,
            cached_input_tokens: 2200,
            output_tokens: 300,
          },
        },
      },
    }),
  ]

  const result = __test__.parseCodexLines(lines)
  const previousDay = result.dateMap.get('2026-06-24')
  const today = result.dateMap.get('2026-06-25')
  assert.equal(previousDay.input, 200)
  assert.equal(previousDay.output, 100)
  assert.equal(previousDay.cacheRead, 800)
  assert.equal(today.input, 100)
  assert.equal(today.output, 200)
  assert.equal(today.cacheRead, 1400)
}

function runParseCodexLinesSumsLastUsageWhenTotalsAreMissingTest() {
  const lines = [
    line({
      timestamp: '2026-06-25T10:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 900,
            output_tokens: 50,
          },
        },
      },
    }),
    line({
      timestamp: '2026-06-25T10:01:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 1200,
            cached_input_tokens: 1100,
            output_tokens: 70,
          },
        },
      },
    }),
  ]

  const result = __test__.parseCodexLines(lines)
  assert.equal(result.input, 200)
  assert.equal(result.output, 120)
  assert.equal(result.cacheRead, 2000)
}

function runEstimateClaudeCostUsesRegularInputPlusCacheCreationTest() {
  const cost = __test__.estimateClaudeCost(395, 812, 41344, 256)
  const expected = (139 / 1e6) * 3.0 + (812 / 1e6) * 15.0 + (41344 / 1e6) * 0.3 + (256 / 1e6) * 3.75
  assert.equal(cost, expected)
}

function run() {
  runParseClaudeLinesNativeModelTest()
  runParseClaudeLinesThirdPartyModelTest()
  runParseClaudeLinesSumsHistoricalCacheReadTest()
  runParseCodexLinesUsesCumulativeTotalsTest()
  runParseCodexLinesDateMapUsesCumulativeDeltasTest()
  runParseCodexLinesSumsLastUsageWhenTotalsAreMissingTest()
  runEstimateClaudeCostUsesRegularInputPlusCacheCreationTest()
  console.log('home metrics tests passed')
}

run()
