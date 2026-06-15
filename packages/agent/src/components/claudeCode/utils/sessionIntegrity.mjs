const RECOVERY_NOTICE_TEXT = '上次回复在工具执行阶段中断，已将未完成工具标记为中断。可以在当前会话继续发送。'
const INTERRUPTED_TOOL_ERROR = '工具调用在上次会话中断时未返回结果。'

function normalizeId(id) {
  return String(id || '').trim()
}

function getEntryType(entry) {
  const type = entry?.type || entry?._source_type || entry?.role || ''
  if (type === 'message' && entry?.message?.role) return entry.message.role
  return type
}

function getAssistantContent(entry) {
  if (Array.isArray(entry?.message?.content)) return entry.message.content
  if (Array.isArray(entry?.content)) return entry.content
  return []
}

function getUserContent(entry) {
  if (Array.isArray(entry?.message?.content)) return entry.message.content
  if (Array.isArray(entry?.content)) return entry.content
  return []
}

function rememberToolUse(openToolUses, block) {
  const id = normalizeId(block?.id || block?.tool_use_id || block?.toolUseId)
  if (!id) return null
  const info = {
    id,
    name: block?.name || block?.tool_name || block?.toolName || '',
    input: block?.input || {},
  }
  openToolUses.set(id, info)
  return info
}

function closeToolUse(openToolUses, block) {
  const id = normalizeId(block?.tool_use_id || block?.toolUseId || block?.id)
  if (id) openToolUses.delete(id)
}

export function analyzeClaudeSessionIntegrity(entries = []) {
  const openToolUses = new Map()
  let lastToolUse = null
  let hasResult = false
  let lastEventType = ''

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry) continue
    const entryType = getEntryType(entry)
    if (entryType) lastEventType = entryType

    if (entryType === 'result') {
      hasResult = true
      openToolUses.clear()
      continue
    }

    if (entryType === 'assistant') {
      for (const block of getAssistantContent(entry)) {
        if (block?.type === 'tool_use') {
          const info = rememberToolUse(openToolUses, block)
          if (info) lastToolUse = info
        }
      }
      continue
    }

    if (entryType === 'user' || entryType === 'tool_result') {
      if (entryType === 'tool_result') closeToolUse(openToolUses, entry)
      for (const block of getUserContent(entry)) {
        if (block?.type === 'tool_result') closeToolUse(openToolUses, block)
      }
    }
  }

  const danglingToolUseIds = Array.from(openToolUses.keys())
  const hasDanglingToolUse = danglingToolUseIds.length > 0

  return {
    hasDanglingToolUse,
    danglingToolUseIds,
    lastToolUse: hasDanglingToolUse
      ? openToolUses.get(danglingToolUseIds[danglingToolUseIds.length - 1]) || lastToolUse
      : lastToolUse,
    hasResult,
    lastEventType,
    recommendedDoneReason: hasDanglingToolUse ? 'interrupted' : 'completed',
  }
}

export function markDanglingClaudeToolsInterrupted(messages = [], integrity = {}, {
  nextId = () => Date.now(),
  noticeText = RECOVERY_NOTICE_TEXT,
  toolError = INTERRUPTED_TOOL_ERROR,
} = {}) {
  if (!Array.isArray(messages) || !integrity?.hasDanglingToolUse) return false
  const ids = new Set((integrity.danglingToolUseIds || []).map(normalizeId).filter(Boolean))
  if (!ids.size) return false

  let changed = false
  for (const msg of messages) {
    if (!msg || msg.role !== 'tool') continue
    if (!ids.has(normalizeId(msg.toolUseId))) continue
    if (msg._interruptedToolUse === true && msg.status === 'error') continue
    msg.status = 'error'
    msg.toolError = msg.toolError || toolError
    msg._interruptedToolUse = true
    msg.expanded = true
    changed = true
  }

  if (changed && !messages.some(msg => msg?._isDanglingToolRecoveryNotice)) {
    messages.push({
      id: nextId(),
      role: 'system',
      text: noticeText,
      _isDanglingToolRecoveryNotice: true,
    })
  }

  return changed
}

export function getDanglingToolRecoveryNoticeText() {
  return RECOVERY_NOTICE_TEXT
}
