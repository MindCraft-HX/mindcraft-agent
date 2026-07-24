export function shouldApplyCodexProviderDefaultsToChat(chat = {}, activeChatId = '') {
  if (chat?.thinking || chat?._awaitingDone) return false
  if (activeChatId && chat?.id === activeChatId) return true
  if (chat?.cliSessionId || chat?.filePath) return false
  return !(chat?.messages || []).some(
    message => message?.role === 'user' || message?.role === 'assistant',
  )
}
