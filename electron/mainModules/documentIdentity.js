'use strict'

const fs = require('fs')
const path = require('path')

function normalizedPath(value, { pathImpl = path, platform = process.platform } = {}) {
  const resolved = pathImpl.resolve(String(value || ''))
  const normalized = pathImpl.normalize(resolved)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

function lexicalDocumentKey(filePath, options) {
  return `lexical:${normalizedPath(filePath, options)}`
}

function canonicalDocumentKey(realPath, options) {
  return `file:${normalizedPath(realPath, options)}`
}

function toSignature(stat) {
  if (!stat || typeof stat !== 'object') return null
  const mtimeMs = Number(stat.mtimeMs)
  const size = Number(stat.size)
  if (!Number.isFinite(mtimeMs) || !Number.isFinite(size) || size < 0) return null
  return {
    mtimeMs,
    size,
    ino: Number.isSafeInteger(stat.ino) ? stat.ino : 0,
  }
}

/**
 * Resolves the file system identity that renderer document state uses as its
 * only key. The path and signature are main-process facts, never user input.
 */
function describeDocumentIdentity(filePath, {
  realpath = fs.realpathSync.native,
  stat = fs.statSync,
  pathImpl = path,
  platform = process.platform,
} = {}) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
    return { ok: false, reason: 'invalid-file-path' }
  }
  const lexicalPath = pathImpl.resolve(filePath)
  let realPath
  let fileStat
  try {
    realPath = realpath(lexicalPath)
    fileStat = stat(realPath)
  } catch (_) {
    return { ok: false, reason: 'not-found', filePath: lexicalPath }
  }
  if (!fileStat?.isFile?.()) return { ok: false, reason: 'not-a-file', filePath: realPath }
  const signature = toSignature(fileStat)
  if (!signature) return { ok: false, reason: 'invalid-file-stat', filePath: realPath }
  return {
    ok: true,
    filePath: realPath,
    lexicalDocumentKey: lexicalDocumentKey(lexicalPath, { pathImpl, platform }),
    canonicalDocumentKey: canonicalDocumentKey(realPath, { pathImpl, platform }),
    signature,
  }
}

module.exports = {
  describeDocumentIdentity,
  canonicalDocumentKey,
  lexicalDocumentKey,
  toSignature,
}
