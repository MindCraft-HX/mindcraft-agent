const assert = require('assert')

const {
  __test__,
} = require('../packages/agent/electron/codexAgent.js')
const fs = require('fs')
const os = require('os')
const path = require('path')

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
    inputTokens: 37,
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

function runBuildLiveMetricsFromTokenCountTotalsFallbackTest() {
  const metrics = __test__.buildCodexMetricsFromTokenCountPayload({
    info: {
      total_token_usage: {
        input_tokens: 1500,
        output_tokens: 120,
        cached_input_tokens: 900,
        cache_creation_input_tokens: 40,
      },
      last_token_usage: {},
      context_usage: 1620,
      model_context_window: 258400,
    },
  }, {
    model: 'gpt-5',
    durationMs: 3000,
    turnStartTotals: {
      input_tokens: 1000,
      output_tokens: 20,
      cached_input_tokens: 700,
      cache_creation_input_tokens: 10,
    },
  })

  assert.equal(metrics.inputTokens, 330)
  assert.equal(metrics.outputTokens, 100)
  assert.equal(metrics.cacheReadTokens, 200)
  assert.equal(metrics.cacheCreationTokens, 30)
  assert.equal(metrics.contextWindow, 258400)
  assert.equal(metrics.durationMs, 3000)
}

function runBuildPerTurnTokensReturnsNullForEmptyTest() {
  const perTurn = __test__.buildCodexPerTurnTokens(null, null)
  assert.equal(perTurn, null)
}

// 发现 1 回归：验证 normalizeCodexUsage 返回 snake_case 字段的值非零，
// 确保 turn.completed 用正确 key 读取后 emitCodexMetricsViaStore 不会传全 0
function runNormalizeCodexUsageTerminalSnapshotTest() {
  const usage = {
    input_tokens: 1200,
    output_tokens: 350,
    total_tokens: 1550,
    cache_read_input_tokens: 600,
    cache_creation_input_tokens: 80,
    input_tokens_details: { cached_tokens: 0 },
  }

  const result = __test__.normalizeCodexUsage(usage)

  // 三个关键断言：snake_case 字段必须存在且非零（bug 修前会因 camelCase 读取返回 0）
  assert.ok(typeof result.input_tokens === 'number', 'input_tokens is number')
  assert.ok(result.input_tokens > 0, `input_tokens=${result.input_tokens} should be > 0 (raw 1200 - cache 600 + creation 80 = 680)`)
  assert.equal(result.input_tokens, 680, 'input = raw - cacheRead + cacheCreation')
  assert.ok(typeof result.output_tokens === 'number', 'output_tokens is number')
  assert.ok(result.output_tokens > 0, `output_tokens=${result.output_tokens} should be 350`)
  assert.equal(result.output_tokens, 350)
  assert.ok(typeof result.cache_read_input_tokens === 'number', 'cache_read_input_tokens is number')
  assert.ok(result.cache_read_input_tokens > 0, `cache_read_input_tokens=${result.cache_read_input_tokens} should be 600`)
  assert.equal(result.cache_read_input_tokens, 600)
  assert.ok(typeof result.cache_creation_input_tokens === 'number', 'cache_creation_input_tokens is number')
  assert.ok(result.cache_creation_input_tokens > 0, `cache_creation_input_tokens=${result.cache_creation_input_tokens} should be 80`)
  assert.equal(result.cache_creation_input_tokens, 80)

  // confirm: 不存在 camelCase 别名（避免误用）
  assert.equal(result.inputTokens, undefined, 'no inputTokens alias on wrapper result')
  assert.equal(result.outputTokens, undefined, 'no outputTokens alias on wrapper result')
  assert.equal(result.cacheReadTokens, undefined, 'no cacheReadTokens alias on wrapper result')
  assert.equal(result.cacheCreationTokens, undefined, 'no cacheCreationTokens alias on wrapper result')

  console.log('  ✓ terminal snapshot: input_tokens=%d output_tokens=%d cache_read=%d cache_creation=%d',
    result.input_tokens, result.output_tokens, result.cache_read_input_tokens, result.cache_creation_input_tokens)
}

function runReadSessionFileRangeBackfillsTurnTokensTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-turn-tokens-'))
  const filePath = path.join(tmpDir, 'session.jsonl')
  const rows = [
    { timestamp: '2026-06-24T10:00:00.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'hello' } },
    { timestamp: '2026-06-24T10:00:01.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'world' } },
    { timestamp: '2026-06-24T10:00:02.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'world' }] } },
    { timestamp: '2026-06-24T10:00:03.000Z', type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 120, cached_input_tokens: 100, output_tokens: 7, total_tokens: 127 }, model_context_window: 258400 } } },
    { timestamp: '2026-06-24T10:00:04.000Z', type: 'event_msg', payload: { type: 'task_complete', duration_ms: 4000 } },
  ]
  fs.writeFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')

  const result = __test__.readSessionFileRange(filePath, 0, 60)
  const assistant = result.messages.find(message => message.role === 'assistant')
  assert.ok(assistant)
  assert.deepEqual(assistant._turnTokens, {
    inputTokens: 20,
    outputTokens: 7,
    cacheReadTokens: 100,
    cacheCreationTokens: 0,
    durationMs: 4000,
  })

  fs.rmSync(tmpDir, { recursive: true, force: true })
}

function run() {
  runNormalizeCodexUsageTest()
  runBuildPerTurnTokensPrefersParsedMetricsTest()
  runBuildPerTurnTokensFallsBackToUsageTest()
  runBuildLiveMetricsFromTokenCountPayloadTest()
  runBuildLiveMetricsFromTokenCountTotalsFallbackTest()
  runBuildPerTurnTokensReturnsNullForEmptyTest()
  runNormalizeCodexUsageTerminalSnapshotTest()
  runReadSessionFileRangeBackfillsTurnTokensTest()
  console.log('codex turn tokens tests passed')
}

run()
