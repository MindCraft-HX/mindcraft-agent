function isPendingToolMessage(message) {
  if (!message || message.role !== 'tool' || message.status !== 'pending') return false
  return Boolean(
    message.requestId
    || String(message.toolName || '').toLowerCase() === 'askuserquestion'
  )
}

export function shouldReloadClaudeChatFromDisk(chat) {
  if (!chat) return true
  const messages = Array.isArray(chat.messages) ? chat.messages : []
  if (messages.some(isPendingToolMessage)) return false
  return true
}
