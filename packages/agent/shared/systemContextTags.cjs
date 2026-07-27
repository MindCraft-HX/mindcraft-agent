'use strict'

const DELIMITED_SYSTEM_TAG_PATTERN = /<([a-zA-Z][\w-]*(?:[_-])[\w-]*)\b[^>]*>[\s\S]*?<\/\1>/g
const UPPERCASE_SYSTEM_TAG_PATTERN = /<([A-Z][A-Z_]{4,})\b[^>]*>[\s\S]*?<\/\1>/g
const INSTRUCTION_MARKER_PATTERN = /^\s{0,3}#{0,6}\s*[A-Z]+\.md instructions for .+$/gim

function stripSystemContextTags(text, options = {}) {
  if (!text || typeof text !== 'string') return ''

  const selectedTags = Array.isArray(options.tags)
    ? new Set(options.tags.map(tag => String(tag || '').toLowerCase()).filter(Boolean))
    : null
  const shouldStrip = tag => !selectedTags || selectedTags.has(String(tag || '').toLowerCase())

  let result = text.replace(
    DELIMITED_SYSTEM_TAG_PATTERN,
    (block, tag) => shouldStrip(tag) ? '' : block
  )
  result = result.replace(
    UPPERCASE_SYSTEM_TAG_PATTERN,
    (block, tag) => shouldStrip(tag) ? '' : block
  )
  if (!selectedTags) result = result.replace(INSTRUCTION_MARKER_PATTERN, '')

  return result.trim()
}

module.exports = {
  DELIMITED_SYSTEM_TAG_PATTERN,
  UPPERCASE_SYSTEM_TAG_PATTERN,
  INSTRUCTION_MARKER_PATTERN,
  stripSystemContextTags,
}
