const fs = require('fs')
const path = require('path')
const { getMindCraftUserDataDir } = require('./userDataPath')
const { getDiagnosticsEnabled: facadeGet, setDiagnosticsEnabled: facadeSet } = require('./settingsFacade');

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_DIAGNOSTICS_ENABLED = false
const APP_SETTINGS_FILE = 'app-settings.json'

function getMindCraftSettingsPath(options = {}) {
  return path.join(getMindCraftUserDataDir(options), APP_SETTINGS_FILE)
}

function readMindCraftSettings(options = {}) {
  try {
    const settingsPath = getMindCraftSettingsPath(options)
    if (!fs.existsSync(settingsPath)) return {}
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch (_) {
    return {}
  }
}

function writeMindCraftSettings(settings, options = {}) {
  const settingsPath = getMindCraftSettingsPath(options)
  ensureDirSync(path.dirname(settingsPath))
  const tmp = `${settingsPath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(settings || {}, null, 2), 'utf8')
  try {
    fs.renameSync(tmp, settingsPath)
  } catch (_) {
    fs.copyFileSync(tmp, settingsPath)
    try { fs.unlinkSync(tmp) } catch (_) {}
  }
  return settingsPath
}

function getDiagnosticsEnabled(options = {}) {
  // T198: routed through settingsFacade
  return facadeGet();
}

function setDiagnosticsEnabled(enabled, options = {}) {
  // T198: routed through settingsFacade
  facadeSet(Boolean(enabled));
  return { ok: true, enabled: Boolean(enabled) };
}

function shouldWriteDiagnostics(options = {}) {
  if (options.respectDiagnosticsToggle !== true) return true
  return getDiagnosticsEnabled(options)
}

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
  if (!shouldWriteDiagnostics(options)) return
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : DEFAULT_MAX_BYTES
  ensureDirSync(path.dirname(filePath))
  rotateLogFileIfTooLarge(filePath, maxBytes)

  const normalizedLine = String(line == null ? '' : line)
  const prepared = trimTextToMaxBytes(normalizedLine, maxBytes, { marker: '\n[log-line-truncated]\n' })
  fs.appendFileSync(filePath, prepared.text, 'utf8')
}

function writeFileWithMaxBytes(filePath, content, options = {}) {
  if (!shouldWriteDiagnostics(options)) {
    return {
      filePath,
      truncated: false,
      originalBytes: 0,
      writtenBytes: 0,
      skipped: true,
    }
  }
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
  getDiagnosticsEnabled,
  getMindCraftSettingsPath,
  readMindCraftSettings,
  rotateLogFileIfTooLarge,
  setDiagnosticsEnabled,
  shouldWriteDiagnostics,
  trimTextToMaxBytes,
  writeFileWithMaxBytes,
  writeMindCraftSettings,
}
