const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  appendLogLineWithRotation,
  trimTextToMaxBytes,
  writeFileWithMaxBytes,
} = require('./diagnosticsFileUtils')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mindcraft-diag-'))
}

test('trimTextToMaxBytes truncates oversized text', () => {
  const result = trimTextToMaxBytes('x'.repeat(100), 32, { marker: '[cut]' })
  assert.equal(result.truncated, true)
  assert.equal(Buffer.byteLength(result.text, 'utf8') <= 32, true)
  assert.equal(result.text.includes('[cut]'), true)
})

test('appendLogLineWithRotation rotates file after limit', () => {
  const dir = makeTempDir()
  const logPath = path.join(dir, 'diag.log')

  appendLogLineWithRotation(logPath, 'a'.repeat(80), { maxBytes: 64 })
  appendLogLineWithRotation(logPath, 'b'.repeat(80), { maxBytes: 64 })

  assert.equal(fs.existsSync(logPath), true)
  assert.equal(fs.existsSync(`${logPath}.1`), true)
})

test('writeFileWithMaxBytes caps artifact size', () => {
  const dir = makeTempDir()
  const filePath = path.join(dir, 'artifact.txt')
  const result = writeFileWithMaxBytes(filePath, 'z'.repeat(200), { maxBytes: 64 })

  assert.equal(result.truncated, true)
  assert.equal(fs.existsSync(filePath), true)
  assert.equal(fs.statSync(filePath).size <= 64, true)
})
