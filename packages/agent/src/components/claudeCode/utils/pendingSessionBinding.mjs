function toTimestamp(value) {
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) return n
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

export function isPendingClaudeSessionBinding(chat) {
  if (!chat || chat.cliSessionId || chat.filePath) return false
  if (chat._pendingSessionBinding) return true
  if (typeof chat.sessionId !== 'string' || !chat.sessionId.startsWith('session-chat-')) return false
  const messages = Array.isArray(chat.messages) ? chat.messages : []
  return messages.some(message => message?.role === 'user')
}

export function shouldDeferClaudeSessionMessageTitle(chat) {
  return isPendingClaudeSessionBinding(chat)
}

export function hasUnboundClaudeSessionPendingAdoption(chats = []) {
  return (Array.isArray(chats) ? chats : []).some(isPendingClaudeSessionBinding)
}

export function findPendingClaudeSessionForAdoption(chats = [], { activeChatId = '', scannedSessionId = '' } = {}) {
  const pendingChats = (Array.isArray(chats) ? chats : []).filter(isPendingClaudeSessionBinding)
  if (!pendingChats.length) return null

  // 优先精确匹配：主进程在流式首条消息时推送 cliSessionId，
  // 渲染侧在收到通知后将 UUID 写入 _expectedCliSessionId。
  // 扫描器拿到 JSONL 文件名中的 UUID (scannedSessionId)，直接匹配即可确定归属。
  if (scannedSessionId) {
    const exact = pendingChats.find(chat => chat._expectedCliSessionId === scannedSessionId)
    if (exact) return exact
  }

  const activePending = activeChatId
    ? pendingChats.find(chat => chat?.id === activeChatId) || null
    : null
  if (activePending) return activePending

  return pendingChats
    .slice()
    .sort((a, b) => toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt))[0] || null
}

export function adoptScannedClaudeSession(pendingChat, scannedSession, resolvedName) {
  if (!pendingChat || !scannedSession) return false

  pendingChat.cliSessionId = scannedSession.id || pendingChat.cliSessionId || null
  pendingChat.filePath = scannedSession.filePath || pendingChat.filePath || ''
  pendingChat.createdAt = scannedSession.createdAt || pendingChat.createdAt || null
  pendingChat.updatedAt = scannedSession.updatedAt || pendingChat.updatedAt || null
  pendingChat.fileSize = scannedSession.fileSize ?? pendingChat.fileSize ?? null
  pendingChat._pendingSessionBinding = false
  // 领养后标记消息需从磁盘重新加载：中断恢复后内存中的部分消息不可靠
  pendingChat._messagesLoaded = false

  if (!pendingChat._userRenamed && resolvedName) {
    pendingChat.name = resolvedName
  }

  if (scannedSession.isCustomTitle) {
    pendingChat._userRenamed = true
  }

  return true
}
