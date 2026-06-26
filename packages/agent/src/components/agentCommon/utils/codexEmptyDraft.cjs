function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasInstructionContent(instruction) {
  if (!instruction || typeof instruction !== 'object') return false
  if (instruction.enabled) return true
  if (normalizeString(instruction.content)) return true
  if (normalizeString(instruction.description)) return true
  if (normalizeString(instruction.title)) return true
  return Array.isArray(instruction.attachments) && instruction.attachments.some(Boolean)
}

function getProviderSessionId(chatLike = {}) {
  return normalizeString(
    chatLike.cliSessionId
      || chatLike.providerSessionId
      || chatLike.provider?.cliSessionId
  )
}

function getProviderFilePath(chatLike = {}) {
  return normalizeString(
    chatLike.filePath
      || chatLike.provider?.filePath
  )
}

function getTitle(chatLike = {}) {
  return normalizeString(chatLike.name || chatLike.title)
}

function hasVisibleUserMessage(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (const message of list) {
    if (!message || message.role !== 'user') continue
    if (normalizeString(message.text)) return true
    if (normalizeString(message.content)) return true
    const blocks = Array.isArray(message.content) ? message.content : []
    for (const block of blocks) {
      if (!block) continue
      if (normalizeString(block.text)) return true
      if (block.source || block.image_url || block.file_url) return true
    }
  }
  return false
}

function isDefaultCodexDraftTitle(title) {
  const normalized = normalizeString(title)
  return normalized === '新对话' || normalized === 'New Chat'
}

function isMeaningfulCodexLocalDraft(chatLike = {}, messages = chatLike.messages) {
  if (getProviderSessionId(chatLike) || getProviderFilePath(chatLike)) return true
  if (!isDefaultCodexDraftTitle(getTitle(chatLike))) return true
  if (normalizeString(chatLike.description)) return true
  if (hasInstructionContent(chatLike.instruction)) return true
  return hasVisibleUserMessage(messages)
}

function isEmptyCodexLocalDraft(chatLike = {}, messages = chatLike.messages) {
  return !isMeaningfulCodexLocalDraft(chatLike, messages)
}

module.exports = {
  hasInstructionContent,
  hasVisibleUserMessage,
  isDefaultCodexDraftTitle,
  isMeaningfulCodexLocalDraft,
  isEmptyCodexLocalDraft,
}
