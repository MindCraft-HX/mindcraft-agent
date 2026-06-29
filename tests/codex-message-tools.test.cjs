'use strict';

/**
 * Unit tests for codex/messageTools.js — pure helpers.
 */

const assert = require('assert')
const {
  pickFirstStringValue,
  buildMessageDedupKey,
  normalizeCodexToolName,
  isCodeXWriteToolName,
  isCodeXEditToolName,
  isCodeXReadToolName,
} = require('../packages/agent/electron/codex/messageTools.js')

// ---- pickFirstStringValue ----

function runPickFirstStringValueTests() {
  assert.equal(pickFirstStringValue(), '')
  assert.equal(pickFirstStringValue(42), '')
  assert.equal(pickFirstStringValue(null, undefined), '')
  assert.equal(pickFirstStringValue(''), '')
  assert.equal(pickFirstStringValue('hello'), 'hello')
  assert.equal(pickFirstStringValue('', 'world'), 'world')
  assert.equal(pickFirstStringValue(0, '', 'third'), 'third')
}

// ---- buildMessageDedupKey ----

function runBuildMessageDedupKeyTests() {
  assert.equal(buildMessageDedupKey('user', 'hello'), 'user:hello')
  assert.equal(buildMessageDedupKey('assistant', ''), 'assistant:')
  assert.equal(buildMessageDedupKey('', ''), ':')
  // With content array
  assert.equal(
    buildMessageDedupKey('tool', 'result', [{ type: 'text', text: 'ok' }]),
    'tool:result:[{"type":"text","text":"ok"}]'
  )
  // Empty content array — falls back to role:text only
  assert.equal(buildMessageDedupKey('tool', 'result', []), 'tool:result')
}

// ---- normalizeCodexToolName ----

function runNormalizeToolNameTests() {
  assert.equal(normalizeCodexToolName('Write'), 'write')
  assert.equal(normalizeCodexToolName('EDIT'), 'edit')
  assert.equal(normalizeCodexToolName('Read_File'), 'read_file')
  assert.equal(normalizeCodexToolName(''), '')
  assert.equal(normalizeCodexToolName(null), '')
}

// ---- tool classifiers ----

function runToolClassifierTests() {
  // Write tools
  assert.equal(isCodeXWriteToolName('write'), true)
  assert.equal(isCodeXWriteToolName('Write'), true)
  assert.equal(isCodeXWriteToolName('write_file'), true)
  assert.equal(isCodeXWriteToolName('create_file'), true)
  assert.equal(isCodeXWriteToolName('writefile'), true)
  assert.equal(isCodeXWriteToolName('read'), false)

  // Edit tools
  assert.equal(isCodeXEditToolName('edit'), true)
  assert.equal(isCodeXEditToolName('str_replace'), true)
  assert.equal(isCodeXEditToolName('str_replace_editor'), true)
  assert.equal(isCodeXEditToolName('str_replace_based_edit'), true)
  assert.equal(isCodeXEditToolName('write'), false)

  // Read tools
  assert.equal(isCodeXReadToolName('read'), true)
  assert.equal(isCodeXReadToolName('read_file'), true)
  assert.equal(isCodeXReadToolName('Read'), true)
  assert.equal(isCodeXReadToolName('write'), false)
  assert.equal(isCodeXReadToolName('edit'), false)
}

// ---- runner ----

function run() {
  runPickFirstStringValueTests()
  runBuildMessageDedupKeyTests()
  runNormalizeToolNameTests()
  runToolClassifierTests()
  console.log('codex message tools tests passed')
}

run()
