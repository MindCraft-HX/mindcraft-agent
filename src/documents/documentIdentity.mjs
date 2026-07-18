const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function safeString(value, limit = 4096) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && !UNSAFE_KEYS.has(value)
}

export function normalizeDocumentIdentity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.ok === false) return null
  if (!safeString(raw.filePath) || !safeString(raw.canonicalDocumentKey) || !safeString(raw.lexicalDocumentKey)) return null
  const signature = raw.signature
  if (!signature || !Number.isFinite(signature.mtimeMs) || !Number.isFinite(signature.size) || signature.size < 0) return null
  return {
    filePath: raw.filePath,
    canonicalDocumentKey: raw.canonicalDocumentKey,
    lexicalDocumentKey: raw.lexicalDocumentKey,
    signature: {
      mtimeMs: signature.mtimeMs,
      size: signature.size,
      ino: Number.isSafeInteger(signature.ino) ? signature.ino : 0,
    },
  }
}

export function createDocumentItemId(canonicalDocumentKey) {
  if (!safeString(canonicalDocumentKey)) return ''
  // A stable opaque id keeps a Teleport/Vue key unchanged after the item opens.
  return `document:${encodeURIComponent(canonicalDocumentKey)}`
}

export function sameDocumentSignature(left, right) {
  return Boolean(left && right
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
    && left.ino === right.ino)
}
