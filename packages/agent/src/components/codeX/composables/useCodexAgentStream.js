// Codex 前端 debug 输出开关（需要查看详细日志时改为 true）
import { nextTick } from 'vue'
import { log as debugLog } from '../../agentCommon/utils/rendererDebug.mjs'
import { perfStart } from '../../agentCommon/utils/rendererPerfProbe.mjs'
import { shouldNotifyOnTaskDone } from '../../agentCommon/utils/taskDoneNotification.mjs'
import { applyToolResult } from '../../agentCommon/utils/helpers.js'
import { attachTurnTokensToLastRenderableMessage } from '../../agentCommon/utils/turnTokensAttachment.mjs'
import { sortChatsByRecencyInPlace } from '../../agentCommon/utils/chatRecency.mjs'
import { findChatBySessionId } from '../utils/sessionRouting.mjs'
import { buildFunctionCallToolState } from '../utils/functionCallToolPreview.mjs'
import {
  markCodexDone,
  markCodexAbortRequested,
  markCodexTerminalErrorSeen,
  markCodexStreamActivity,
  markCodexTerminalSeen,
} from '../utils/codexRuntimeState.mjs'
const CODEX_DEBUG = false

function normalizeIncomingFileChange(c = {}) {
  return {
    path: c?.path || '',
    operation: c?.operation || c?.kind || '',
    unified_diff: c?.unified_diff || '',
    _diffSource: c?._diffSource || '',
    _noDiffReason: c?._noDiffReason || '',
    _oldStr: c?._oldStr || '',
    _newStr: c?._newStr || '',
    diffLines: Array.isArray(c?.diffLines) ? c.diffLines : [],
  }
}

function pushMessage(tab, onNewMessage, msg) {
  tab.messages.push(msg)
  onNewMessage?.()
}

function ensureAssistantMessage(tab, nextMsgId, onNewMessage) {
  let msg = tab.currentAssistantId
    ? tab.messages.find(m => m.id === tab.currentAssistantId)
    : null

  if (msg) return msg

  const id = nextMsgId()
  tab.currentAssistantId = id
  msg = { id, role: 'assistant', text: '', _textSource: '' }
  pushMessage(tab, onNewMessage, msg)
  return msg
}

function appendAssistantText(tab, nextMsgId, onNewMessage, text) {
  if (!text) return
  const msg = ensureAssistantMessage(tab, nextMsgId, onNewMessage)
  msg.text = (msg.text || '') + text
  msg._textSource = 'assistant'
}

function attachPerTurnTokens(tab, perTurnTokens, options = {}) {
  if (!Array.isArray(tab?.messages)) return false
  return attachTurnTokensToLastRenderableMessage(tab.messages, perTurnTokens, {
    replace: Boolean(options.replace),
  })
}

function normalizeToolStatus(itemStatus, isFinal) {
  if (!isFinal) return 'running'
  return itemStatus === 'failed' ? 'error' : 'done'
}

/**
 * 将 patch_apply_end.changes 统一转为 _fileChanges 数组。
 * SDK 可能返回对象格式 {path: {type, unified_diff, ...}} 或数组格式 [{path, operation, unified_diff}]，
 * 此处兼容两种格式，与 electron 侧 toFileChangeChangesFromPatchEnd 逻辑一致。
 */
function getActivityLabel(toolName) {
  const n = String(toolName || '').toLowerCase()
  if (['shell', 'bash', 'execute', 'command_execution'].includes(n)) return 'Ran'
  if (['file_change', 'apply_patch', 'write_file', 'write', 'edit', 'str_replace', 'str_replace_editor'].includes(n)) return 'Edited'
  if (['web_search'].includes(n)) return 'Searching'
  if (['thinking', 'reasoning'].includes(n)) return 'Thinking'
  if (['todo_list'].includes(n)) return 'Planning'
  if (['mcp_tool'].includes(n)) return '插件'
  return 'Tool'
}

