function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n\n')
}

function extractTextFromInvokedSkills(attachment) {
  const skills = Array.isArray(attachment?.skills) ? attachment.skills : []
  return skills
    .map(skill => typeof skill?.content === 'string' ? skill.content : '')
    .filter(Boolean)
    .join('\n\n')
}

export function isClaudeInternalPromptText(text) {
  const normalized = normalizeText(text)
  if (!normalized) return false

  if (/^Review target:\s*`/m.test(normalized) && normalized.includes('## Phase 0')) {
    return true
  }

  if (/^`\/(?:code-review|review|simplify)\b/m.test(normalized) && normalized.includes('## Phase 0')) {
    return true
  }

  return normalized.includes('git diff @{upstream}...HEAD')
    && (normalized.includes('You are reviewing for **recall**')
      || normalized.includes('Wait for all four agents to complete'))
}

export function isClaudeMetaUserEntry(entry) {
  if (!entry) return false
  const isMeta = entry.isMeta === true || entry._isMeta === true
  const role = entry.message?.role || entry.role || entry._source_type || entry.type || ''
  if (isMeta && role === 'user') return true

  if (role === 'attachment' && entry.attachment?.type === 'invoked_skills') {
    return isClaudeInternalPromptText(extractTextFromInvokedSkills(entry.attachment))
  }

  return false
}

export function isClaudeMetaUserPromptMessage(message) {
  if (!message || message.role !== 'user') return false
  if (message._isMeta === true) return true
  if (message._attachment?.type === 'invoked_skills') {
    return isClaudeInternalPromptText(extractTextFromInvokedSkills(message._attachment))
  }
  return isClaudeInternalPromptText(
    normalizeText(message.text) || extractTextFromContent(message.content),
  )
}

export function isVisibleClaudeUserMessage(message) {
  if (!message || message.role !== 'user') return false
  return !isClaudeMetaUserPromptMessage(message)
}

export function countVisibleClaudeUserMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter(isVisibleClaudeUserMessage).length
}

export function findFirstVisibleClaudeUserMessage(messages) {
  return (Array.isArray(messages) ? messages : []).find(isVisibleClaudeUserMessage) || null
}
