'use strict';

/**
 * Unit tests for claude/historyReader.js.
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  annotateClaudeHistoryEntryWithTurnTokens,
  readJsonlPageLinesFromTail,
} = require('../packages/agent/electron/claude/historyReader.js')

// ---- annotateClaudeHistoryEntryWithTurnTokens ----

function runAnnotateTurnTokensTests() {
  // No usage → no annotation
  const msg1 = { role: 'user', content: 'hi' }
  const result1 = annotateClaudeHistoryEntryWithTurnTokens(msg1, {})
  assert.equal(result1._turnTokens, undefined)

  // Zero token entry → no annotation
  const msg2 = { role: 'assistant', content: 'hello' }
  const result2 = annotateClaudeHistoryEntryWithTurnTokens(msg2, {
    message: { usage: { input_tokens: 0, output_tokens: 0 } },
  })
  assert.equal(result2._turnTokens, undefined)

  // Null msgData → returns null/undefined as-is
  assert.equal(annotateClaudeHistoryEntryWithTurnTokens(null, { message: { usage: { input_tokens: 100 } } }), null)

  // Valid entry with tokens → annotation applied
  const msg3 = { role: 'assistant', content: 'response' }
  const result3 = annotateClaudeHistoryEntryWithTurnTokens(msg3, {
    message: {
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50 },
      model: 'claude-sonnet-4-20250514',
    },
    duration_ms: 1500,
  })
  assert.ok(result3._turnTokens)
  // normalizeClaudeUsage subtracts cache_read from input_tokens (1000 - 50 = 950)
  assert.equal(result3._turnTokens.inputTokens, 950)
  assert.equal(result3._turnTokens.outputTokens, 200)
  assert.equal(result3._turnTokens.cacheReadTokens, 50)
  assert.equal(result3._turnTokens.durationMs, 1500)
}

// ---- readJsonlPageLinesFromTail ----

function runReadJsonlPageTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-history-reader-'))
  try {
    // Non-existent file → throws
    assert.throws(() => readJsonlPageLinesFromTail(path.join(dir, 'nonexistent.jsonl')))

    // Empty file
    const emptyPath = path.join(dir, 'empty.jsonl')
    fs.writeFileSync(emptyPath, '', 'utf8')
    const page0 = readJsonlPageLinesFromTail(emptyPath, 0, 60)
    assert.deepEqual(page0.lines, [])
    assert.equal(page0.hasMore, false)
    assert.equal(page0.totalPages, 1)
    assert.ok(page0.fileSize >= 0)

    // File with fewer lines than page size
    const smallPath = path.join(dir, 'small.jsonl')
    const smallLines = ['{"a":1}', '{"b":2}', '{"c":3}']
    fs.writeFileSync(smallPath, smallLines.join('\n') + '\n', 'utf8')
    const pageSmall = readJsonlPageLinesFromTail(smallPath, 0, 60)
    assert.equal(pageSmall.lines.length, 3)
    assert.equal(pageSmall.lines[0], '{"a":1}')
    assert.equal(pageSmall.lines[2], '{"c":3}')
    assert.equal(pageSmall.hasMore, false)
    assert.equal(pageSmall.totalPages, 1)

    // File with many lines — pagination
    const largePath = path.join(dir, 'large.jsonl')
    const largeLines = Array.from({ length: 150 }, (_, i) => `{"line":${i + 1}}`)
    fs.writeFileSync(largePath, largeLines.join('\n') + '\n', 'utf8')
    const pageLarge0 = readJsonlPageLinesFromTail(largePath, 0, 60)
    assert.equal(pageLarge0.lines.length, 60)
    assert.equal(pageLarge0.lines[0], '{"line":91}')
    assert.equal(pageLarge0.lines[59], '{"line":150}')
    assert.equal(pageLarge0.hasMore, true)

    const pageLarge1 = readJsonlPageLinesFromTail(largePath, 1, 60)
    assert.equal(pageLarge1.lines.length, 60)
    assert.equal(pageLarge1.lines[0], '{"line":31}')
    assert.equal(pageLarge1.lines[59], '{"line":90}')
    assert.equal(pageLarge1.hasMore, true)

    const pageLarge2 = readJsonlPageLinesFromTail(largePath, 2, 60)
    assert.equal(pageLarge2.lines.length, 30)
    assert.equal(pageLarge2.lines[0], '{"line":1}')
    assert.equal(pageLarge2.lines[29], '{"line":30}')
    assert.equal(pageLarge2.hasMore, false)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
}

// ---- runner ----

function run() {
  runAnnotateTurnTokensTests()
  runReadJsonlPageTests()
  console.log('claude history reader tests passed')
}

run()
