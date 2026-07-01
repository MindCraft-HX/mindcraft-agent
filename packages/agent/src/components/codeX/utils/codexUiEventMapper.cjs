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

  if (itemType === 'patch_apply_end') {
    return 'file_change'
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
      base.expanded = false
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

    case 'patch_apply_end':
      // CodeX SDK sends changes as an object keyed by file path
      merge.filePath = (item.changes && typeof item.changes === 'object' && !Array.isArray(item.changes))
        ? Object.keys(item.changes).join('\n')
        : ''
      merge.text = JSON.stringify({ changes: item.changes || {}, status: item.status }, null, 2)
      status = normalizeStatus(item.status, true)
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
      base.expanded = true
      merge.text = item.message || ''
      status = 'error'
      break

    case 'custom_tool_call':
      {
        const name = item.name || 'tool'
        const input = String(item.input || '')
        merge.text = JSON.stringify({ name: name, input: input.slice(0, 2000) }, null, 2)
        if (name === 'apply_patch' && input) {
          base.expanded = true
        }
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
          base.bashCwd = ctx.cwd || ''
          base.filePath = ''
          merge.bashCmd = args.command || ''
          merge.newContent = ''
        }
        status = normalizeStatus(item.status, isFinal)
      }
      break

    default:
      merge.text = ''
      status = isFinal ? 'done' : 'running'
      break
  }

  return { base: base, merge: merge, status: status }
}

function buildHistoryToolMessage(call, output, patchEnd, ctx) {
  ctx = ctx || {}
  const parts = buildToolMessageParts(call, Object.assign({}, ctx, { isFinal: true }))
  if (!parts) return null

  // apply_patch + patchEnd → file_change fusion
  if (call.type === 'custom_tool_call' && String(call.name || '').toLowerCase() === 'apply_patch' && patchEnd) {
    const changes = []
    const fileChanges = patchEnd.changes || {}
    for (const [filePath, info] of Object.entries(fileChanges)) {
      changes.push({
        path: filePath,
        operation: info.type === 'create' ? 'add'
          : info.type === 'delete' ? 'delete'
          : info.move_path ? 'rename'
          : 'modify',
        unified_diff: info.unified_diff || '',
      })
    }
    return {
      role: 'tool',
      toolName: 'file_change',
      rawType: 'file_change',
      activityLabel: getToolActivityLabel('file_change'),
      toolUseId: parts.base.toolUseId,
      status: patchEnd.success !== false ? 'done' : 'error',
      filePath: changes.map(function (c) { return c.path }).filter(Boolean).join('\n'),
      expanded: true,
      newContent: '',
      diffLines: [],
      text: JSON.stringify({ changes: changes, status: patchEnd.status }, null, 2),
    }
  }

  const resultStatus = output
    ? (output.length < 500 && String(output).toLowerCase().includes('error') ? 'error' : 'done')
    : parts.status

  return Object.assign(
    { role: 'tool' },
    parts.base,
    parts.merge,
    { status: resultStatus, toolResultContent: output || '' }
  )
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
}
