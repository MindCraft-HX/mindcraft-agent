'use strict'

/**
 * CodeX UI Event Mapper — CJS version for main process (codexAgent.js history restore)
 *
 * 与 codexUiEventMapper.mjs 保持逻辑一致。
 * 参见：packages/agent/src/components/codeX/utils/codexUiEventMapper.mjs
 */
// ---------------------------------------------------------------------------
// Tool classification
// ---------------------------------------------------------------------------

const ITEM_TYPE_TO_TOOL_CARD = {
  reasoning: 'thinking',
  command_execution: 'shell',
  file_change: 'file_change',
  mcp_tool_call: 'mcp_tool',
  web_search: 'web_search',
  todo_list: 'todo_list',
  error: 'error',
}

function isFileMutationToolName(name) {
  const n = String(name || '').toLowerCase()
  return ['file_change', 'apply_patch', 'write_file', 'write', 'create_file',
    'edit', 'edit_file', 'str_replace', 'str_replace_editor'].includes(n)
}

function isReadToolName(name) {
  const n = String(name || '').toLowerCase()
  return ['read', 'read_file', 'view', 'cat'].includes(n)
}

function getToolActivityLabel(toolName) {
  const n = String(toolName || '').toLowerCase()
  if (['shell', 'bash', 'execute', 'command_execution'].includes(n)) return 'Ran'
  if (isFileMutationToolName(n)) return 'Edited'
  if (isReadToolName(n)) return 'Read'
  if (['web_search'].includes(n)) return 'Searching'
  if (['thinking', 'reasoning'].includes(n)) return 'Thinking'
  if (['todo_list'].includes(n)) return 'Planning'
  if (['mcp_tool'].includes(n)) return '插件'
  if (['error'].includes(n)) return 'Error'
  return 'Tool'
}

function resolveToolCardType(item) {
  if (!item || !item.type) return null

  const itemType = item.type
  const itemName = String(item.name || '')

  if (ITEM_TYPE_TO_TOOL_CARD[itemType]) {
    return ITEM_TYPE_TO_TOOL_CARD[itemType]
  }

  if (itemType === 'custom_tool_call') {
    if (itemName.toLowerCase() === 'apply_patch') return 'apply_patch'
    return itemName || 'custom_tool_call'
  }

  if (itemType === 'function_call') {
    if (itemName.toLowerCase() === 'shell_command') return 'shell'
    return itemName || 'tool'
  }

  if (itemType === 'custom_tool_call_output' || itemType === 'function_call_output') {
    return null
  }

  return null
}

function classifyItemKind(item) {
  if (!item || !item.type) return 'ignore'

  const t = item.type

  if (t === 'agent_message') return 'assistant'

  if (resolveToolCardType(item)) return 'tool'

  if (t === 'turn_completed' || t === 'turn_failed' || t === 'turn_aborted') {
    return 'terminal'
  }

  return 'ignore'
}

// ---------------------------------------------------------------------------
// Expand/collapse strategy — live vs history restore
// ---------------------------------------------------------------------------

/**
 * 决定 tool card 的默认展开/折叠状态。
 *
 * 规则（按优先级）：
 *   - reasoning → 始终折叠
 *   - error/pending → 始终展开
 *   - historyRestore → 默认折叠（已完成 tool）
 *   - live stream → 默认展开
 *
 * @param {Object} item   - SDK item（需有 type）
 * @param {Object} ctx    - { historyRestore?, ... }
 * @param {string} status - 'running'|'done'|'error'|'pending'
 * @returns {boolean}
 */
function shouldExpandToolByDefault(item, ctx, status) {
  // reasoning: 始终折叠（无论 live 还是 history）
  if (item.type === 'reasoning') return false
  // error/pending: 始终展开（无论 live 还是 history）
  if (status === 'error') return true
  // pending 当前不出现在 normalizeStatus 的输出中，作为前瞻守卫保留
  if (status === 'pending') return true
  // history restore: 已完成 tool 默认折叠
  if (ctx && ctx.historyRestore) return false
  // live stream: 默认展开
  return true
}

// ---------------------------------------------------------------------------
// Bash output preview — 大输出摘要
// ---------------------------------------------------------------------------

var LARGE_BASH_OUTPUT_CHARS = 12000
var LARGE_BASH_OUTPUT_LINES = 200
var PREVIEW_MAX_CHARS = 8000
var PREVIEW_MAX_LINES = 120

/**
 * 为大 bash 输出生成 preview 字符串。
 * 纯函数，方便单元测试。
 *
 * @param {string} output - 完整 bash 输出
 * @param {Object} opts   - { maxChars?, maxLines? }
 * @returns {{ preview: string, totalChars: number, totalLines: number }}
 */
function buildBashOutputPreview(output, opts) {
  opts = opts || {}
  var maxChars = opts.maxChars || PREVIEW_MAX_CHARS
  var maxLines = opts.maxLines || PREVIEW_MAX_LINES
  var totalChars = output.length
  var lines = output.split('\n')
  // Avoid overcount: split leaves a trailing "" when output ends with \n
  var totalLines = lines.length - (lines.length > 1 && lines[lines.length - 1] === '' ? 1 : 0)
  var preview = ''
  var charCount = 0
  for (var i = 0; i < lines.length && i < maxLines && charCount < maxChars; i++) {
    var line = lines[i]
    var suffix = i < lines.length - 1 ? '\n' : ''
    if (charCount + line.length + suffix.length > maxChars) {
      preview += line.slice(0, maxChars - charCount)
      break
    }
    preview += line + suffix
    charCount += line.length + suffix.length
  }
  return { preview: preview, totalChars: totalChars, totalLines: totalLines }
}

// ---------------------------------------------------------------------------
// Tool message construction
// ---------------------------------------------------------------------------