/** 解析 apply_patch 原始输入文本，返回 _fileChanges 数组 */
function parseApplyPatchInput(input) {
  if (!input || typeof input !== 'string') return []
  const lines = input.split(/\r?\n/)
  const result = []
  let curDel = []
  let curAdd = []
  
  function parsePatchFileHeader(line) {
    const match = line.match(/^\*\*\*\s+(Update|Add|Delete) File:\s*(.+)$/)
    if (!match) return null
    const [, kind, rawPath] = match
    return {
      path: rawPath.trim(),
      operation: kind === 'Add' ? 'add' : kind === 'Delete' ? 'delete' : 'modify',
    }
  }

  function flushHunk() {
    if (curDel.length || curAdd.length) {
      const last = result[result.length - 1]
      if (last) last.diffHunks.push({ del: [...curDel], add: [...curAdd] })
    }
    curDel = []
    curAdd = []
  }

  for (const line of lines) {
    const fileHeader = parsePatchFileHeader(line)
    if (fileHeader) {
      flushHunk()
      result.push({ path: fileHeader.path, operation: fileHeader.operation, unified_diff: '', diffHunks: [] })
    } else if (line.startsWith('***')) {
      // 忽略 *** Begin Patch 等标记
    } else if (line.startsWith('@@')) {
      flushHunk()
    } else if (line.startsWith('-')) {
      curDel.push(line.slice(1))
    } else if (line.startsWith('+')) {
      curAdd.push(line.slice(1))
    }
  }
  flushHunk()

  // 如果解析结果为空但 input 中有内容，兜底：从 input 文本中提取文件路径
  if (!result.length) {
    const match = input.match(/\*\*\*\s+(Update|Add|Delete) File:\s*(.+)/)
    if (match) {
      const [, kind, rawPath] = match
      result.push({
        path: rawPath.trim(),
        operation: kind === 'Add' ? 'add' : kind === 'Delete' ? 'delete' : 'modify',
        unified_diff: '',
        diffHunks: [],
      })
    }
  }

  return result
}

function normalizeTodoItems(items) {
  if (!Array.isArray(items)) return []
  return items.map((item, index) => ({
    id: item.id || `todo-${index}`,
    content: item.content || item.text || '',
    status: item.status || (item.completed ? 'completed' : 'pending'),
  }))
}

function tryParseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_) {
    return null
  }
}

function hasRichFileChangePreview(changes) {
  if (!Array.isArray(changes) || !changes.length) return false
  return changes.some(change => {
    if (!change || typeof change !== 'object') return false
    return Boolean(
      change.unified_diff
      || (Array.isArray(change.diffLines) && change.diffLines.length)
      || (Array.isArray(change._diffHunks) && change._diffHunks.length)
      || change._oldStr
      || change._newStr
    )
  })
}

function mergeFileChangePreview(existingChanges, nextChanges) {
  const existingList = Array.isArray(existingChanges) ? existingChanges : []
  const nextList = Array.isArray(nextChanges) ? nextChanges : []

  if (!nextList.length) return existingList
  if (!existingList.length) return nextList

  const existingByPath = new Map(existingList.map(change => [change?.path || '', change]))
  return nextList.map(change => {
    const path = change?.path || ''
    const existing = existingByPath.get(path)
    if (!existing) return change

    return {
      ...existing,
      ...change,
      operation: change?.operation || change?.kind || existing?.operation || '',
      unified_diff: change?.unified_diff || existing?.unified_diff || '',
      _diffHunks: Array.isArray(change?._diffHunks) && change._diffHunks.length
        ? change._diffHunks
        : (existing?._diffHunks || []),
      _diffSource: change?._diffSource || existing?._diffSource || '',
      _noDiffReason: change?._noDiffReason || existing?._noDiffReason || '',
      diffLines: Array.isArray(change?.diffLines) && change.diffLines.length
        ? change.diffLines
        : (existing?.diffLines || []),
      _oldStr: change?._oldStr || existing?._oldStr || '',
      _newStr: change?._newStr || existing?._newStr || '',
    }
  })
}

