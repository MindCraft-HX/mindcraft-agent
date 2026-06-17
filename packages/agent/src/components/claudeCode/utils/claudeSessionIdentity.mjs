export function normalizeClaudeSessionPath(value) {
  return typeof value === 'string' ? value.replace(/\\/g, '/') : ''
}

export function getClaudeChatKey(chat) {
  return typeof chat?.sessionId === 'string' ? chat.sessionId : ''
}

export function getClaudeCliSessionId(chat) {
  return typeof chat?.cliSessionId === 'string' ? chat.cliSessionId.trim() : ''
}

export function getClaudeSessionFilePath(chat) {
  return normalizeClaudeSessionPath(chat?.filePath)
}

export function isBoundClaudeChat(chat) {
  return Boolean(getClaudeCliSessionId(chat) || getClaudeSessionFilePath(chat))
}

export function isDraftClaudeChat(chat) {
  return Boolean(chat && getClaudeChatKey(chat) && !isBoundClaudeChat(chat))
}

export function hasClaudeUserMessage(chat) {
  const messages = Array.isArray(chat?.messages) ? chat.messages : []
  return messages.some(message => message?.role === 'user')
}

export function isPendingClaudeSessionBindingCandidate(chat) {
  if (!chat || isBoundClaudeChat(chat)) return false
  if (chat._pendingSessionBinding) return true

  // Legacy restored chats may only have the generated renderer key and a user
  // message; keep that adoption path until the persisted field is renamed.
  const chatKey = getClaudeChatKey(chat)
  if (!chatKey.startsWith('session-chat-')) return false
  return hasClaudeUserMessage(chat)
}

export function getClaudeChatBindingKey(chat) {
  const cliSessionId = getClaudeCliSessionId(chat)
  if (cliSessionId) return `sid:${cliSessionId}`

  const filePath = getClaudeSessionFilePath(chat)
  return filePath ? `path:${filePath.toLowerCase()}` : ''
}

export function usesLegacyCliSessionAsChatKey(chat) {
  const chatKey = getClaudeChatKey(chat)
  const cliSessionId = getClaudeCliSessionId(chat)
  return Boolean(chatKey && cliSessionId && chatKey === cliSessionId)
}
