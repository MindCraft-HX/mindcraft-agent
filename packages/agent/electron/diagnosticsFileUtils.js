const fs = require('fs')
const path = require('path')

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

function ensureDirSync(dirPath) {
  if (!dirPath) return
  fs.mkdirSync(dirPath, { recursive: true })
}

function trimTextToMaxBytes(value, maxBytes = DEFAULT_MAX_BYTES, options = {}) {
  const text = String(value == null ? '' : value)
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= maxBytes) return { text, truncated: false, originalBytes: bytes }

  const marker = String(options.marker || '\n[truncated]\n')
  const markerBytes = Buffer.byteLength(marker, 'utf8')
  const budget = Math.max(0, maxBytes - markerBytes)
  const buf = Buffer.from(text, 'utf8')
  const truncatedBuf = buf.subarray(0, budget)
  return {
    text: truncatedBuf.toString('utf8') + marker,
    truncated: true,
    originalBytes: bytes,
  }
}

function rotateLogFileIfTooLarge(filePath, maxBytes = DEFAULT_MAX_BYTES) {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size < maxBytes) return false
    const rotated = `${filePath}.1`
    try { fs.rmSync(rotated, { force: true }) } catch (_) {}
    try { fs.renameSync(filePath, rotated) } catch (_) {
      try { fs.copyFileSync(filePath, rotated) } catch (_) {}
      try { fs.writeFileSync(filePath, '', 'utf8') } catch (_) {}
      return true
    }
    return true
  } catch (_) {
    return false
  }
}

function appendLogLineWithRotation(filePath, line, options = {}) {
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : DEFAULT_MAX_BYTES
  ensureDirSync(path.dirname(filePath))
  rotateLogFileIfTooLarge(filePath, maxBytes)

  const normalizedLine = String(line == null ? '' : line)
  const prepared = trimTextToMaxBytes(normalizedLine, maxBytes, { marker: '\n[log-line-truncated]\n' })
  fs.appendFileSync(filePath, prepared.text, 'utf8')
}

function writeFileWithMaxBytes(filePath, content, options = {}) {
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : DEFAULT_MAX_BYTES
  ensureDirSync(path.dirname(filePath))
  const prepared = trimTextToMaxBytes(content, maxBytes, { marker: '\n[file-truncated]\n' })
  fs.writeFileSync(filePath, prepared.text, 'utf8')
  return {
    filePath,
    truncated: prepared.truncated,
    originalBytes: prepared.originalBytes,
    writtenBytes: Buffer.byteLength(prepared.text, 'utf8'),
  }
}

module.exports = {
  DEFAULT_MAX_BYTES,
  appendLogLineWithRotation,
  ensureDirSync,
  rotateLogFileIfTooLarge,
  trimTextToMaxBytes,
  writeFileWithMaxBytes,
}