function upsertToolMessage(tab, onNewMessage, createToolMessage, toolUseId, factory) {
  const existing = toolUseId
    ? tab.messages.find(m => m.role === 'tool' && m.toolUseId === toolUseId)
    : null

  if (existing) {
    const next = factory(existing, false) || existing
    Object.assign(existing, next)
    return existing
  }

  const created = factory(null, true)
  pushMessage(tab, onNewMessage, createToolMessage(created))
  return tab.messages[tab.messages.length - 1]
}

/** 各 item.type 对应的 tool handler 配置 */
const ITEM_TOOL_HANDLERS = {
  reasoning: {
    toolName: 'thinking',
    baseProps: () => ({ expanded: false, newContent: '', diffLines: [] }),
    mergeProps: (item) => ({ text: item.text || '' }),
    status: (item, isFinal) => isFinal ? 'done' : 'running',
  },
  command_execution: {
    toolName: 'shell',
    baseProps: (item, tab) => ({
      filePath: '',
      bashCmd: item.command || '',
      bashCwd: tab.cwd || '',
      expanded: true,
      newContent: item.aggregated_output || '',
      diffLines: [],
    }),
    mergeProps: (item, existing) => ({
      status: undefined,  // 由 status() 单独控制
      bashCmd: item.command || existing?.bashCmd || '',
      bashOutput: item.aggregated_output || '',
      bashExitCode: item.exit_code,
      newContent: item.aggregated_output || '',
      text: JSON.stringify({
        command: item.command || existing?.bashCmd || '',
        status: item.status,
        exit_code: item.exit_code,
      }, null, 2),
    }),
    status: (item, isFinal) => normalizeToolStatus(item.status, isFinal),
    onFinal: (toolMsg, item) => {
      toolMsg.expanded = true
      applyToolResult(toolMsg._messagesContext || [], item.id, item.aggregated_output || '', item.status === 'failed', {
        inferToolFailureFromText: toolMsg._inferToolFailureFromText,
        isBashTool: toolMsg._isBashTool,
        isReadTool: toolMsg._isReadTool,
        isWriteTool: toolMsg._isWriteTool,
        isEditTool: toolMsg._isEditTool,
      })
    },
  },
  file_change: {
    toolName: 'file_change',
    baseProps: (item) => {
      const changes = Array.isArray(item.changes) ? item.changes : []
      const filePath = changes.map(c => c.path).filter(Boolean).join('\n')
      // 构建 _fileChanges 数组，每项包含 _diffInput 供 ToolWrite.vue 计算 diff
      const _fileChanges = changes.map(normalizeIncomingFileChange)
      return { expanded: true, newContent: '', diffLines: [], filePath, _fileChanges }
    },
    mergeProps: (item, existing) => {
      const changes = Array.isArray(item.changes) ? item.changes : []
      const filePath = changes.map(c => c.path).filter(Boolean).join('\n')
      const nextFileChanges = changes.map(normalizeIncomingFileChange)
      const _fileChanges = hasRichFileChangePreview(existing?._fileChanges)
        ? mergeFileChangePreview(existing?._fileChanges, nextFileChanges)
        : nextFileChanges
      return {
        filePath: filePath || existing?.filePath || '',
        _fileChanges,
        text: JSON.stringify({ changes, status: item.status }, null, 2),
      }
    },
    status: (item, isFinal) => normalizeToolStatus(item.status, isFinal),
  },
  mcp_tool_call: {
    toolName: 'mcp_tool',
    baseProps: (item) => ({
      expanded: true, newContent: '', diffLines: [],
      serverName: item.server || '',
      mcpToolName: item.tool || '',
    }),
    mergeProps: (item) => ({
      serverName: item.server || '',
      mcpToolName: item.tool || '',
      text: JSON.stringify(item.arguments || {}, null, 2),
      toolResultContent: item.result ? JSON.stringify(item.result, null, 2) : '',
      toolError: item.error?.message || '',
    }),
    status: (item, isFinal) => normalizeToolStatus(item.status, isFinal),
  },
  web_search: {
    toolName: 'web_search',
    baseProps: () => ({ expanded: false, newContent: '', diffLines: [] }),
    mergeProps: (item) => ({ text: JSON.stringify({ query: item.query }, null, 2) }),
    status: (item, isFinal) => isFinal ? 'done' : 'running',
  },
  todo_list: {
    toolName: 'todo_list',
    baseProps: () => ({ expanded: true, newContent: '', diffLines: [] }),
    mergeProps: (item) => {
      const todoItems = normalizeTodoItems(item.items)
      return { text: JSON.stringify({ todos: todoItems }, null, 2), todoItems }
    },
    status: (item, isFinal) => isFinal ? 'done' : 'running',
  },
  error: {
    toolName: 'error',
    baseProps: () => ({ expanded: true, newContent: '', diffLines: [] }),
    mergeProps: (item) => ({ text: item.message || '' }),
    status: () => 'error',
  },
  // 普通 custom_tool_call（非 apply_patch）：如 web_search、read_file 等
  // 实时流中之前被遗漏（仅 history restore 有处理），现在补齐为通用 tool card。
  custom_tool_call: {
    toolName: (item) => item.name || 'tool',
    baseProps: (item) => ({
      expanded: true,
      newContent: '',
      diffLines: [],
      filePath: '',
    }),
    mergeProps: (item) => ({
      text: JSON.stringify({ name: item.name, input: String(item.input || '').substring(0, 2000) }, null, 2),
      filePath: item.name === 'apply_patch'
        ? (String(item.input || '').match(/\*\*\*\s+Update File:\s*(.+)/) || [])[1]?.trim() || ''
        : '',
    }),
    status: (item, isFinal) => normalizeToolStatus(item.status, isFinal),
  },
  custom_tool_call_output: {
    toolName: (item) => item.name || 'tool',
    baseProps: () => ({ expanded: true, newContent: '', diffLines: [] }),
    mergeProps: (item, existing) => ({
      text: existing?.text || '',
      toolResultContent: item.output || '',
    }),
    status: (item) => item.status === 'failed' ? 'error' : 'done',
  },
}

