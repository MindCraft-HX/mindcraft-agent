const WRITE_TOOL_NAMES = new Set([
  'write',
  'write_file',
  'create_file',
  'writefile',
])

const EDIT_TOOL_NAMES = new Set([
  'edit',
  'edit_file',
  'str_replace',
  'str_replace_editor',
  'str_replace_based_edit',
])

const READ_TOOL_NAMES = new Set([
  'read',
  'read_file',
])

function normalizeToolName(name) {
  return String(name || '').toLowerCase()
}

export function isCodeXWriteToolName(name) {
  return WRITE_TOOL_NAMES.has(normalizeToolName(name))
}

export function isCodeXEditToolName(name) {
  return EDIT_TOOL_NAMES.has(normalizeToolName(name))
}

export function isCodeXReadToolName(name) {
  return READ_TOOL_NAMES.has(normalizeToolName(name))
}

export function isCodeXFileMutationToolName(name) {
  const normalized = normalizeToolName(name)
  return normalized === 'file_change'
    || normalized === 'apply_patch'
    || isCodeXWriteToolName(normalized)
    || isCodeXEditToolName(normalized)
}
