const fs = require('fs')
const path = require('path')

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml'])
const MAX_FILE_SIZE = 256 * 1024       // 256KB per file
const MAX_TOTAL_SIZE = 1024 * 1024     // 1MB total

const STATUS = {
  OK: '',
  MISSING_PATH: 'missing_path',
  UNSUPPORTED_EXTENSION: 'unsupported_extension',
  FILE_NOT_FOUND: 'file_not_found',
  NOT_A_FILE: 'not_a_file',
  FILE_TOO_LARGE: 'file_too_large',
  TOTAL_SIZE_EXCEEDED: 'total_size_exceeded',
  READ_FAILED: 'read_failed',
}

/**
 * Resolve session instruction attachments — validate and read file contents.
 * @param {Array<{path:string, name?:string, enabled?:boolean}>} attachments
 * @returns {Array} cloned attachments with `.content` (UTF-8 string) or `.error` (status key)
 */
function resolveAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return []
  const resolved = []
  let totalSize = 0

  for (const att of attachments) {
    if (!att?.enabled) continue

    const entry = { ...att, content: '', error: '' }

    if (!att.path || typeof att.path !== 'string') {
      entry.error = STATUS.MISSING_PATH
      resolved.push(entry)
      continue
    }

    // --- extension whitelist ---
    const ext = path.extname(att.path).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      entry.error = STATUS.UNSUPPORTED_EXTENSION
      resolved.push(entry)
      continue
    }

    // --- existence & type ---
    let stat
    try {
      stat = fs.statSync(att.path)
    } catch (_) {
      entry.error = STATUS.FILE_NOT_FOUND
      resolved.push(entry)
      continue
    }
    if (!stat.isFile()) {
      entry.error = STATUS.NOT_A_FILE
      resolved.push(entry)
      continue
    }

    // --- size caps ---
    if (stat.size > MAX_FILE_SIZE) {
      entry.error = STATUS.FILE_TOO_LARGE
      resolved.push(entry)
      continue
    }
    if (totalSize + stat.size > MAX_TOTAL_SIZE) {
      entry.error = STATUS.TOTAL_SIZE_EXCEEDED
      resolved.push(entry)
      continue
    }

    // --- read ---
    try {
      entry.content = fs.readFileSync(att.path, 'utf8')
      totalSize += stat.size
    } catch (_) {
      entry.error = STATUS.READ_FAILED
    }

    resolved.push(entry)
  }

  return resolved
}

/**
 * Serialise one resolved attachment into prompt block.
 * Returns empty string when attachment has no content.
 */
function formatAttachmentBlock(att) {
  if (!att || att.error || !att.content) return ''
  const displayName = att.name || path.basename(att.path || '')
  return [
    `<mindcraft_session_attachment path="${att.path || ''}" name="${displayName}">`,
    att.content,
    '</mindcraft_session_attachment>',
  ].join('\n')
}

/**
 * Build the full session instruction prompt block (instruction text + all attachment contents).
 * Called from the query-building path for both Claude and CodeX.
 *
 * @param {{ enabled:boolean, content:string, attachments:Array }} instruction
 * @returns {Promise<string>} empty string if disabled or nothing to inject
 */
async function buildFullInstructionPrompt(instruction = {}) {
  if (!instruction?.enabled) return ''

  const content = typeof instruction.content === 'string' ? instruction.content.trim() : ''
  const attachments = Array.isArray(instruction.attachments) ? instruction.attachments : []

  if (!content && !attachments.length) return ''

  const parts = ['<mindcraft_session_instruction>']

  if (content) parts.push(content)

  if (attachments.length) {
    const resolved = resolveAttachments(attachments)
    for (const att of resolved) {
      const block = formatAttachmentBlock(att)
      if (block) parts.push('', block)
    }
  }

  parts.push('</mindcraft_session_instruction>')
  return parts.join('\n')
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  STATUS,
  resolveAttachments,
  formatAttachmentBlock,
  buildFullInstructionPrompt,
}
