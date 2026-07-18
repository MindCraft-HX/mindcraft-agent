'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createLayoutRepository } = require('../electron/workbench/layoutRepository')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mc-workbench-layout-'))
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function createLayout(revision, activeItemId = 'agent:codehub') {
  return { version: 1, revision, activeItemId }
}

function validLayout(raw) {
  if (!raw || raw.version !== 1 || !Number.isInteger(raw.revision) || raw.revision < 0) return null
  if (typeof raw.activeItemId !== 'string') return null
  return { version: 1, revision: raw.revision, activeItemId: raw.activeItemId }
}

function repository(directory) {
  return createLayoutRepository({
    directory,
    validate: validLayout,
    createDefault: () => createLayout(0),
  })
}

test('reads default layout when no persisted descriptor exists', () => {
  const dir = tmpDir()
  try {
    const result = repository(dir).read()
    assert.equal(result.source, 'default')
    assert.deepEqual(result.layout, createLayout(0))
  } finally { cleanup(dir) }
})

test('accepts only the current window instance and monotonic revisions', () => {
  const dir = tmpDir()
  try {
    const repo = repository(dir)
    repo.setWindowInstance('renderer-a')
    assert.equal(repo.save({ windowInstanceId: 'renderer-b', revision: 1, layout: createLayout(1) }).reason, 'stale-window')
    assert.equal(repo.save({ windowInstanceId: 'renderer-a', revision: 1, layout: createLayout(1) }).saved, true)
    assert.equal(repo.save({ windowInstanceId: 'renderer-a', revision: 1, layout: createLayout(1) }).reason, 'duplicate-revision')
    assert.equal(repo.save({ windowInstanceId: 'renderer-a', revision: 0, layout: createLayout(0) }).reason, 'stale-revision')
  } finally { cleanup(dir) }
})

test('seeds a new renderer instance from disk before its first save', () => {
  const dir = tmpDir()
  try {
    const first = repository(dir)
    first.setWindowInstance('renderer-a')
    assert.equal(first.save({ windowInstanceId: 'renderer-a', revision: 3, layout: createLayout(3) }).saved, true)

    const reloaded = repository(dir)
    reloaded.setWindowInstance('renderer-b')
    assert.equal(reloaded.save({ windowInstanceId: 'renderer-b', revision: 1, layout: createLayout(1) }).reason, 'stale-revision')
  } finally { cleanup(dir) }
})

test('keeps last-known-good layout when current file is corrupt', () => {
  const dir = tmpDir()
  try {
    const repo = repository(dir)
    repo.setWindowInstance('renderer-a')
    assert.equal(repo.save({ windowInstanceId: 'renderer-a', revision: 1, layout: createLayout(1, 'document:a') }).saved, true)
    assert.equal(repo.save({ windowInstanceId: 'renderer-a', revision: 2, layout: createLayout(2, 'document:b') }).saved, true)
    fs.writeFileSync(repo.paths.filePath, '{invalid json', 'utf8')
    const restored = repository(dir).read()
    assert.equal(restored.source, 'backup')
    assert.deepEqual(restored.layout, createLayout(1, 'document:a'))
  } finally { cleanup(dir) }
})

test('rejects descriptors that do not pass the supplied schema validation', () => {
  const dir = tmpDir()
  try {
    const repo = repository(dir)
    repo.setWindowInstance('renderer-a')
    const result = repo.save({ windowInstanceId: 'renderer-a', revision: 1, layout: { version: 999, revision: 1 } })
    assert.equal(result.saved, false)
    assert.equal(result.reason, 'invalid-layout')
  } finally { cleanup(dir) }
})
