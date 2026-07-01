/**
 * CodeX UI Event Mapper — shared tool classification & message construction
 *
 * 职责：将 CodeX SDK 原始 item 归一到 UI 事件语义。
 * - 纯函数，无副作用，不依赖 Vue/Electron。
 * - live stream 和 history restore 共用同一套分类规则。
 * - 不处理 agent_message / turn_terminal（这些由调用方按契约直接映射）。
 *
 * 目标契约参见：docs/plan/2026-07-01-codex-event-rendering-contract.md
 *
 * 约定：
 *   - item: SDK 原始 item 对象 { type, name, call_id, id, status, ... }
 *   - context: { cwd?, isWriteTool?, isEditTool?, isBashTool?, isReadTool? }
 */

// ---------------------------------------------------------------------------
// Tool classification — item type → canonical tool card name
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

/**
 * 判断是否为文件变更类工具名。
 * 同时被 getToolActivityLabel 和 resolveToolCardType 使用。
 */
export function isFileMutationToolName(name) {
  const n = String(name || '').toLowerCase()
  return ['file_change', 'apply_patch', 'write_file', 'write', 'create_file',
    'edit', 'edit_file', 'str_replace', 'str_replace_editor'].includes(n)
}

/**
 * 判断是否为文件读取类工具名。
 */
export function isReadToolName(name) {
  const n = String(name || '').toLowerCase()
  return ['read', 'read_file', 'view', 'cat'].includes(n)
}

/**
 * 获取工具 card 的 activity label（"正在…" 文案）。
 * 合并了 useCodexAgentStream.getActivityLabel 和 codexAgent.getCodexActivityLabel 的公共逻辑。
 *
 * @param {string} toolName - 工具名或 item.type
 * @returns {string}
 */
