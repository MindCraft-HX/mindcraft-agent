const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getMindCraftUserDataDir } = require('../userDataPath')

const MAX_DIAGNOSTIC_DIRS = 20
const DEFAULT_PREVIEW_CHARS = 240

function getDiagnosticsRoot(options = {}) {
  return path.join(getMindCraftUserDataDir(options), 'diagnostics')
}

function getCodexTurnDiagnosticsDir(options = {}) {
  return path.join(getDiagnosticsRoot(options), 'codex-turns')
}

function getCodexTurnDiagnosticsLogFile(options = {}) {
  return path.join(getDiagnosticsRoot(options), 'codex-turn-diagnostics.log')
}

function ensureDirSync(dirPath) {
  if (!dirPath) return
  fs.mkdirSync(dirPath, { recursive: true })
}

function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'artifact'
}

function makeCodexTurnDiagnosticId(prefix = 'turn') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const rand = crypto.randomBytes(4).toString('hex')
  return `${sanitizeFileName(prefix)}-${ts}-${rand}`
}

function pruneOldDiagnosticDirs(rootDir, keep = MAX_DIAGNOSTIC_DIRS) {
  try {
    if (!fs.existsSync(rootDir)) return
    const dirs = fs.readdirSync(rootDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        fullPath: path.join(rootDir, entry.name),
        mtimeMs: fs.statSync(path.join(rootDir, entry.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const stale of dirs.slice(keep)) {
      fs.rmSync(stale.fullPath, { recursive: true, force: true })
    }
  } catch (_) {}
}

function ensureDiagnosticBucket(diagnosticId, options = {}) {
  const rootDir = getCodexTurnDiagnosticsDir(options)
  ensureDirSync(rootDir)
  pruneOldDiagnosticDirs(rootDir)
  const bucketDir = path.join(rootDir, sanitizeFileName(diagnosticId))
  ensureDirSync(bucketDir)
  return bucketDir
}

function appendCodexTurnDiagnostic(entry = {}, options = {}) {
  try {
    const logFile = getCodexTurnDiagnosticsLogFile(options)
    ensureDirSync(path.dirname(logFile))
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + '\n'
    fs.appendFileSync(logFile, line, 'utf8')
  } catch (_) {}
}

function writeCodexTurnDiagnosticArtifact(diagnosticId, name, value, options = {}) {
  try {
    const bucketDir = ensureDiagnosticBucket(diagnosticId, options)
    const ext = String(options.ext || inferArtifactExt(options.kind)).replace(/^\.+/, '')
    const fileName = `${sanitizeFileName(name)}.${ext}`
    const filePath = path.join(bucketDir, fileName)
    const body = options.kind === 'json'
      ? JSON.stringify(value, null, 2)
      : String(value == null ? '' : value)
    fs.writeFileSync(filePath, body, 'utf8')
    return filePath
  } catch (_) {
    return ''
  }
}

function inferArtifactExt(kind = '') {
  if (kind === 'json') return 'json'
  if (kind === 'sse') return 'sse.txt'
  return 'txt'
}

function previewText(value, maxChars = DEFAULT_PREVIEW_CHARS) {
  const text = String(value == null ? '' : value)
  if (!text) return ''
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

function contentLength(value) {
  if (typeof value === 'string') return value.length
  if (value == null) return 0
  try { return JSON.stringify(value).length } catch (_) { return String(value).length }
}

function summarizeUsage(usage = null) {
  if (!usage || typeof usage !== 'object') return null
  return {
    inputTokens: numberOrNull(usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: numberOrNull(usage.output_tokens ?? usage.completion_tokens),
    cachedInputTokens: numberOrNull(usage.cached_input_tokens),
    cacheCreationInputTokens: numberOrNull(usage.cache_creation_input_tokens),
    totalTokens: numberOrNull(usage.total_tokens),
    reasoningTokens: numberOrNull(usage.completion_tokens_details?.reasoning_tokens),
  }
}

function summarizeResponsesInputItems(input = []) {
  const items = Array.isArray(input) ? input : []
  return {
    count: items.length,
    items: items.map((item, index) => ({
      index,
      type: String(item?.type || ''),
      role: String(item?.role || ''),
      contentLength: contentLength(item?.content),
      hasReasoning: Boolean(item?.reasoning_content || (Array.isArray(item?.summary) && item.summary.length)),
      hasOutput: item?.output !== undefined,
      hasToolName: Boolean(item?.name),
      callId: String(item?.call_id || ''),
      contentPreview: previewText(
        typeof item?.content === 'string'
          ? item.content
          : item?.text || item?.output || '',
        DEFAULT_PREVIEW_CHARS
      ),
    })),
  }
}

function summarizeChatMessages(messages = []) {
  const list = Array.isArray(messages) ? messages : []
  return {
    count: list.length,
    messages: list.map((message, index) => ({
      index,
      role: String(message?.role || ''),
      contentLength: contentLength(message?.content),
      hasToolCalls: Array.isArray(message?.tool_calls) && message.tool_calls.length > 0,
      hasReasoning: Boolean(message?.reasoning_content),
      toolCallIds: Array.isArray(message?.tool_calls)
        ? message.tool_calls.map(toolCall => String(toolCall?.id || '')).filter(Boolean)
        : [],
      toolCallNames: Array.isArray(message?.tool_calls)
        ? message.tool_calls.map(toolCall => String(toolCall?.function?.name || '')).filter(Boolean)
        : [],
      toolCallId: String(message?.tool_call_id || ''),
      contentPreview: previewText(
        typeof message?.content === 'string'
          ? message.content
          : Array.isArray(message?.content)
            ? message.content.map(part => part?.text || '').join('\n')
            : '',
        DEFAULT_PREVIEW_CHARS
      ),
      reasoningPreview: previewText(message?.reasoning_content || '', DEFAULT_PREVIEW_CHARS),
    })),
  }
}

function summarizeSsePayload(rawText = '') {
  const text = String(rawText || '')
  return {
    charLength: text.length,
    lineCount: text ? text.split('\n').length : 0,
    hasDoneMarker: text.includes('[DONE]'),
    hasFinishReason: text.includes('"finish_reason"'),
    hasStopFinishReason: text.includes('"finish_reason":"stop"') || text.includes('"finish_reason": "stop"'),
    hasErrorField: text.includes('"error"'),
    preview: previewText(text, 800),
  }
}

function summarizeCodexTerminalEvent(ev = {}) {
  const error = ev?.error || ev?.payload?.error || null
  return {
    type: String(ev?.type || ''),
    errorType: String(error?.type || error?.code || ''),
    errorMessage: String(ev?.message || error?.message || error?.detail || ''),
    hasUsage: Boolean(ev?.usage),
    usage: summarizeUsage(ev?.usage),
    payloadKeys: ev?.payload && typeof ev.payload === 'object' ? Object.keys(ev.payload) : [],
    itemId: String(ev?.item?.id || ''),
    finishReason: String(ev?.finish_reason || ev?.payload?.finish_reason || ''),
  }
}

function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

module.exports = {
  appendCodexTurnDiagnostic,
  getCodexTurnDiagnosticsDir,
  getCodexTurnDiagnosticsLogFile,
  makeCodexTurnDiagnosticId,
  summarizeChatMessages,
  summarizeCodexTerminalEvent,
  summarizeResponsesInputItems,
  summarizeSsePayload,
  summarizeUsage,
  writeCodexTurnDiagnosticArtifact,
  __test__: {
    contentLength,
    previewText,
    sanitizeFileName,
  },
}
