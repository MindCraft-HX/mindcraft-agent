import { log as debugLog } from '../../agentCommon/utils/rendererDebug.mjs'
import { perfStart } from '../../agentCommon/utils/rendererPerfProbe.mjs'
import { applyToolResult } from '../../agentCommon/utils/helpers.js'
import { shouldNotifyOnTaskDone } from '../../agentCommon/utils/taskDoneNotification.mjs'
import { nextTick } from 'vue'
import {
  applyPlanToolUse,
  applyPlanToolResult,
  beginTaskBatch,
  getTaskDebugSnapshot,
  isTaskToolName,
  registerTaskStarted,
  registerTaskUpdated,
} from './useClaudeTaskState.mjs'
import {
  markClaudeDone,
  markClaudeStreamActivity,
} from '../utils/claudeRuntimeState.mjs'
import { attachTurnTokensToLastRenderableMessage } from '../../agentCommon/utils/turnTokensAttachment.mjs'
import { sortChatsByRecencyInPlace } from '../../agentCommon/utils/chatRecency.mjs'

/** 追加消息到 messages */
function pushMessage(tab, onNewMessage, msg) {
  const last = Array.isArray(tab?.messages) ? tab.messages[tab.messages.length - 1] : null
  if (last && msg && last.role === msg.role) {
    const sameText = typeof last.text === 'string' && typeof msg.text === 'string' && last.text === msg.text
    const sameCompact = Boolean(last._isCompact) === Boolean(msg._isCompact)
    const sameTool = String(last.toolName || '') === String(msg.toolName || '')
    if (sameText && sameCompact && sameTool) return
  }
  tab.messages.push(msg)
  onNewMessage?.()
}

function readClaudeCompactBoundaryTokens(msg = {}) {
  const meta = msg?.compactMetadata || msg?.compact_metadata || {}
  return {
    pre: Number(meta.preTokens ?? meta.pre_tokens ?? 0),
    post: Number(meta.postTokens ?? meta.post_tokens ?? 0),
  }
}

/** 滚动节流：同一个 tab 在一个 tick 内只滚一次 */
const scrollPending = new Set()
function throttledScrollBottom(tabId, scrollBottom) {
  if (scrollPending.has(tabId)) return
  scrollPending.add(tabId)
  nextTick(() => {
    scrollBottom(tabId)
    scrollPending.delete(tabId)
  })
}

/** 保存历史节流：避免流式期间频繁保存 */
let saveHistoryTimer = null
function throttledSaveHistory(saveHistory) {
  if (saveHistoryTimer) return
  saveHistoryTimer = setTimeout(() => {
    saveHistoryTimer = null
    saveHistory()
  }, 3000)
}

function ensureTaskToolUseIds(tab) {
  if (!(tab._taskToolUseIds instanceof Set)) {
    tab._taskToolUseIds = new Set()
  }
  return tab._taskToolUseIds
}

function findToolMessage(tab, toolUseId) {
  if (!toolUseId || !Array.isArray(tab?.messages)) return null
  for (let i = tab.messages.length - 1; i >= 0; i--) {
    const msg = tab.messages[i]
    if (msg?.role === 'tool' && msg.toolUseId === toolUseId) {
      return msg
    }
  }
  return null
}

function syncPlanTaskStateFromToolResult(tab, toolUseId, content, saveHistory, extraPayload = null) {
  const toolMsg = findToolMessage(tab, toolUseId)
  if (!toolMsg || !isTaskToolName(toolMsg.toolName)) return

  const meta = applyPlanToolResult(tab, {
    toolName: toolMsg.toolName,
    toolUseId,
    content: extraPayload && typeof extraPayload === 'object'
      ? { ...extraPayload, content }
      : content,
    now: Date.now(),
  })

  if (meta.shouldPersistImmediately) {
    saveHistory({ immediate: true })
  }
}

