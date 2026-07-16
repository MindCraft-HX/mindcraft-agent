/**
 * CodeX UI Event Mapper — shared tool classification & message construction
 *
 * 职责：将 CodeX SDK 原始 item 归一到 UI 事件语义。
 * - 纯函数，无副作用，不依赖 Vue/Electron。
 * - live stream 和 history restore 共用同一套分类规则。
 * - 不处理 agent_message / turn_terminal（这些由调用方按契约直接映射）。
 *
 * Event rendering follows the stable architecture and session contracts in docs/.
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
export function shouldExpandToolByDefault(item, ctx, status) {
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

export const LARGE_BASH_OUTPUT_CHARS = 12000
export const LARGE_BASH_OUTPUT_LINES = 200
const PREVIEW_MAX_CHARS = 8000
const PREVIEW_MAX_LINES = 120

/**
 * 为大 bash 输出生成 preview 字符串。
 * 纯函数，方便单元测试。
 *
 * @param {string} output - 完整 bash 输出
 * @param {Object} opts   - { maxChars?, maxLines? }
 * @returns {{ preview: string, totalChars: number, totalLines: number }}
 */
export function buildBashOutputPreview(output, opts = {}) {
  const maxChars = opts.maxChars || PREVIEW_MAX_CHARS
  const maxLines = opts.maxLines || PREVIEW_MAX_LINES
  const totalChars = output.length
  const lines = output.split('\n')
  // Avoid overcount: split leaves a trailing "" when output ends with \n
  const totalLines = lines.length - (lines.length > 1 && lines[lines.length - 1] === '' ? 1 : 0)
  let preview = ''
  let charCount = 0
  for (let i = 0; i < lines.length && i < maxLines && charCount < maxChars; i++) {
    const line = lines[i]
    const suffix = i < lines.length - 1 ? '\n' : ''
    if (charCount + line.length + suffix.length > maxChars) {
      preview += line.slice(0, maxChars - charCount)
      break
    }
    preview += line + suffix
    charCount += line.length + suffix.length
  }
  return { preview, totalChars, totalLines }
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

  // Reducer-produced file changes use `id` as the stable canonical join key.
  const toolUseId = item.type === 'file_change'
    ? (item.id || item.call_id)
    : (item.call_id || item.id)
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
      merge.text = item.message || ''
      status = 'error'
      break
    }

    case 'custom_tool_call': {
      const name = item.name || 'tool'
      const input = String(item.input || '')
      merge.text = JSON.stringify({ name, input: input.slice(0, 2000) }, null, 2)
      // apply_patch: filePath / _fileChanges 由调用方通过 parseApplyPatchInput
      // 补充；expand/collapse 由 shouldExpandToolByDefault 统一控制
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
        base.bashCwd = args.workdir || ctx.cwd || ''
        base.filePath = ''
        merge.bashCmd = args.command || ''
        merge.bashOutput = item.aggregated_output || ''
        merge.newContent = item.aggregated_output || ''
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

  base.expanded = shouldExpandToolByDefault(item, ctx, status)

  return { base, merge, status }
}

/**
 * 构建完整的 history restore tool message（含 role: 'tool'）。
 * 合并 call + output。文件修改已在 provider 边界归一为 `file_change`。
 *
 * @param {Object} call     - tool call item
 * @param {string} output   - tool 输出文本
 * @param {Object} ctx      - { cwd, isWriteTool, isEditTool, isBashTool, isReadTool }
 * @returns {Object|null}   - 完整的 UI message 对象
 */
export function buildHistoryToolMessage(call, output, ctx = {}) {
  const parts = buildToolMessageParts(call, { ...ctx, isFinal: true })
  if (!parts) return null

  // apply_patch + patchEnd → file_change 融合
  const resultStatus = output ? (output.length < 500 && String(output).toLowerCase().includes('error') ? 'error' : 'done') : parts.status

  const message = {
    role: 'tool',
    ...parts.base,
    ...parts.merge,
    status: resultStatus,
    toolResultContent: output || '',
  }
  // Always re-evaluate expanded with final status — buildToolMessageParts
  // used the switch-case status, but buildHistoryToolMessage may infer a
  // different status from output content (e.g., short error string).
  // Unconditional re-evaluation is cheap and avoids guard gaps.
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
