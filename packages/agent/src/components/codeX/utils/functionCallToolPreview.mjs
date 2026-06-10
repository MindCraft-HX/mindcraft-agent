import {
  isCodeXEditToolName,
  isCodeXReadToolName,
  isCodeXWriteToolName,
} from './toolNameMatchers.mjs'

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
  }
  return ''
}

export function buildFunctionCallToolState({
  toolName,
  args = {},
  isWriteTool = () => false,
  isEditTool = () => false,
  isBashTool = () => false,
  isReadTool = () => false,
} = {}) {
  const normalizedToolName = String(toolName || '')
  const isWrite = isWriteTool(normalizedToolName) || isCodeXWriteToolName(normalizedToolName)
  const isEdit = isEditTool(normalizedToolName) || isCodeXEditToolName(normalizedToolName)
  const isBash = isBashTool(normalizedToolName)
  const isRead = isReadTool(normalizedToolName) || isCodeXReadToolName(normalizedToolName)

  const filePath = pickFirstString(args.path, args.file_path, args.filename)
  const bashCmd = isBash ? pickFirstString(args.command, args.cmd) : ''
  const readContent = isRead ? pickFirstString(args.content, args.file_content, args.output) : ''

  const newContent = isWrite
    ? pickFirstString(args.content, args.new_content, args.file_content, args.new_string, args.new_str)
    : isEdit
      ? pickFirstString(args.new_string, args.new_str, args.new_content, args.content)
      : ''

  const oldStr = isWrite
    ? pickFirstString(args.old_string, args.old_str, args.old_content, args._oldContent)
    : isEdit
      ? pickFirstString(args.old_string, args.old_str, args.old_content)
      : ''

  const newStr = isWrite || isEdit ? newContent : ''

  return {
    filePath,
    bashCmd,
    readContent,
    newContent,
    diffLines: [],
    _diffInput: (isWrite || isEdit)
      ? {
          oldStr,
          newStr,
        }
      : null,
  }
}
