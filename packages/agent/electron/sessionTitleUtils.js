const fs = require('fs')

function safeParseJson(line) {
  if (!line || !line.trim()) return null
  try {
    return JSON.parse(line)
  } catch (_) {
    return null
  }
}

function readHeadLines(filePath, maxBytes = 64 * 1024) {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const stat = fs.fstatSync(fd)
      const size = Math.min(maxBytes, stat.size || 0)
      if (!size) return []
      const buffer = Buffer.alloc(size)
      fs.readSync(fd, buffer, 0, size, 0)
      return buffer.toString('utf8').split('\n')
    } finally {
      fs.closeSync(fd)
    }
  } catch (_) {
    return []
  }
}

function readTailLines(filePath, maxBytes = 64 * 1024) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.size) return []
    const size = Math.min(maxBytes, stat.size)
    const start = Math.max(0, stat.size - size)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(size)
      fs.readSync(fd, buffer, 0, size, start)
      const text = buffer.toString('utf8')
      const firstNewline = text.indexOf('\n')
      const chunk = firstNewline >= 0 ? text.slice(firstNewline + 1) : text
      return chunk.split('\n')
    } finally {
      fs.closeSync(fd)
    }
  } catch (_) {
    return []
  }
}

function clipTitle(value, maxLen = 35) {
  return String(value || '').trim().slice(0, maxLen)
}

function extractClaudeHeadCandidate(entry, ideFallbackRef) {
  if (!entry) return ''
  if (entry.type === 'queue-operation' && entry.content && !ideFallbackRef.value) {
    ideFallbackRef.value = clipTitle(entry.content)
  }
  if (entry.type !== 'user' || !entry.message) return ''
  const content = entry.message.content
  if (typeof content === 'string' && content.trim()) {
    return clipTitle(content)
  }
  if (!Array.isArray(content)) return ''
  const nonIdeText = content
    .filter(c => c && c.type === 'text' && c.text && !String(c.text).trim().startsWith('<ide_'))
    .map(c => String(c.text).trim())
    .join('\n')
    .trim()
  if (nonIdeText) return clipTitle(nonIdeText)
  if (!ideFallbackRef.value) {
    const firstIde = content.find(c => c && c.type === 'text' && c.text && String(c.text).trim().startsWith('<ide_'))
    if (firstIde) ideFallbackRef.value = clipTitle(firstIde.text)
  }
  return ''
}

function extractCodexHeadCandidate(entry) {
  if (!entry) return { meta: null, firstUserText: '', lastAgentText: '' }
  if (entry.type === 'session_meta' && entry.payload) return { meta: entry.payload, firstUserText: '', lastAgentText: '' }
  if (entry.type === 'event_msg' && entry.payload?.type === 'user_message') {
    return { meta: null, firstUserText: String(entry.payload.message || ''), lastAgentText: '' }
  }
  if (entry.type === 'event_msg' && entry.payload?.type === 'agent_message') {
    return { meta: null, firstUserText: '', lastAgentText: String(entry.payload.message || '') }
  }
  return { meta: null, firstUserText: '', lastAgentText: '' }
}

function findCustomTitleInLines(lines) {
  for (const line of lines) {
    const entry = safeParseJson(line)
    if (entry && entry.type === 'custom-title' && entry.customTitle) {
      return clipTitle(entry.customTitle)
    }
  }
  return ''
}

function extractClaudeSessionTitle(filePath) {
  const ideFallbackRef = { value: '' }
  let headTitle = ''
  const headLines = readHeadLines(filePath)
  for (const line of headLines) {
    const entry = safeParseJson(line)
    if (!entry) continue
    if (entry.type === 'custom-title' && entry.customTitle) {
      return { title: clipTitle(entry.customTitle), isCustomTitle: true }
    }
    if (!headTitle) {
      headTitle = extractClaudeHeadCandidate(entry, ideFallbackRef)
    } else {
      extractClaudeHeadCandidate(entry, ideFallbackRef)
    }
  }
  const customTitle = findCustomTitleInLines(readTailLines(filePath))
  if (customTitle) return { title: customTitle, isCustomTitle: true }
  return { title: headTitle || ideFallbackRef.value || '', isCustomTitle: false }
}

function extractCodexSessionSummary(filePath, collectSessionTailRiskSummary) {
  let meta = null
  let model = ''
  let reasoningEffort = ''
  let firstUserText = ''
  let lastAgentText = ''
  let headCustomTitle = ''
  const headLines = readHeadLines(filePath, 80 * 1024)
  for (const line of headLines) {
    const row = safeParseJson(line)
    if (!row) continue
    if (row.type === 'custom-title' && row.customTitle && !headCustomTitle) headCustomTitle = clipTitle(row.customTitle)
    const parsed = extractCodexHeadCandidate(row)
    if (parsed.meta && !meta) meta = parsed.meta
    const payload = row.payload || {}
    if ((row.type === 'session_meta' || row.type === 'turn_context') && payload) {
      if (!model && payload.model) model = String(payload.model || '').trim()
      if (!reasoningEffort) {
        reasoningEffort = String(payload.model_reasoning_effort || payload.reasoning_effort || payload.reason_effort || '').trim()
      }
    }
    if (parsed.firstUserText && !firstUserText) firstUserText = parsed.firstUserText
    if (parsed.lastAgentText) lastAgentText = parsed.lastAgentText
  }
  const customTitle = headCustomTitle || findCustomTitleInLines(readTailLines(filePath))
  if (!meta?.id || !meta?.cwd) return null
  const stat = fs.statSync(filePath)
  return {
    id: meta.id,
    sessionId: meta.id,
    cliSessionId: meta.id,
    cwd: meta.cwd,
    name: customTitle || firstUserText || lastAgentText || `session ${meta.id.slice(0, 8)}`,
    _isCustomTitle: Boolean(customTitle),
    createdAt: meta.timestamp || stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    fileSize: stat.size,
    filePath,
    model,
    reasoningEffort,
    historyLoadGuard: collectSessionTailRiskSummary(filePath),
  }
}

module.exports = {
  extractClaudeSessionTitle,
  extractCodexSessionSummary,
  findCustomTitleInLines,
}