export function getToolActivityLabel(toolName) {
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

/**
 * 将 SDK item.type + item.name 解析为渲染层 tool card 名称。
 *
 * - 已知 item.type → 从 ITEM_TYPE_TO_TOOL_CARD 查找
 * - custom_tool_call → 按 name 特判 apply_patch 或直接用 name
 * - function_call → 按 name 映射（shell_command → shell）
 *
 * @param {Object} item - { type, name }
 * @returns {string|null} tool card 类型名，null 表示不是 tool item
 */
export function resolveToolCardType(item) {
  if (!item || !item.type) return null

  const itemType = item.type
  const itemName = String(item.name || '')

  // 结构化 item 类型直接查表
  if (ITEM_TYPE_TO_TOOL_CARD[itemType]) {
    return ITEM_TYPE_TO_TOOL_CARD[itemType]
  }

  // patch_apply_end → file_change tool card
  if (itemType === 'patch_apply_end') {
    return 'file_change'
  }

  // custom_tool_call: apply_patch 有专门 card，其余直接用 name
  if (itemType === 'custom_tool_call') {
    if (itemName.toLowerCase() === 'apply_patch') return 'apply_patch'
    return itemName || 'custom_tool_call'
  }

  // function_call: shell_command → shell, 其余用 name
  if (itemType === 'function_call') {
    if (itemName.toLowerCase() === 'shell_command') return 'shell'
    return itemName || 'tool'
  }

  // custom_tool_call_output / function_call_output 不作为独立 tool card
  if (itemType === 'custom_tool_call_output' || itemType === 'function_call_output') {
    return null
  }

  return null
}

/**
 * 判断一个 item 在 UI 中应归类到哪种消息。
 *
 * @param {Object} item
 * @returns {'tool'|'assistant'|'progress'|'terminal'|'ignore'}
 */
export function classifyItemKind(item) {
  if (!item || !item.type) return 'ignore'

  const t = item.type

  // agent_message: 调用方根据是否有最终文本二次判断 assistant vs progress
  if (t === 'agent_message') return 'assistant'

  // 可识别的 tool item
  if (resolveToolCardType(item)) return 'tool'

  // turn 级别事件（由调用方处理，mapper 不负责）
  if (t === 'turn_completed' || t === 'turn_failed' || t === 'turn_aborted') {
    return 'terminal'
  }

  // 未知 item 类型
  return 'ignore'
}

// ---------------------------------------------------------------------------
// Tool message construction — 供 live (upsert patch) 和 history (full message) 共用
// ---------------------------------------------------------------------------

/**
 * 构建一个 tool message 的 baseProps + mergeProps 组合。
 *
 * 返回值结构：
 *   { base, merge, status }
 *
 * - base:   新建消息时的默认字段（含 toolName / rawType / activityLabel / toolUseId）
 * - merge:  每次更新都要合并的字段（含 text / status）
 * - status: 状态字符串 ('running'|'done'|'error')
 *
 * 调用方自行决定 base 和 merge 的使用方式：
 *   - live: upsertToolMessage(toolUseId, (existing, isNew) => ({ ...(isNew ? base : {}), ...merge, status }))
 *   - history: { role: 'tool', ...base, ...merge, status, toolResultContent: output }
 *
 * @param {Object} item   - SDK item（必须有 type / call_id 或 id / status）
 * @param {Object} ctx    - { cwd, isWriteTool, isEditTool, isBashTool, isReadTool, isFinal }
 * @returns {{ base: Object, merge: Object, status: string }|null}
 */
export function buildToolMessageParts(item, ctx = {}) {
  const toolCardType = resolveToolCardType(item)
  if (!toolCardType) return null

  const toolUseId = item.call_id || item.id
  const isFinal = Boolean(ctx.isFinal)

  const base = {
    toolName: toolCardType,
    rawType: item.type || toolCardType,
    activityLabel: getToolActivityLabel(toolCardType),
    toolUseId,
    expanded: true,
    newContent: '',
    diffLines: [],
  }

  const merge = {}
  let status = 'running'

  switch (item.type) {
    case 'reasoning': {
      base.expanded = false
      merge.text = item.text || ''
      status = isFinal ? 'done' : 'running'
      break
    }

    case 'command_execution': {
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
    }

    case 'file_change': {
      const changes = Array.isArray(item.changes) ? item.changes : []
      base.filePath = changes.map(c => c.path).filter(Boolean).join('\n')
      merge.text = JSON.stringify({ changes, status: item.status }, null, 2)
      status = normalizeStatus(item.status, isFinal)
      break
    }

    case 'patch_apply_end': {
      merge.filePath = (Array.isArray(item.changes)
        ? Object.keys(item.changes || {}).join('\n')
        : '')
      merge.text = JSON.stringify({ changes: item.changes || [], status: item.status }, null, 2)
      status = normalizeStatus(item.status, true)
      break
    }

    case 'mcp_tool_call': {
      base.serverName = item.server || ''
      base.mcpToolName = item.tool || ''
      merge.serverName = item.server || ''
      merge.mcpToolName = item.tool || ''
      merge.text = JSON.stringify(item.arguments || {}, null, 2)
      merge.toolResultContent = item.result ? JSON.stringify(item.result, null, 2) : ''
      merge.toolError = item.error?.message || ''
      status = normalizeStatus(item.status, isFinal)
      break
    }

    case 'web_search': {
      merge.text = JSON.stringify({ query: item.query }, null, 2)
      status = isFinal ? 'done' : 'running'
      break
    }

    case 'todo_list': {
      const todoItems = Array.isArray(item.items) ? item.items.map(t => ({
        id: t.id,
        text: t.text || t.description || '',
        status: t.status || 'pending',
        enabled: t.enabled !== false,
      })) : []
      merge.text = JSON.stringify({ todos: todoItems }, null, 2)
      merge.todoItems = todoItems
      status = isFinal ? 'done' : 'running'
      break
    }

    case 'error': {
      base.expanded = true
      merge.text = item.message || ''
      status = 'error'
      break
    }

    case 'custom_tool_call': {
      const name = item.name || 'tool'
      const input = String(item.input || '')
      merge.text = JSON.stringify({ name, input: input.slice(0, 2000) }, null, 2)
      // apply_patch 额外字段
      if (name === 'apply_patch' && input) {
        // filePath / _fileChanges 由调用方通过 parseApplyPatchInput 补充
        // mapper 只负责通用字段
        base.expanded = true
      }
      status = normalizeStatus(item.status, isFinal)
      break
    }

    case 'function_call': {
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
      break
    }

    default: {
      // 未知但被 resolveToolCardType 接受的类型 — 返回最小信息
      merge.text = ''
      status = isFinal ? 'done' : 'running'
      break
    }
  }

  return { base, merge, status }
}

/**
 * 构建完整的 history restore tool message（含 role: 'tool'）。
 * 合并 call + output + patchEnd 三个来源。
 *
 * @param {Object} call     - tool call item
 * @param {string} output   - tool 输出文本
 * @param {Object} patchEnd - patch_apply_end item（仅 apply_patch）
 * @param {Object} ctx      - { cwd, isWriteTool, isEditTool, isBashTool, isReadTool }
 * @returns {Object|null}   - 完整的 UI message 对象
 */
export function buildHistoryToolMessage(call, output, patchEnd, ctx = {}) {
  const parts = buildToolMessageParts(call, { ...ctx, isFinal: true })
  if (!parts) return null

  // apply_patch + patchEnd → file_change 融合
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
      filePath: changes.map(c => c.path).filter(Boolean).join('\n'),
      expanded: true,
      newContent: '',
      diffLines: [],
      text: JSON.stringify({ changes, status: patchEnd.status }, null, 2),
    }
  }

  return {
    role: 'tool',
    ...parts.base,
    ...parts.merge,
    status: output ? (output.length < 500 && String(output).toLowerCase().includes('error') ? 'error' : 'done') : parts.status,
    toolResultContent: output || '',
  }
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
