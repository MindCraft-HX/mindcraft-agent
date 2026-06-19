import { buildClaudePanelStatePayload } from '../utils/historyPersistenceSanitizer.mjs'
import { stripSystemContextTags } from '../../agentCommon/utils/helpers.js'
import { buildPersistableClaudeChat } from '../utils/claudeRuntimeState.mjs'

export function useClaudeHistory({
  projects,
  setProjects,
  getProjectCounter,
  setProjectCounter,
  getChatCounter,
  setChatCounter,
  getMsgId,
  setMsgId,
  makeRestoredChat,
  getActiveProjectId,
  setActiveProjectId,
  getActiveChatId,
  setActiveChatId,
}) {
  let lastProjectCwd = ''
  let historySaveTimer = null

  function isPureSystemContextMessage(message) {
    if (!message) return false

    const isSystemContextText = (text) => {
      const t = typeof text === 'string' ? text.trim() : ''
      if (!t) return false
      if (t === '[Request interrupted by user]') return true
      return stripSystemContextTags(t).length === 0
    }

    if (message.role === 'system' && isSystemContextText(message.text)) return true

    if (message.role !== 'user') return false

    if (isSystemContextText(message.text)) return true

    if (Array.isArray(message.content) && message.content.length > 0) {
      const hasRealBlock = message.content.some(block => {
        if (!block) return false
        if (block.type === 'text') return !isSystemContextText(block.text)
        return block.type === 'image' || block.type === 'file' || block.type === 'tool_result'
      })
      return !hasRealBlock
    }

    return false
  }

  function getLastProjectCwd() {
    return lastProjectCwd
  }

  function setLastProjectCwd(v) {
    lastProjectCwd = v || ''
  }

  function buildPanelStatePayload(opts = {}) {
    const { skipStreamingMessages = false } = opts
    const streamingIds = skipStreamingMessages
      ? new Set(projects.value.flatMap(p => p.chats || []).filter(t => t.thinking).map(t => t.sessionId))
      : new Set()
    return buildClaudePanelStatePayload({
      lastCwd: lastProjectCwd,
      activeProjectId: typeof getActiveProjectId === 'function' ? (getActiveProjectId() || null) : null,
      activeChatId: typeof getActiveChatId === 'function' ? (getActiveChatId() || null) : null,
      projects: projects.value.map(p => ({
        id: p.id,
        name: p.name,
        cwd: p.cwd,
        cwdLocked: Boolean(p.cwdLocked),
        hasDoneNotification: Boolean(p.hasDoneNotification),
        chats: p.chats || [],
      })),
      mapChat: c => {
        const persistable = buildPersistableClaudeChat(c)
        const isStreaming = streamingIds.has(c.sessionId)
        return {
          id: persistable.id,
          name: persistable.name,
          sessionId: persistable.sessionId,
          runMode: persistable.runMode,
          model: persistable.model || null,
          effort: persistable.effort || null,
          messages: isStreaming ? [] : persistable.filePath ? [] : (persistable.messages || []),
          cliSessionId: persistable.cliSessionId,
          filePath: persistable.filePath,
          createdAt: persistable.createdAt ?? null,
          updatedAt: persistable.updatedAt ?? null,
          fileSize: persistable.fileSize ?? null,
          titleSource: persistable.titleSource || '',
          _pendingSessionBinding: Boolean(persistable._pendingSessionBinding),
          _userRenamed: Boolean(persistable._userRenamed),
          taskState: persistable.taskState || null,
        }
      },
    })
  }

  function persistHistoryNow() {
    const payload = buildPanelStatePayload({ skipStreamingMessages: true })
    // JSON 序列化再反序列化：剥离 Vue 响应式代理、函数引用等非序列化对象
    // 避免 IPC 传输时抛出 "An object could not be cloned"
    try {
      const clean = JSON.parse(JSON.stringify(payload))
      void window.electronAPI?.claudeSaveCodePanelState?.(clean).catch(() => {})
    } catch (_) {}
  }

  function saveHistory({ immediate = false } = {}) {
    if (immediate) {
      if (historySaveTimer) {
        clearTimeout(historySaveTimer)
        historySaveTimer = null
      }
      persistHistoryNow()
      return
    }
    if (historySaveTimer) clearTimeout(historySaveTimer)
    historySaveTimer = setTimeout(() => {
      historySaveTimer = null
      persistHistoryNow()
    }, 2000)
  }

  function flushHistoryOnUnload() {
    if (historySaveTimer) {
      clearTimeout(historySaveTimer)
      historySaveTimer = null
    }
    // 关闭时保存全部消息（含流式中的），不跳过
    const payload = buildPanelStatePayload()
    try {
      window.electronAPI?.claudeSaveCodePanelStateSync?.(payload)
    } catch (_) {}
  }

  function normalizeMessagesForRestore(messages) {
    const restoredMessages = (Array.isArray(messages) ? messages : [])
      .filter(m => {
        if (m?.role === 'system' && typeof m?.text === 'string' && stripSystemContextTags(m.text).length === 0) {
          return false
        }
        if (isPureSystemContextMessage(m)) {
          return false
        }
        return true
      })
    restoredMessages.forEach(m => {
      if (m?.id > getMsgId()) setMsgId(m.id)
      // thinking 默认折叠，避免 CLS
      if (m?.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking') {
        m.expanded = false
      }
      // 读取文件默认折叠
      if (m?.role === 'tool' && (String(m.toolName || '').toLowerCase() === 'read' || String(m.toolName || '').toLowerCase() === 'readfile')) {
        m.expanded = false
      }
      if (m?.role === 'system' && (m.compactTitle || m.compactSummary) && !m._isCompact) {
        m._isCompact = true
        if (m.expanded === undefined) m.expanded = false
      }
    })
    return restoredMessages
  }

  function applyLoadedProjects(data) {
    if (!Array.isArray(data) || !data.length) return false

    const restoredProjects = data.map((p) => {
      const pNum = parseInt(String(p.id).replace('proj-', '')) || 0
      if (pNum > getProjectCounter()) setProjectCounter(pNum)

      const chats = Array.isArray(p.chats) ? p.chats : []
      const filteredChats = chats.filter(c => !c?.filePath || !c.filePath.includes('subagents'))
      const restoredChats = filteredChats.map((c) => {
        const cNum = parseInt(String(c.id).replace('chat-', '')) || 0
        if (cNum > getChatCounter()) setChatCounter(cNum)

        const restoredMessages = normalizeMessagesForRestore(c.messages)
        return makeRestoredChat(c, restoredMessages)
      })

      return {
        id: p.id,
        name: p.name,
        cwd: p.cwd || '',
        cwdLocked: Boolean(p.cwdLocked),
        hasDoneNotification: Boolean(p.hasDoneNotification),
        chats: restoredChats,
      }
    })

    setProjects(restoredProjects)
    return true
  }

  async function loadHistory() {
    try {
      const remote = await window.electronAPI?.claudeLoadCodePanelState?.()
      if (!remote?.projects?.length) return false
      lastProjectCwd = remote.lastCwd || ''
      const sanitized = buildClaudePanelStatePayload({
        lastCwd: lastProjectCwd,
        activeProjectId: remote.activeProjectId || null,
        activeChatId: remote.activeChatId || null,
        projects: remote.projects,
      })
      const loaded = applyLoadedProjects(sanitized.projects)
      if (loaded) {
        if (typeof setActiveProjectId === 'function') {
          setActiveProjectId(sanitized.activeProjectId || null)
        }
        if (typeof setActiveChatId === 'function') {
          setActiveChatId(sanitized.activeChatId || null)
        }
      }
      return loaded
    } catch (_) {
      return false
    }
  }

  return {
    getLastProjectCwd,
    setLastProjectCwd,
    saveHistory,
    flushHistoryOnUnload,
    loadHistory,
  }
}
