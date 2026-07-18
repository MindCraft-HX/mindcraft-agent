'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createDocumentRepository } = require('../electron/documents/documentRepository')

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-document-repository-'))
  const filePath = path.join(directory, 'note.md')
  fs.writeFileSync(filePath, 'base', 'utf8')
  return { directory, filePath, repository: createDocumentRepository() }
}

test('repository reads a canonical identity and compare-and-saves it atomically', () => {
  const fixture = createFixture()
  try {
    const identity = fixture.repository.describe(fixture.filePath)
    assert.equal(identity.ok, true)
    assert.deepEqual(fixture.repository.read(identity).text, 'base')
    assert.equal(fixture.repository.write(identity, 'updated').ok, true)
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), 'updated')
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }) }
})

test('repository refuses to overwrite an externally changed file', () => {
  const fixture = createFixture()
  try {
    const identity = fixture.repository.describe(fixture.filePath)
    fs.writeFileSync(fixture.filePath, 'external change is longer', 'utf8')
    assert.deepEqual(fixture.repository.write(identity, 'draft'), { ok: false, reason: 'conflict' })
    assert.equal(fs.readFileSync(fixture.filePath, 'utf8'), 'external change is longer')
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }) }
})