function markOpenToolsInterrupted(tab, reason = 'interrupted') {
  const messages = Array.isArray(tab?.messages) ? tab.messages : []
  const label = reason === 'failed'
    ? 'Claude 本轮执行失败，工具调用未返回结果。'
    : 'Claude 本轮执行中断，工具调用未返回结果。'
  let changed = false
  for (const msg of messages) {
    if (!msg || msg.role !== 'tool') continue
    if (msg.status !== 'running' && msg.status !== 'pending') continue
    msg.status = 'error'
    msg.toolError = msg.toolError || label
    msg._interruptedToolUse = true
    msg.expanded = true
    changed = true
  }
  return changed
}

export function useClaudeAgentStream({
  tabs,
  projects,
  getActiveProjectId,
  isPanelActive,
  scrollBottom,
  saveHistory,
  nextMsgId,
  isWriteTool,
  isEditTool,
  isBashTool,
  isReadTool,
  inferToolFailureFromText,
  createToolMessage,
  onCompactBoundary,
  onNewMessage,
  trimMessages,
  onBackgroundTaskDone,
  onPendingApproval,
}) {
  function onAgentMessage({ sessionId: chatKey, msg }) {
    const stopMsg = perfStart('claude.onAgentMessage')
    try {
    const tab = tabs.value.find(t => t.sessionId === chatKey)
    if (!tab) return

    // 诊断日志：记录所有 task 相关消息
    if (msg.type === 'system' && (msg.subtype || '').startsWith('task_')) {
      debugLog('taskDiag', 'event', {
        chatKey: chatKey.slice(-8),
        type: msg.type,
        subtype: msg.subtype,
        taskId: msg.task_id || '',
        toolUseId: msg.tool_use_id || '',
        patch: msg.patch || {},
        description: msg.description || '',
      })
    }

    const isWorkingMsg = msg.type === 'assistant' || msg.type === 'user' || msg.type === 'tool_result'
    if (isWorkingMsg) markClaudeStreamActivity(tab, msg)

    if (msg.type === 'assistant') {
      const content = msg.message?.content
      if (!Array.isArray(content)) return
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          if (tab.currentAssistantId === null) {
            tab.currentAssistantId = nextMsgId()
            pushMessage(tab, onNewMessage, { id: tab.currentAssistantId, role: 'assistant', text: block.text })
          } else {
            const m = tab.messages.find(m => m.id === tab.currentAssistantId)
            if (m) m.text += block.text
          }
          throttledScrollBottom(tab.id, scrollBottom)
        } else if (block.type === 'tool_use') {
          tab.currentAssistantId = null
          const input = block.input || {}
          const name = block.name
          const nameLower = (name || '').toLowerCase()
          if (isTaskToolName(nameLower)) {
            const toolUseIds = ensureTaskToolUseIds(tab)
            if (block.id) toolUseIds.add(block.id)
            const syncMeta = applyPlanToolUse(tab, {
              toolName: name,
              toolUseId: block.id,
              input,
              now: Date.now(),
            })
            debugLog('taskDiag', 'tool_use applied', {
              chatKey: chatKey.slice(-8),
              toolName: name,
              toolUseId: block.id || '',
              changed: syncMeta.changed,
              snapshot: getTaskDebugSnapshot(tab),
            })
            if (syncMeta.shouldPersistImmediately) {
              saveHistory({ immediate: true })
            }
          }

          const filePath = input.path || input.file_path || input.filename || ''
          const isBash = nameLower === 'bash' || nameLower === 'execute' || nameLower === 'run_command'
          const bashCmd = isBash ? (input.command || input.cmd || '') : ''
          const defaultExpanded = isWriteTool(name) || isEditTool(name) || isBash
          const toolMsg = createToolMessage({
            toolName: name,
            status: 'running',
            toolUseId: block.id,
            filePath,
            bashCmd,
            bashCwd: isBash ? (tab.cwd || '') : '',
            text: JSON.stringify(input, null, 2),
            expanded: defaultExpanded,
            newContent: input.content || input.new_content || input.file_content || input.new_string || '',
            _diffInput: (isWriteTool(name) || isEditTool(name)) ? {
              oldStr: input.old_string || input.old_str || input.old_content || '',
              newStr: isWriteTool(name) && input._oldContent ? (input.content || input.new_content || '') : (input.new_string || input.new_str || input.new_content || ''),
            } : null,
          })
          pushMessage(tab, onNewMessage, toolMsg)
          throttledScrollBottom(tab.id, scrollBottom)
        } else if (block.type === 'thinking') {
          tab.currentAssistantId = null
          const thinking = typeof block.thinking === 'string' ? block.thinking : (typeof block.text === 'string' ? block.text : '')
          // 从尾部倒序查找（不走全量拷贝）
          const msgs = tab.messages
          let lastThinking = null
          for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i]
            if (m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running') {
              lastThinking = m
              break
            }
          }
          if (lastThinking) {
            lastThinking.text = lastThinking.text ? (lastThinking.text + '\n\n' + thinking) : thinking
            // 思考过程默认折叠，避免 CLS 和内容闪烁
          } else {
            pushMessage(tab, onNewMessage, createToolMessage({
              toolName: 'thinking',
              status: 'running',
              toolUseId: null,
              text: thinking,
              expanded: false,
              newContent: '',
              diffLines: [],
            }), onNewMessage)
          }
          throttledScrollBottom(tab.id, scrollBottom)
        }
      }
    }
    else if (msg.type === 'user') {
      const content = msg.message?.content
      if (!Array.isArray(content)) return
      for (const block of content) {
        if (block.type === 'tool_result') {
          applyToolResult(tab.messages, block.tool_use_id, block.content, block.is_error === true, {
            inferToolFailureFromText, isBashTool, isReadTool, isWriteTool, isEditTool,
          })
          syncPlanTaskStateFromToolResult(tab, block.tool_use_id, block.content, saveHistory, msg)
        }
      }
    }
    else if (msg.type === 'tool_result') {
      applyToolResult(tab.messages, msg.tool_use_id, msg.content, msg.is_error === true, {
        inferToolFailureFromText, isBashTool, isReadTool, isWriteTool, isEditTool,
      })
      syncPlanTaskStateFromToolResult(tab, msg.tool_use_id, msg.content, saveHistory, msg)
    }
    else if (msg.type === 'result') {
      tab.currentAssistantId = null
      // 倒序查找，不走全量拷贝
      const msgs = tab.messages
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running') {
          m.status = 'done'
          break
        }
      }
      // 只消费主进程附带的 final snapshot，前端不再自行解释 raw usage。
      if (msg._turnTokens) {
        attachTurnTokensToLastRenderableMessage(msgs, { ...msg._turnTokens }, { nextMsgId, onNewMessage })
      } else if (msg.usage) {
        console.warn('[perf] claudeAgentStream: result usage received without _turnTokens — final snapshot missing', {
          hasUsage: true,
          msgType: msg.type,
        })
      }
      throttledScrollBottom(tab.id, scrollBottom)
    }
    else if (msg.type === 'system') {
      const content = msg.message?.content
      let text = ''
      const subtype = msg.subtype || ''

      if (subtype === 'task_started') {
        const meta = registerTaskStarted(tab, {
          taskId: msg.task_id,
          description: msg.description || '',
          toolUseId: msg.tool_use_id || '',
          now: Date.now(),
        })
        debugLog('taskDiag', 'task_started applied', {
          chatKey: chatKey.slice(-8),
          taskId: msg.task_id || '',
          toolUseId: msg.tool_use_id || '',
          created: meta.created,
          adoptedPendingTaskId: meta.adoptedPendingTaskId || '',
          snapshot: getTaskDebugSnapshot(tab),
        })
        if (meta.shouldPersistImmediately) {
          saveHistory({ immediate: true })
        }
        return
      }

      if (subtype === 'task_updated') {
        const meta = registerTaskUpdated(tab, {
          taskId: msg.task_id,
          patch: msg.patch || {},
          now: Date.now(),
        })
        debugLog('taskDiag', 'task_updated applied', {
          chatKey: chatKey.slice(-8),
          taskId: msg.task_id || '',
          patch: msg.patch || {},
          created: meta.created,
          becameDone: meta.becameDone,
          snapshot: getTaskDebugSnapshot(tab),
        })
        if (meta.shouldPersistImmediately) {
          saveHistory({ immediate: true })
        }
        return
      }

      if (subtype === 'task_progress') {
        const meta = registerTaskUpdated(tab, {
          taskId: msg.task_id,
          patch: {
            status: 'running',
            description: msg.description || msg.summary || '',
            toolUseId: msg.tool_use_id || '',
          },
          now: Date.now(),
        })
        debugLog('taskDiag', 'task_progress applied', {
          chatKey: chatKey.slice(-8),
          taskId: msg.task_id || '',
          toolUseId: msg.tool_use_id || '',
          created: meta.created,
          snapshot: getTaskDebugSnapshot(tab),
        })
        if (meta.shouldPersistImmediately) {
          saveHistory({ immediate: true })
        }
        return
      }

      if (subtype === 'task_notification') {
        const terminalStatus = msg.status === 'completed'
          ? 'completed'
          : msg.status === 'failed'
            ? 'failed'
            : 'stopped'
        const meta = registerTaskUpdated(tab, {
          taskId: msg.task_id,
          patch: {
            status: terminalStatus,
            description: '',
            toolUseId: msg.tool_use_id || '',
          },
          now: Date.now(),
        })
        if (msg.tool_use_id) {
          applyToolResult(tab.messages, msg.tool_use_id, msg.summary || msg.status || '', msg.status === 'failed', {
            inferToolFailureFromText, isBashTool, isReadTool, isWriteTool, isEditTool,
          })
        }
        debugLog('taskDiag', 'task_notification applied', {
          chatKey: chatKey.slice(-8),
          taskId: msg.task_id || '',
          toolUseId: msg.tool_use_id || '',
          status: msg.status || '',
          becameDone: meta.becameDone,
          snapshot: getTaskDebugSnapshot(tab),
        })
        if (meta.shouldPersistImmediately) {
          saveHistory({ immediate: true })
        }
        return
      }

      if (subtype.startsWith('task_')) {
        return
      }

      if (subtype === 'local_command_output' && typeof msg.content === 'string' && msg.content.trim()) {
        const raw = msg.content.trim()
        const summaryMatch = /\nSummary:\s*\n([\s\S]*)$/i.exec(raw)
        if (summaryMatch) {
          const summary = summaryMatch[1].trim()
          if (tab._awaitingCompactResult) {
            tab._pendingCompactSummary = summary
            return
          }
          const compactTitle = raw.split('\n')[0]?.trim() || 'Compacted chat'
          pushMessage(tab, onNewMessage, {
            id: nextMsgId(),
            role: 'system',
            text: compactTitle,
            compactTitle,
            compactSummary: summary,
            expanded: false,
            _isCompact: true,
          })
        } else {
          pushMessage(tab, onNewMessage, { id: nextMsgId(), role: 'system', text: raw })
        }
        throttledScrollBottom(tab.id, scrollBottom)
        return
      }

      if (subtype === 'compact_started') {
        tab._compacting = true
        const existingCompact = tab.messages.find(m => m._isCompact && m._compacting)
        if (existingCompact) return
        const compactMsg = {
          id: nextMsgId(),
          role: 'system',
          text: '正在进行上下文压缩...',
          compactTitle: '正在进行上下文压缩',
          compactSummary: '',
          expanded: false,
          _isCompact: true,
          _compacting: true,
        }
        tab.messages.push(compactMsg)
        onNewMessage?.()
        throttledScrollBottom(tab.id, scrollBottom)
        return
      }

      if (subtype === 'compact_boundary') {
        const compactingMsg = tab.messages.find(m => m._isCompact && m._compacting)
        if (compactingMsg) compactingMsg._compacting = false
        tab._compacting = false
        const { pre, post } = readClaudeCompactBoundaryTokens(msg)
        const saved = pre > 0 && post > 0 ? Math.max(0, pre - post) : 0
        const compactTitle = pre > 0 && post > 0
          ? `上下文已压缩：${pre} → ${post} tokens（减少 ${saved}）`
          : '上下文已压缩'
        const pendingSummary = tab._pendingCompactSummary || ''
        tab._pendingCompactSummary = ''
        pushMessage(tab, onNewMessage, { id: nextMsgId(), role: 'system', text: compactTitle, compactTitle, compactSummary: pendingSummary, expanded: false, _isCompact: true })
        if (post > 0 && onCompactBoundary) {
          onCompactBoundary(post)
        }
        throttledScrollBottom(tab.id, scrollBottom)
        return
      }

      if (subtype === 'compact_summary') {
        const raw = content?.find?.(b => b.type === 'text')?.text
          || msg.content
          || msg.compact_summary
          || ''
        const summary = raw.replace(/^压缩摘要：\n?/i, '').trim()
        if (summary) {
          tab._carryCompactSummary = summary
          const last = tab.messages[tab.messages.length - 1]
          if (last?._isCompact && !last.compactSummary) {
            last.compactSummary = summary
          } else {
            tab._pendingCompactSummary = summary
          }
        }
        return
      }

      // 新版 SDK 压缩状态：status: 'compacting' | 'requesting' | null
      if (subtype === 'status') {
        const sdkStatus = msg.status
        if (sdkStatus === 'compacting') {
          tab._compacting = true
          const existingCompact = tab.messages.find(m => m._isCompact && m._compacting)
          if (existingCompact) return
          tab.messages.push({
            id: nextMsgId(),
            role: 'system',
            text: '正在压缩上下文...',
            compactTitle: '正在压缩上下文',
            compactSummary: '',
            expanded: false,
            _isCompact: true,
            _compacting: true,
          })
          onNewMessage?.()
          throttledScrollBottom(tab.id, scrollBottom)
          return
        }
        if (msg.compact_result === 'failed') {
          const compactingMsg = tab.messages.find(m => m._isCompact && m._compacting)
          if (compactingMsg) {
            compactingMsg._compacting = false
            compactingMsg.text = '上下文压缩失败' + (msg.compact_error ? `：${msg.compact_error}` : '')
            compactingMsg.compactTitle = '上下文压缩失败'
          }
          tab._compacting = false
          throttledScrollBottom(tab.id, scrollBottom)
          return
        }
        if (msg.compact_result === 'success') {
          // compact 成功但尚未收到 compact_boundary 时的状态
          const compactingMsg = tab.messages.find(m => m._isCompact && m._compacting)
          if (compactingMsg) {
            compactingMsg.text = '上下文压缩完成，正在整理...'
          }
          return
        }
        // status: 'requesting' 等 → 不展示，过于频繁
        return
      }

      if (Array.isArray(content)) {
        text = content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      } else if (typeof msg.message === 'string') {
        text = msg.message
      }

      // 这些子类型永远不应出现在聊天中，无论是否有文本内容
      const alwaysFiltered = new Set([
      ])
      if (alwaysFiltered.has(subtype)) return

      if (subtype === 'init') {
        return
      } else if (!text) {
        const noisySubtypes = new Set([
          'token_count',
          'context_usage',
          'prompt_suggestion',
          'agent_progress',
          'tool_decision',
          'api_retry',
        ])
        if (noisySubtypes.has(subtype)) return
        return
      }

      if (text) {
        pushMessage(tab, onNewMessage, { id: nextMsgId(), role: 'system', text })
        throttledScrollBottom(tab.id, scrollBottom)
      }
    }

    // 流式过程中也保存（节流），避免用户中途关闭导致丢历史
    throttledSaveHistory(saveHistory)
    } finally {
      stopMsg()
    }
  }

  function onAgentPermission({ sessionId: chatKey, msg }) {
    const tab = tabs.value.find(t => t.sessionId === chatKey)
    if (!tab) return
    markClaudeStreamActivity(tab, msg)
    const toolName = msg.tool_name || msg.tool || 'permission'
    const requestId = msg.id || msg.request_id || msg.requestId || msg._requestId || null
    const input = msg.input || {}
    const filePath = input.path || input.file_path || ''
    const bashCmd = input.command || input.cmd || ''
    pushMessage(tab, onNewMessage, createToolMessage({
      toolName,
      status: 'pending',
      toolUseId: null,
      requestId,
      sessionId: chatKey,
      permDesc: msg.description || `是否允许 Claude 执行 ${toolName}？`,
      filePath,
      bashCmd,
      text: JSON.stringify(input, null, 2),
      newContent: '',
      diffLines: [],
      expanded: true,
    }))
    onPendingApproval?.()
    scrollBottom(tab.id)
  }

  function onAgentDone({ sessionId: chatKey, cliSessionId, filePath, reason = 'completed' }) {
    const tab = tabs.value.find(t => t.sessionId === chatKey)
    if (!tab) return
    if (cliSessionId) window.electronAPI.claudeRegisterCliSessions?.({ [chatKey]: cliSessionId })
    if (filePath) debugLog('agentDone', 'onAgentDone', { filePath })
    if (tab._awaitingCompactResult) {
      tab._awaitingCompactResult = false
      tab._pendingCompactSummary = ''
    }
    // 倒序查找 thinking 卡片，不走全量拷贝
    const msgs = tab.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking' && m.status === 'running') {
        m.status = 'done'
        break
      }
    }
    markClaudeDone(tab, { cliSessionId, filePath, reason })
    // T182: agent 完成后精准更新 fileSize，替代等扫描
    if (filePath) {
      window.electronAPI.claudeGetFileStat?.(filePath).then(stat => {
        if (stat && tab) tab.fileSize = stat.size
      }).catch(() => {})
    }
    if (reason !== 'completed') {
      markOpenToolsInterrupted(tab, reason)
      tab._sessionIntegrity = {
        ...(tab._sessionIntegrity || {}),
        hasDanglingToolUse: true,
        recommendedDoneReason: reason,
      }
      tab._hasDanglingToolRecovery = true
    }

    if (projects && getActiveProjectId) {
      const ownerProject = projects.value.find(p => (p.chats || []).some(c => c.sessionId === chatKey))
      if (ownerProject && reason === 'completed') {
        // 视觉提醒（任务栏闪烁 + Tab 高亮）：仅后台/非活跃项目时
        if (shouldNotifyOnTaskDone({
          ownerProjectId: ownerProject.id,
          activeProjectId: getActiveProjectId(),
          isPanelActive: isPanelActive?.value,
        })) {
          ownerProject.hasDoneNotification = true
          onBackgroundTaskDone?.()
          window.electronAPI?.flashTaskbar?.()
        }
      }
    }
    tab._taskToolUseIds = new Set()
    // 对话结束，截断旧消息
    trimMessages?.(tab)
    if (projects) {
      const ownerProject = projects.value.find(p => (p.chats || []).some(c => c.sessionId === chatKey))
      if (ownerProject?.chats) {
        sortChatsByRecencyInPlace(ownerProject.chats)
      }
    }
    scrollBottom(tab.id)
    // onAgentDone 是明确边界，立即保存
    saveHistory()
  }

  function onAgentAskQuestion({ sessionId: chatKey, requestId, questions }) {
    const tab = tabs.value.find(t => t.sessionId === chatKey)
    if (!tab) return
    markClaudeStreamActivity(tab, { type: 'ask_question' })
    pushMessage(tab, onNewMessage, createToolMessage({
      toolName: 'AskUserQuestion',
      status: 'pending',
      toolUseId: null,
      requestId,
      sessionId: chatKey,
      permDesc: '',
      filePath: '',
      bashCmd: '',
      text: JSON.stringify({ questions }, null, 2),
      newContent: '',
      diffLines: [],
      expanded: true,
    }))
    scrollBottom(tab.id)
  }

  // 主进程在流式首条消息时推送到此事件，提前告知 cliSessionId，
  // 让扫描器能精确匹配 pending chat 到对应的 JSONL 文件，无需盲猜
  function onEarlyCliSession({ sessionId: chatKey, cliSessionId }) {
    const tab = tabs.value.find(t => t.sessionId === chatKey)
    if (tab && !tab.cliSessionId) {
      tab._expectedCliSessionId = cliSessionId
    }
  }

  return {
    onAgentMessage,
    onAgentPermission,
    onAgentAskQuestion,
    onAgentDone,
    onEarlyCliSession,
  }
}
