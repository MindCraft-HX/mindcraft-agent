'use strict'

const fs = require('fs')
const path = require('path')
const { describeDocumentIdentity } = require('../mainModules/documentIdentity')

const MAX_DOCUMENT_TEXT_BYTES = 2 * 1024 * 1024

function sameSignature(left, right) {
  return Boolean(left && right
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
    && left.ino === right.ino)
}

function sameCanonicalKey(left, right) {
  return typeof left === 'string' && left === right
}

function atomicWrite(filePath, text, fsImpl) {
  const directory = path.dirname(filePath)
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  let descriptor
  try {
    descriptor = fsImpl.openSync(tempPath, 'wx')
    fsImpl.writeFileSync(descriptor, text, 'utf8')
    fsImpl.fsyncSync?.(descriptor)
    fsImpl.closeSync(descriptor)
    descriptor = null
    fsImpl.renameSync(tempPath, filePath)
  } catch (error) {
    if (descriptor != null) {
      try { fsImpl.closeSync(descriptor) } catch (_) {}
    }
    try { fsImpl.unlinkSync(tempPath) } catch (_) {}
    throw error
  }
}

function createDocumentRepository({ fsImpl = fs, identityOptions = {} } = {}) {
  function describe(filePath) {
    return describeDocumentIdentity(filePath, {
      ...identityOptions,
      realpath: identityOptions.realpath || fsImpl.realpathSync.native,
      stat: identityOptions.stat || fsImpl.statSync,
    })
  }

  function read(identity) {
    const current = describe(identity?.filePath)
    if (!current.ok) return current
    if (!sameCanonicalKey(identity?.canonicalDocumentKey, current.canonicalDocumentKey)) {
      return { ok: false, reason: 'identity-mismatch' }
    }
    if (current.signature.size > MAX_DOCUMENT_TEXT_BYTES) return { ok: false, reason: 'file-too-large' }
    try {
      return { ok: true, text: fsImpl.readFileSync(current.filePath, 'utf8'), signature: current.signature }
    } catch (_) {
      return { ok: false, reason: 'read-failed' }
    }
  }

  function write(identity, text) {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_DOCUMENT_TEXT_BYTES) {
      return { ok: false, reason: 'invalid-content' }
    }
    const current = describe(identity?.filePath)
    if (!current.ok) return current
    if (!sameCanonicalKey(identity?.canonicalDocumentKey, current.canonicalDocumentKey)) {
      return { ok: false, reason: 'identity-mismatch' }
    }
    if (!sameSignature(identity?.signature, current.signature)) return { ok: false, reason: 'conflict' }
    try {
      atomicWrite(current.filePath, text, fsImpl)
      const updated = describe(current.filePath)
      return updated.ok ? { ok: true, signature: updated.signature } : { ok: false, reason: 'write-failed' }
    } catch (_) {
      return { ok: false, reason: 'write-failed' }
    }
  }

  return { describe, read, write }
}

module.exports = { createDocumentRepository, MAX_DOCUMENT_TEXT_BYTES }
