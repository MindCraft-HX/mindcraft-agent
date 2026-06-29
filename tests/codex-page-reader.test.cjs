'use strict';

/**
 * Unit tests for codex/pageReader.js.
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  readFirstLine,
  safeJsonParse,
} = require('../packages/agent/electron/codex/pageReader.js')

// ---- safeJsonParse ----

function runSafeJsonParseTests() {
  assert.equal(safeJsonParse(''), null)
  assert.equal(safeJsonParse('not json'), null)
  assert.equal(safeJsonParse('{'), null)
  assert.deepEqual(safeJsonParse('{}'), {})
  assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 })
  assert.deepEqual(safeJsonParse('[1,2,3]'), [1, 2, 3])
  assert.deepEqual(safeJsonParse('"hello"'), 'hello')
  assert.equal(safeJsonParse('42'), 42)
  assert.equal(safeJsonParse('true'), true)
}

// ---- readFirstLine ----

function runReadFirstLineTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-page-reader-'))
  try {
    // Non-existent file
    assert.equal(readFirstLine(path.join(dir, 'nonexistent.txt')), '')

    // Empty file
    const emptyPath = path.join(dir, 'empty.md')
    fs.writeFileSync(emptyPath, '', 'utf8')
    assert.equal(readFirstLine(emptyPath), '')

    // File with only blank lines
    const blankPath = path.join(dir, 'blank.md')
    fs.writeFileSync(blankPath, '\n  \n\t\n', 'utf8')
    assert.equal(readFirstLine(blankPath), '')

    // Single line
    const singlePath = path.join(dir, 'single.md')
    fs.writeFileSync(singlePath, 'Hello World', 'utf8')
    assert.equal(readFirstLine(singlePath), 'Hello World')

    // Multi-line with markdown heading
    const mdPath = path.join(dir, 'skill.md')
    fs.writeFileSync(mdPath, '# Skill Title\n\nDescription here.\n', 'utf8')
    assert.equal(readFirstLine(mdPath), 'Skill Title')

    // CRLF line endings
    const crlfPath = path.join(dir, 'crlf.md')
    fs.writeFileSync(crlfPath, '# Title\r\nBody\r\n', 'utf8')
    assert.equal(readFirstLine(crlfPath), 'Title')

    // Leading blank lines
    const leadingBlankPath = path.join(dir, 'leading.md')
    fs.writeFileSync(leadingBlankPath, '\n\n# Actual Title\nBody\n', 'utf8')
    assert.equal(readFirstLine(leadingBlankPath), 'Actual Title')
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
}

// ---- runner ----

function run() {
  runSafeJsonParseTests()
  runReadFirstLineTests()
  console.log('codex page reader tests passed')
}

run()
