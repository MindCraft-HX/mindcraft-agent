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
  assert.equal(result.input, 400)
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

function runEstimateClaudeCostUsesRegularInputPlusCacheCreationTest() {
  const cost = __test__.estimateClaudeCost(395, 812, 41344, 256)
  const expected = (139 / 1e6) * 3.0 + (812 / 1e6) * 15.0 + (41344 / 1e6) * 0.3 + (256 / 1e6) * 3.75
  assert.equal(cost, expected)
}

function run() {
  runParseClaudeLinesNativeModelTest()
  runParseClaudeLinesThirdPartyModelTest()
  runEstimateClaudeCostUsesRegularInputPlusCacheCreationTest()
  console.log('home metrics tests passed')
}

run()