export function useCodexAgentStream({
  tabs, projects, getActiveProjectId, isPanelActive, onBackgroundTaskDone,
  scrollBottom, saveHistory, nextMsgId,
  isWriteTool, isEditTool, isBashTool, isReadTool,
  inferToolFailureFromText, createToolMessage, onNewMessage, trimMessages,
  onCompactBoundary = () => {},
}) {
  function handleToolItem(tab, item, isFinal) {
    // apply_patch 特殊处理：custom_tool_call 类型，需要解析 input 文本构建 _fileChanges
    if (item.type === 'custom_tool_call' && item.name === 'apply_patch') {
      const patchText = item.input || ''
      const changes = parseApplyPatchInput(patchText)
      const filePath = changes.map(c => c.path).filter(Boolean).join('\n')
      const _fileChanges = changes.map(c => ({
        path: c.path || '',
        operation: c.operation || 'modify',
        unified_diff: '',
        _diffHunks: c.diffHunks || [],
        diffLines: [],
      }))
      const toolUseId = item.call_id || item.id
      if (CODEX_DEBUG) console.log('[codex-stream] apply_patch call', {
        itemId: item.id,
        callId: item.call_id,
        status: item.status,
        parsedFiles: _fileChanges.length,
        filePath,
      })
      upsertToolMessage(tab, onNewMessage, createToolMessage, toolUseId, (existing, isNew) => {
        return {
          ...(!isNew ? {} : {
            toolName: 'apply_patch',
            rawType: 'apply_patch',
            activityLabel: getActivityLabel('apply_patch'),
            toolUseId,
            expanded: true,
            newContent: '',
            diffLines: [],
            filePath,
            _fileChanges,
          }),
          ...(isNew ? {} : { filePath, _fileChanges }),
          status: normalizeToolStatus(item.status, isFinal),
          text: JSON.stringify({ name: item.name, input: String(item.input || '').slice(0, 2000) }, null, 2),
        }
      })
      return
    }

    if (item.type === 'function_call') {
      const toolUseId = item.call_id || item.id
      if (!toolUseId) return
      const name = item.name || 'tool'
      const args = tryParseJsonObject(item.arguments || '{}') || {}
      const previewState = buildFunctionCallToolState({
        toolName: name,
        args,
        isWriteTool,
        isEditTool,
        isBashTool,
        isReadTool,
      })

      upsertToolMessage(tab, onNewMessage, createToolMessage, toolUseId, (existing, isNew) => ({
        ...(!isNew ? {} : {
          toolName: name,
          rawType: item.type || name,
          activityLabel: getActivityLabel(name),
          toolUseId,
          expanded: true,
          ...previewState,
        }),
        ...(isNew ? {} : previewState),
        status: normalizeToolStatus(item.status, isFinal),
        text: JSON.stringify(args, null, 2),
      }))
      return
    }

    const handler = ITEM_TOOL_HANDLERS[item.type]
    if (!handler) {
      // 始终输出未处理的 item 类型，方便排查"卡住"问题
      console.warn(`[codex-stream] unhandled item type: "${item.type}"`, { itemId: item.id, itemName: item.name, keys: Object.keys(item).join(',') })
      return
    }

    const toolName = typeof handler.toolName === 'function' ? handler.toolName(item) : handler.toolName

    const toolUseId = item.type === 'file_change'
      ? (item.id || item.call_id)
      : (item.call_id || item.id)
    const matchedExisting = typeof handler.findExistingMessage === 'function'
      ? handler.findExistingMessage(tab, item)
      : null

    if (matchedExisting) {
      const mergeProps = handler.mergeProps(item, matchedExisting)
      const status = handler.status(item, isFinal)
      // 非终态更新（如 P0 异步 diff preview 补发的 item.updated）不应把终端状态打回 running
      const finalStatus = (!isFinal && (matchedExisting.status === 'done' || matchedExisting.status === 'error'))
        ? matchedExisting.status
        : status
      Object.assign(matchedExisting, {
        ...mergeProps,
        rawType: matchedExisting.rawType || item.type || matchedExisting.toolName || toolName,
        activityLabel: matchedExisting.activityLabel || getActivityLabel(matchedExisting.toolName || toolName),
        status: finalStatus,
      })
      return
    }

    upsertToolMessage(tab, onNewMessage, createToolMessage, toolUseId, (existing, isNew) => {
      const baseProps = isNew ? handler.baseProps(item, tab) : {}
      const mergeProps = handler.mergeProps(item, existing)
      const status = handler.status(item, isFinal)
      return {
        ...baseProps,
        ...mergeProps,
        ...(isNew
          ? { toolName, rawType: item.type || toolName, activityLabel: getActivityLabel(toolName), toolUseId }
          : { rawType: item.type || existing?.rawType || toolName, activityLabel: getActivityLabel(toolName) }),
        status,
      }
    })

    // command_execution 完成时需要额外处理
    if (isFinal && handler.onFinal) {
      const msg = tab.messages.find(m => m.role === 'tool' && m.toolUseId === toolUseId)
      if (msg) {
        // 将 helper 函数临时挂到 msg 上供 onFinal 使用
        msg._messagesContext = tab.messages
        msg._inferToolFailureFromText = inferToolFailureFromText
        msg._isBashTool = isBashTool
        msg._isReadTool = isReadTool
        msg._isWriteTool = isWriteTool
        msg._isEditTool = isEditTool
        handler.onFinal(msg, item)
        delete msg._messagesContext
        delete msg._inferToolFailureFromText
        delete msg._isBashTool
        delete msg._isReadTool
        delete msg._isWriteTool
        delete msg._isEditTool
      }
    }
  }

  // T179 Phase 3: 节流 scrollBottom — nextTick 去重（对齐 ClaudeCode）
  const scrollPending = new Set()
  function throttledScroll(tabId) {
    if (scrollPending.has(tabId)) return
    scrollPending.add(tabId)
    nextTick(() => {
      scrollBottom(tabId)
      scrollPending.delete(tabId)
    })
  }

  // T179 Phase 3: 节流 saveHistory — 3s debounce（对齐 ClaudeCode）
  let historyTimer = null
  function throttledSave() {
    if (historyTimer) return
    historyTimer = setTimeout(() => {
      historyTimer = null
      saveHistory()
    }, 3000)
  }

  function onAgentMessage({ sessionId: sid, msg }) {
    const stopMsg = perfStart('codex.onAgentMessage')
    try {
    // 打印最原始数据
    if (msg.type === 'item.started' || msg.type === 'item.updated' || msg.type === 'item.completed') {
      if (CODEX_DEBUG) console.log('[codex-stream] === RAW onAgentMessage ===',msg)
    }

    const match = findChatBySessionId({
      sessionId: sid,
      projects: projects?.value,
      tabs: tabs.value,
    })
    const tab = match?.tab
    if (!tab) return

    const isWorking = msg.type === 'assistant' || msg.type === 'item.started' || msg.type === 'item.updated'
    if (isWorking) markCodexStreamActivity(tab, msg)

    if (msg.type === 'turn.completed' || msg.type === 'task_complete') {
      const lastThinking = [...tab.messages].reverse().find(
        m => m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running'
      )
      if (lastThinking) lastThinking.status = 'done'
      attachPerTurnTokens(tab, msg._perTurnTokens, { replace: false })
      markCodexTerminalSeen(tab)
      throttledScroll(tab.id)
      saveHistory({ immediate: true })
      return
    }

    if (msg.type === 'assistant') {
      const content = msg.message?.content
      if (!Array.isArray(content)) return
      for (const block of content) {
        if (block.type === 'text' && block.text) appendAssistantText(tab, nextMsgId, onNewMessage, block.text)
      }
      throttledScroll(tab.id)
      throttledSave()
      return
    }

    if (msg.type === 'item.started' || msg.type === 'item.updated' || msg.type === 'item.completed') {
      const item = msg.item
      if (!item) return
      const isFinal = msg.type === 'item.completed'
      if (item.type === 'file_change') {
        if (CODEX_DEBUG) console.log('[codex-stream] file_change received', {
          eventType: msg.type,
          itemId: item.id,
          status: item.status,
          changesCount: Array.isArray(item.changes) ? item.changes.length : 0,
          sessionId: sid,
        })
      }

      if (item.type === 'agent_message') {
        const raw = item.message || item.text || ''
        // Strip <thinking>...</thinking> blocks; these are internal progress,
        // not final assistant content. Empty after stripping → skip entirely.
        const cleaned = raw.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim()
        if (!cleaned) {
          if (isFinal) tab.currentAssistantId = null
          return
        }
        const aMsg = ensureAssistantMessage(tab, nextMsgId, onNewMessage)
        // agent_message may be the only visible text for a turn, but it is
        // secondary when the primary assistant stream has already produced text.
        if (aMsg._textSource !== 'assistant') {
          aMsg.text = cleaned
          aMsg._textSource = 'agent_message'
        }
        if (isFinal) tab.currentAssistantId = null
        throttledScroll(tab.id)
        throttledSave()
        return
      }

      tab.currentAssistantId = null
      handleToolItem(tab, item, isFinal)
      if (item.type === 'file_change') {
        const justUpserted = [...tab.messages].reverse().find(
          m => m.role === 'tool' && m.toolUseId === (item.id || item.call_id)
        )
        if (CODEX_DEBUG) console.log('[codex-stream] file_change rendered', {
          found: !!justUpserted,
          toolUseId: justUpserted?.toolUseId,
          status: justUpserted?.status,
          filePath: justUpserted?.filePath,
        })
      }

      throttledScroll(tab.id)
      throttledSave()
      return
    }

    if (msg.type === 'turn.failed') {
      markCodexTerminalErrorSeen(tab, msg.error || msg.message)
      const errorText = msg.error?.message || msg.message || 'Turn 执行失败'
      pushMessage(tab, onNewMessage, { id: nextMsgId(), role: 'system', text: `⚠️ ${errorText}` })
      throttledScroll(tab.id)
      saveHistory({ immediate: true })
      return
    }

    if (msg.type === 'system') {
      if (msg.subtype === 'debug') {
        // 调试消息，仅 console 输出，不渲染到对话
        return
      }
      if (msg.subtype === 'abort') {
        // The provider may still be flushing stdout/transcript. Keep the send
        // lock until the main-process finalizer emits AGENT_DONE.
        markCodexAbortRequested(tab)
        const lastThinking = [...tab.messages].reverse().find(
          m => m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running'
        )
        if (lastThinking) lastThinking.status = 'done'
        throttledScroll(tab.id)
        throttledSave()
        return
      }
      if (msg.subtype === 'error') {
        // Error rendering is not ownership release. Keep the send lock until
        // the main-process finalizer emits the authoritative AGENT_DONE.
        markCodexTerminalErrorSeen(tab, msg)
        const lastThinking = [...tab.messages].reverse().find(
          m => m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running'
        )
        if (lastThinking) lastThinking.status = 'done'
        const content = msg.message?.content
        const text = Array.isArray(content)
          ? content.filter(b => b.type === 'text').map(b => b.text).join('\n')
          : String(msg.message || '')
        pushMessage(tab, onNewMessage, { id: nextMsgId(), role: 'system', text: `⚠️ ${text || '执行异常'}` })
        throttledScroll(tab.id)
        throttledSave()
        return
      }
      if (msg.subtype === 'compact_started') {
        tab._compacting = true
        pushMessage(tab, onNewMessage, {
          id: nextMsgId(),
          role: 'system',
          text: 'CodeX 自动压缩中',
          compactTitle: 'CodeX 自动压缩中',
          compactSummary: '',
          expanded: false,
          _isCompact: true,
          _compacting: true,
        })
        throttledScroll(tab.id)
        throttledSave()
        return
      }
      if (msg.subtype === 'compact_summary') {
        tab._compacting = false
        const content = msg.message?.content
        const summary = Array.isArray(content)
          ? content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
          : String(msg.message || '').trim()
        tab._carryCompactSummary = summary
        const lastCompact = [...tab.messages].reverse().find(m => m._isCompact)
        if (lastCompact) {
          lastCompact.compactSummary = summary
          lastCompact._compacting = false
        } else {
          pushMessage(tab, onNewMessage, {
            id: nextMsgId(),
            role: 'system',
            text: '上下文已压缩',
            compactTitle: '上下文已压缩',
            compactSummary: summary,
            expanded: false,
            _isCompact: true,
          })
        }
        throttledScroll(tab.id)
        throttledSave()
        return
      }
      if (msg.subtype === 'compact_boundary') {
        tab._compacting = false
        const meta = msg.compact_metadata || {}
        const pre = Number(meta.pre_compact_tokens || meta.preCompactTokens || 0)
        const post = Number(meta.post_compact_tokens || meta.postCompactTokens || 0)
        const preK = pre > 0 ? Math.round(pre / 1000) : 0
        const postK = post > 0 ? Math.round(post / 1000) : 0
        const title = post > 0
          ? `上下文已压缩 ${preK}k → ${postK}k tokens`
          : '上下文已压缩'
        const lastCompact = [...tab.messages].reverse().find(m => m._isCompact)
        if (lastCompact) {
          lastCompact.text = title
          lastCompact.compactTitle = title
          lastCompact._compacting = false
        } else {
          pushMessage(tab, onNewMessage, {
            id: nextMsgId(),
            role: 'system',
            text: title,
            compactTitle: title,
            compactSummary: '',
            expanded: false,
            _isCompact: true,
          })
        }
        throttledScroll(tab.id)
        throttledSave()
        if (post > 0) onCompactBoundary(post)
        return
      }
      if (msg.subtype === 'slow_notice') {
        const text = msg.message?.content?.[0]?.text || 'Codex 响应较慢，请稍候…'
        pushMessage(tab, onNewMessage, { id: nextMsgId(), role: 'system', text })
        throttledScroll(tab.id)
        throttledSave()
        return
      }
      // 已知的 system subtype 已在上面处理，未知 subtype 仅打日志不渲染
      if (CODEX_DEBUG) {
        console.warn('[codex] onAgentMessage: unhandled system subtype:', msg.subtype, 'text preview:', String(msg.message).slice(0, 200))
      }
      return
    }

    if (msg.type === 'metrics' && msg.usage) {
      tab.lastMetrics = { ...tab.lastMetrics, ...msg.usage }
      throttledSave()
      return
    }

    // 未知 msg.type 兜底日志
    console.warn('[codex] onAgentMessage: unhandled msg.type:', msg.type, msg)
    } finally {
      stopMsg()
    }
  }

  function onAgentDone({ sessionId: sid, cliSessionId, filePath, reason = 'completed', detachResume = false }) {
    // 跨所有项目搜索 session（不仅是当前活跃项目，后台项目也需要处理）
    let tab = null
    let ownerProject = null
    if (projects) {
      for (const p of projects.value) {
        tab = (p.chats || []).find(c => c.sessionId === sid)
        if (tab) { ownerProject = p; break }
      }
    }
    if (!tab) {
      // 回退到当前活跃 tab 列表
      tab = tabs.value.find(t => t.sessionId === sid)
    }
    debugLog('agentDone', 'onAgentDone', { sid, tabFound: !!tab, ownerProj: ownerProject?.id || 'none', activeProj: getActiveProjectId?.() || 'none', panelActive: isPanelActive?.value ?? 'N/A', reason })
    if (!tab) return
    if (detachResume) {
      window.electronAPI.codexUnregisterCliSession?.(sid)
    } else if (cliSessionId) {
      window.electronAPI.codexRegisterCliSessions?.({ [sid]: cliSessionId })
    }
    if (filePath && CODEX_DEBUG) console.log('[CodexStream] onAgentDone → filePath:', filePath)
    const lastThinking = [...tab.messages].reverse().find(
      m => m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running'
    )
    if (lastThinking) {
      lastThinking.status = 'done'
    }
    markCodexDone(tab, {
      cliSessionId: detachResume ? '' : cliSessionId,
      filePath: detachResume ? '' : filePath,
      reason,
    })
    // T182: agent 完成后精准更新 fileSize，替代等扫描
    if (filePath && !detachResume) {
      window.electronAPI.codexGetFileStat?.(filePath).then(stat => {
        if (!stat || !tab) return
        let changed = false
        if (tab.fileSize !== stat.size) {
          tab.fileSize = stat.size
          changed = true
        }
        if (stat.mtime && new Date(stat.mtime).getTime() > new Date(tab.updatedAt || 0).getTime()) {
          tab.updatedAt = stat.mtime
          changed = true
        }
        if (changed) saveHistory({ immediate: true, force: true })
      }).catch(() => {})
    }
    if (ownerProject && reason === 'completed') {
      // 视觉提醒（任务栏闪烁 + Tab 高亮）：仅后台/非活跃项目时
      if (shouldNotifyOnTaskDone({
        ownerProjectId: ownerProject.id,
        activeProjectId: getActiveProjectId?.(),
        isPanelActive: isPanelActive?.value,
      })) {
        ownerProject.hasDoneNotification = true
        onBackgroundTaskDone?.()
        window.electronAPI?.flashTaskbar?.()
      }
    }
    trimMessages?.(tab)
    if (ownerProject?.chats) {
      sortChatsByRecencyInPlace(ownerProject.chats)
    }
    scrollBottom(tab.id)
    saveHistory()
  }

  return { onAgentMessage, onAgentDone }
}
