import { stripSystemContextTags } from '../../agentCommon/utils/helpers.js'

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasVisibleAttachment(content) {
  return Array.isArray(content) && content.some(block =>
    (block?.type === 'image' && block.source)
    || (block?.type === 'file' && block.source)
    || (block?.type === 'input_image' && block.image_url)
    || (block?.type === 'input_file' && block.file_url)
  )
}

function hasVisibleTextBlocks(content) {
  return Array.isArray(content) && content.some(block => {
    if (!block) return false
    if (block.type !== 'text' && block.type !== 'input_text' && block.type !== 'output_text') return false
    return Boolean(stripSystemContextTags(block.text || '').trim())
  })
}

export function isVisibleCodexUserMessage(message) {
  if (!message || message.role !== 'user') return false
  const text = normalizeText(message.text)
  if (text && stripSystemContextTags(text).trim()) return true
  if (hasVisibleTextBlocks(message.content)) return true
  return hasVisibleAttachment(message.content)
}

export function countVisibleCodexUserMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter(isVisibleCodexUserMessage).length
}

export function findFirstVisibleCodexUserMessage(messages) {
  return (Array.isArray(messages) ? messages : []).find(isVisibleCodexUserMessage) || null
}
