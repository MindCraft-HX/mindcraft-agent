export function hasRenderableMessages(chat = {}) {
  return Array.isArray(chat?.messages) && chat.messages.length > 0
}

export function shouldPreserveInMemoryHistory(chat = {}, { hasIncomingDiskMessages = true } = {}) {
  if (!chat) return false
  if (!hasIncomingDiskMessages) return false
  if (!hasRenderableMessages(chat)) return false
  return Boolean(chat.thinking || chat._awaitingDone)
}

export function canHydrateChatFromDisk(chat = {}, options = {}) {
  return !shouldPreserveInMemoryHistory(chat, options)
}

export function shouldResetMessagesForDiskReload(chat = {}, options = {}) {
  return canHydrateChatFromDisk(chat, options)
}
