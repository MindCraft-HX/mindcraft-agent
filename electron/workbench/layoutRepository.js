'use strict'

const fs = require('fs')
const path = require('path')

function safeUnlink(filePath, fsImpl) {
  try { fsImpl.unlinkSync(filePath) } catch (_) {}
}

function readJson(filePath, fsImpl) {
  try {
    const raw = fsImpl.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (_) {
    return null
  }
}

function atomicWriteJson(filePath, value, fsImpl) {
  const directory = path.dirname(filePath)
  fsImpl.mkdirSync(directory, { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const text = JSON.stringify(value, null, 2)
  let descriptor
  try {
    descriptor = fsImpl.openSync(tempPath, 'w')
    fsImpl.writeFileSync(descriptor, text, 'utf8')
    if (typeof fsImpl.fsyncSync === 'function') fsImpl.fsyncSync(descriptor)
    fsImpl.closeSync(descriptor)
    descriptor = null
    fsImpl.renameSync(tempPath, filePath)
  } catch (error) {
    if (descriptor != null) {
      try { fsImpl.closeSync(descriptor) } catch (_) {}
    }
    safeUnlink(tempPath, fsImpl)
    throw error
  }
}

/**
 * Stores only the versioned Workbench descriptor. The caller supplies schema
 * validation so this repository stays independent from renderer layout logic.
 */
function createLayoutRepository({ directory, validate, createDefault, fsImpl = fs } = {}) {
  if (typeof directory !== 'string' || !directory) throw new Error('layout repository requires a directory')
  if (typeof validate !== 'function') throw new Error('layout repository requires validate(raw)')
  if (typeof createDefault !== 'function') throw new Error('layout repository requires createDefault()')

  const filePath = path.join(directory, 'workbench-layout.v1.json')
  const backupPath = `${filePath}.last-known-good`
  let currentWindowInstanceId = ''
  let lastRevision = -1

  function loadCandidate(candidatePath) {
    const raw = readJson(candidatePath, fsImpl)
    if (!raw) return null
    const layout = validate(raw)
    return layout || null
  }

  function read() {
    const current = loadCandidate(filePath)
    if (current) {
      lastRevision = Math.max(lastRevision, Number.isInteger(current.revision) ? current.revision : 0)
      return { layout: current, source: 'current' }
    }
    const backup = loadCandidate(backupPath)
    if (backup) {
      lastRevision = Math.max(lastRevision, Number.isInteger(backup.revision) ? backup.revision : 0)
      return { layout: backup, source: 'backup' }
    }
    return { layout: createDefault(), source: 'default' }
  }

  function setWindowInstance(windowInstanceId, initialRevision = 0) {
    if (typeof windowInstanceId !== 'string' || !windowInstanceId) throw new Error('windowInstanceId is required')
    currentWindowInstanceId = windowInstanceId
    // A renderer can reload and save before it asks to load. Seed the revision
    // from disk so that call ordering cannot overwrite a newer descriptor.
    const persisted = loadCandidate(filePath) || loadCandidate(backupPath)
    const persistedRevision = Number.isInteger(persisted?.revision) ? persisted.revision : 0
    lastRevision = Math.max(lastRevision, persistedRevision, Number.isInteger(initialRevision) ? initialRevision : 0)
  }

  function save({ windowInstanceId, revision, layout } = {}) {
    if (!currentWindowInstanceId || windowInstanceId !== currentWindowInstanceId) {
      return { saved: false, reason: 'stale-window' }
    }
    if (!Number.isInteger(revision) || revision < 0) return { saved: false, reason: 'invalid-revision' }
    if (revision < lastRevision) return { saved: false, reason: 'stale-revision' }
    if (revision === lastRevision) return { saved: false, reason: 'duplicate-revision' }

    const normalized = validate(layout)
    if (!normalized || normalized.revision !== revision) return { saved: false, reason: 'invalid-layout' }

    try {
      if (fsImpl.existsSync(filePath)) fsImpl.copyFileSync(filePath, backupPath)
      atomicWriteJson(filePath, normalized, fsImpl)
      lastRevision = revision
      return { saved: true, layout: normalized }
    } catch (error) {
      return { saved: false, reason: 'write-failed', error }
    }
  }

  return {
    read,
    save,
    setWindowInstance,
    paths: { filePath, backupPath },
    __test__: {
      getState: () => ({ currentWindowInstanceId, lastRevision }),
    },
  }
}

module.exports = { createLayoutRepository }