function buildToolMessageParts(item, ctx) {
  ctx = ctx || {}
  const toolCardType = resolveToolCardType(item)
  if (!toolCardType) return null

  const toolUseId = item.call_id || item.id
  const isFinal = Boolean(ctx.isFinal)

  const base = {
    toolName: toolCardType,
    rawType: item.type || toolCardType,
    activityLabel: getToolActivityLabel(toolCardType),
    toolUseId: toolUseId,
    expanded: true,
    newContent: '',
    diffLines: [],
  }

  const merge = {}
  let status = 'running'

  switch (item.type) {
    case 'reasoning':
      merge.text = item.text || ''
      status = isFinal ? 'done' : 'running'
      break

    case 'command_execution':
      base.filePath = ''
      base.bashCmd = item.command || ''
      base.bashCwd = ctx.cwd || ''
      merge.bashCmd = item.command || ''
      merge.bashOutput = item.aggregated_output || ''
      merge.bashExitCode = item.exit_code
      merge.newContent = item.aggregated_output || ''
      merge.text = JSON.stringify({
        command: item.command || '',
        status: item.status,
        exit_code: item.exit_code,
      }, null, 2)
      status = normalizeStatus(item.status, isFinal)
      break

    case 'file_change':
      {
        const changes = Array.isArray(item.changes) ? item.changes : []
        base.filePath = changes.map(function (c) { return c.path }).filter(Boolean).join('\n')
        merge.text = JSON.stringify({ changes: changes, status: item.status }, null, 2)
        status = normalizeStatus(item.status, isFinal)
      }
      break

    case 'mcp_tool_call':
      base.serverName = item.server || ''
      base.mcpToolName = item.tool || ''
      merge.serverName = item.server || ''
      merge.mcpToolName = item.tool || ''
      merge.text = JSON.stringify(item.arguments || {}, null, 2)
      merge.toolResultContent = item.result ? JSON.stringify(item.result, null, 2) : ''
      merge.toolError = (item.error && item.error.message) ? item.error.message : ''
      status = normalizeStatus(item.status, isFinal)
      break

    case 'web_search':
      merge.text = JSON.stringify({ query: item.query }, null, 2)
      status = isFinal ? 'done' : 'running'
      break

    case 'todo_list':
      {
        const todoItems = Array.isArray(item.items) ? item.items.map(function (t) {
          return {
            id: t.id,
            text: t.text || t.description || '',
            status: t.status || 'pending',
            enabled: t.enabled !== false,
          }
        }) : []
        merge.text = JSON.stringify({ todos: todoItems }, null, 2)
        merge.todoItems = todoItems
        status = isFinal ? 'done' : 'running'
      }
      break

    case 'error':
      merge.text = item.message || ''
      status = 'error'
      break

    case 'custom_tool_call':
      {
        const name = item.name || 'tool'
        const input = String(item.input || '')
        merge.text = JSON.stringify({ name: name, input: input.slice(0, 2000) }, null, 2)
        // apply_patch: expand/collapse controlled by shouldExpandToolByDefault
        status = normalizeStatus(item.status, isFinal)
      }
      break

    case 'function_call':
      {
        const name = item.name || 'tool'
        const args = tryParseJson(item.arguments)
        merge.text = JSON.stringify(args || {}, null, 2)
        // shell_command: extract bashCmd from arguments.command (live parity)
        if (name.toLowerCase() === 'shell_command') {
          base.bashCmd = args.command || ''
          base.bashCwd = args.workdir || ctx.cwd || ''
          base.filePath = ''
          merge.bashCmd = args.command || ''
          merge.bashOutput = item.aggregated_output || ''
          merge.newContent = item.aggregated_output || ''
        }
        status = normalizeStatus(item.status, isFinal)
      }
      break

    default:
      merge.text = ''
      status = isFinal ? 'done' : 'running'
      break
  }

  base.expanded = shouldExpandToolByDefault(item, ctx, status)

  return { base: base, merge: merge, status: status }
}

function buildHistoryToolMessage(call, output, ctx) {
  ctx = ctx || {}
  const parts = buildToolMessageParts(call, Object.assign({}, ctx, { isFinal: true }))
  if (!parts) return null

  // apply_patch + patchEnd → file_change fusion
  const resultStatus = output
    ? (output.length < 500 && String(output).toLowerCase().includes('error') ? 'error' : 'done')
    : parts.status

  const message = Object.assign(
    { role: 'tool' },
    parts.base,
    parts.merge,
    { status: resultStatus, toolResultContent: output || '' }
  )
  // Always re-evaluate expanded with final status — buildToolMessageParts
  // used the switch-case status, but buildHistoryToolMessage may infer a
  // different status from output content (e.g., short error string).
  message.expanded = shouldExpandToolByDefault(call, ctx, resultStatus)
  if (call.type === 'function_call' && String(call.name || '').toLowerCase() === 'shell_command') {
    message.bashOutput = output || message.bashOutput || ''
    message.newContent = output || message.newContent || ''
  }
  return message
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeStatus(itemStatus, isFinal) {
  if (isFinal) return 'done'
  if (itemStatus === 'failed' || itemStatus === 'error') return 'error'
  if (itemStatus === 'in_progress') return 'running'
  return 'done'
}

function tryParseJson(str) {
  if (!str) return {}
  try { return JSON.parse(str) } catch (_) { return {} }
}


// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  isFileMutationToolName,
  isReadToolName,
  getToolActivityLabel,
  resolveToolCardType,
  classifyItemKind,
  buildToolMessageParts,
  buildHistoryToolMessage,
  shouldExpandToolByDefault,
  buildBashOutputPreview,
  LARGE_BASH_OUTPUT_CHARS,
  LARGE_BASH_OUTPUT_LINES,
}
