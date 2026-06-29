/**
 * History Provider Adapter — contract definition for useAgentHistory.
 *
 * A history adapter isolates provider-specific panel-state serialization,
 * message normalization, IPC save/load paths, and project/chat restore rules.
 *
 * The shared useAgentHistory composable consumes an adapter implementing:
 *
 *   {
 *     buildPanelState: ({ projects, lastCwd, skipStreaming }) => object,
 *     normalizeMessages: (messages: Array, setMsgId: (n: number) => void) => Array,
 *     applyProjects: (data: Array, ctx: {
 *       setProjects, getProjectCounter, setProjectCounter,
 *       getChatCounter, setChatCounter, makeRestoredChat
 *     }) => boolean,
 *     saveAsync: (payload: object) => Promise<void>,
 *     saveSync: (payload: object) => void,
 *     loadRemote: () => Promise<object|null>,
 *   }
 */

import { createSaveCooldownGuard, filterSubagentChats } from '../utils/historyHelpers.mjs'

// ── ClaudeCode adapter ────────────────────────────────────────────

/**
 * Create a ClaudeCode history provider adapter.
 *
 * Wraps the existing useClaudeHistory internal logic into the shared adapter contract.
 * This adapter is used by useAgentHistory to provide ClaudeCode-specific behavior.
 *
 * @param {object} deps
 * @param {Function} deps.buildClaudePanelStatePayload - from historyPersistenceSanitizer
 * @param {Function} deps.buildPersistableClaudeChat - from claudeRuntimeState
 * @param {Function} deps.stripSystemContextTags - from helpers
 * @param {Function} deps.isClaudeMetaUserPromptMessage - from internalPromptFilter
 * @returns {object} adapter for useAgentHistory
 */
export function createClaudeHistoryAdapter({
  buildClaudePanelStatePayload,
  buildPersistableClaudeChat,
  stripSystemContextTags,
  isClaudeMetaUserPromptMessage,
}) {
  const cooldownGuard = createSaveCooldownGuard(500)

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

  return {
    // Build panel state payload for IPC save
    buildPanelState({ projects, lastCwd, skipStreaming, activeProjectId, activeChatId }) {
      const streamingIds = skipStreaming
        ? new Set(projects.flatMap(p => (p.chats || []).filter(t => t.thinking).map(t => t.sessionId)))
        : new Set()

      return buildClaudePanelStatePayload({
        lastCwd,
        activeProjectId: activeProjectId || null,
        activeChatId: activeChatId || null,
        projects: projects.map(p => ({
          id: p.id, name: p.name, cwd: p.cwd,
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
    },

    // Normalize messages for restore — filters context + sets defaults
    normalizeMessages(messages, getMsgId, setMsgId) {
      const restored = (Array.isArray(messages) ? messages : [])
        .filter(m => {
          if (m?.role === 'system' && typeof m?.text === 'string' && stripSystemContextTags(m.text).length === 0) return false
          if (isPureSystemContextMessage(m)) return false
          if (isClaudeMetaUserPromptMessage(m)) return false
          return true
        })

      restored.forEach(m => {
        if (m?.id > getMsgId()) setMsgId(m.id)
        if (m?.role === 'tool' && String(m.toolName || '').toLowerCase() === 'thinking') m.expanded = false
        if (m?.role === 'tool' && (String(m.toolName || '').toLowerCase() === 'read' || String(m.toolName || '').toLowerCase() === 'readfile')) m.expanded = false
        if (m?.role === 'system' && (m.compactTitle || m.compactSummary) && !m._isCompact) {
          m._isCompact = true
          if (m.expanded === undefined) m.expanded = false
        }
      })

      return restored
    },

    // Apply loaded projects to state (receives full remote object)
    applyProjects(remote, { setProjects, getProjectCounter, setProjectCounter, getChatCounter, setChatCounter, makeRestoredChat, getMsgId, setMsgId }) {
      const rawProjects = Array.isArray(remote?.projects) ? remote.projects : []
      if (!rawProjects.length) return false

      // ClaudeCode sanitizes through buildClaudePanelStatePayload before applying
      const sanitized = buildClaudePanelStatePayload({
        lastCwd: remote.lastCwd || '',
        activeProjectId: remote.activeProjectId || null,
        activeChatId: remote.activeChatId || null,
        projects: rawProjects,
      })
      const data = sanitized.projects

      const restored = data.map(p => {
        const pNum = parseInt(String(p.id).replace('proj-', '')) || 0
        if (pNum > getProjectCounter()) setProjectCounter(pNum)

        const chats = filterSubagentChats(Array.isArray(p.chats) ? p.chats : [])
        const restoredChats = chats.map(c => {
          const cNum = parseInt(String(c.id).replace('chat-', '')) || 0
          if (cNum > getChatCounter()) setChatCounter(cNum)
          const restoredMessages = this.normalizeMessages(c.messages, getMsgId, setMsgId)
          return makeRestoredChat(c, restoredMessages)
        })

        return {
          id: p.id, name: p.name, cwd: p.cwd || '',
          cwdLocked: Boolean(p.cwdLocked), hasDoneNotification: Boolean(p.hasDoneNotification),
          chats: restoredChats,
        }
      })

      setProjects(restored)
      return { loaded: true, activeProjectId: sanitized.activeProjectId || null, activeChatId: sanitized.activeChatId || null }
    },
    async saveAsync(payload) {
      if (cooldownGuard()) return
      try {
        const clean = JSON.parse(JSON.stringify(payload))
        await window.electronAPI?.claudeSaveCodePanelState?.(clean)
      } catch (_) {}
    },

    // IPC save (sync, on unload)
    saveSync(payload) {
      try {
        window.electronAPI?.claudeSaveCodePanelStateSync?.(payload)
      } catch (_) {}
    },

    // IPC load
    async loadRemote() {
      try {
        return await window.electronAPI?.claudeLoadCodePanelState?.()
      } catch (_) {
        return null
      }
    },

    // ClaudeCode flushOnUnload does NOT skip streaming messages
    flushSkipsStreaming: false,
  }
}

// ── CodeX adapter ─────────────────────────────────────────────────

/**
 * Create a CodeX history provider adapter.
 *
 * @param {object} deps
 * @param {Function} deps.buildPersistableCodexChat - from codexRuntimeState
 * @param {Function} deps.shouldPersistInlineMessages - from historyLoadSafety
 * @param {Function} deps.shouldRestoreInlineMessages - from historyLoadSafety
 * @param {Function} deps.isSuspiciousSlashChat - internal ghost-detection
 * @param {Function} deps.isMeaningfulCodexLocalDraft - from codexEmptyDraft
 * @param {Function} deps.filterMessage - provider-specific message filter
 * @returns {object} adapter for useAgentHistory
 */
export function createCodexHistoryAdapter({
  buildPersistableCodexChat,
  shouldPersistInlineMessages,
  shouldRestoreInlineMessages,
  isSuspiciousSlashChat,
  isMeaningfulCodexLocalDraft,
  filterMessage,
}) {
  const cooldownGuard = createSaveCooldownGuard(500)

  function scoreRestoredChat(chat) {
    const messagesCount = Array.isArray(chat?.messages) ? chat.messages.length : 0
    const hasFile = chat?.filePath ? 1 : 0
    const updatedAt = new Date(chat?.updatedAt || chat?.createdAt || 0).getTime() || 0
    return (messagesCount * 1000) + (hasFile * 100) + updatedAt
  }

  function dedupeRestoredChats(chats) {
    const byId = new Map()
    for (const chat of chats) {
      const key = String(chat?.id || '')
      if (!key) continue
      const prev = byId.get(key)
      if (!prev || scoreRestoredChat(chat) >= scoreRestoredChat(prev)) {
        byId.set(key, chat)
      }
    }
    return Array.from(byId.values())
  }

  function getChatSortTime(chat) {
    const value = chat?.updatedAt || chat?.createdAt
    if (!value) return 0
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : 0
  }

  return {
    buildPanelState({ projects, lastCwd, skipStreaming }) {
      const streamingIds = skipStreaming
        ? new Set(projects.flatMap(p => (p.chats || []).filter(t => t.thinking || t._awaitingDone).map(t => t.sessionId)))
        : new Set()

      return {
        lastCwd,
        projects: projects.map(p => ({
          id: p.id, name: p.name, cwd: p.cwd,
          cwdLocked: Boolean(p.cwdLocked), hasDoneNotification: Boolean(p.hasDoneNotification),
          additionalDirectories: p.additionalDirectories || [],
          chats: (p.chats || []).map(c => {
            const persistable = buildPersistableCodexChat(c)
            return {
              id: persistable.id, name: persistable.name, sessionId: persistable.sessionId,
              messages: streamingIds.has(c.sessionId) || !shouldPersistInlineMessages(c) ? [] : (persistable.messages || []),
              metrics: persistable.metrics || null,
              model: persistable.model || null,
              reasoningEffort: persistable.reasoningEffort || null,
              sandboxMode: persistable.sandboxMode || null,
              networkAccessEnabled: typeof persistable.networkAccessEnabled === 'boolean' ? persistable.networkAccessEnabled : null,
              webSearchMode: persistable.webSearchMode || null,
              _thinkingStart: persistable._thinkingStart,
              _awaitingDone: persistable._awaitingDone,
              cliSessionId: persistable.cliSessionId, filePath: persistable.filePath,
              createdAt: persistable.createdAt ?? null, updatedAt: persistable.updatedAt ?? null, fileSize: persistable.fileSize ?? null,
              titleSource: persistable.titleSource || '',
              _userRenamed: Boolean(persistable._userRenamed),
              _resumeAllowed: persistable._resumeAllowed !== false,
            }
          }),
        })),
      }
    },

    normalizeMessages(messages, getMsgId, setMsgId) {
      const arr = Array.isArray(messages) ? messages : []
      const filtered = typeof filterMessage === 'function' ? filterMessage(arr) : arr
      filtered.forEach(m => { if (m?.id > getMsgId()) setMsgId(m.id) })
      filtered.forEach(m => {
        if (m?.role === 'system' && m?.compactTitle && !m?._isCompact) {
          m._isCompact = true
        }
      })
      return filtered
    },

    applyProjects(remote, { setProjects, getProjectCounter, setProjectCounter, getChatCounter, setChatCounter, makeRestoredChat, getMsgId, setMsgId }) {
      const data = Array.isArray(remote?.projects) ? remote.projects : []
      if (!data.length) return false

      const restored = data.map(p => {
        const pNum = parseInt(String(p.id).replace('proj-', '')) || 0
        if (pNum > getProjectCounter()) setProjectCounter(pNum)

        const chats = dedupeRestoredChats(filterSubagentChats(Array.isArray(p.chats) ? p.chats : [])
          .map(c => {
            const cNum = parseInt(String(c.id).replace('chat-', '')) || 0
            if (cNum > getChatCounter()) setChatCounter(cNum)
            const messages = shouldRestoreInlineMessages(c) ? this.normalizeMessages(c.messages, getMsgId, setMsgId) : []
            if (isSuspiciousSlashChat(c, messages)) return null
            if (!isMeaningfulCodexLocalDraft(c, messages)) return null
            const restoredChat = makeRestoredChat(c, messages)
            restoredChat._restoredFromPanelState = true
            restoredChat._resumeAllowed = c._resumeAllowed !== false
            return restoredChat
          })
          .filter(Boolean))
          .sort((a, b) => getChatSortTime(b) - getChatSortTime(a))

        return {
          id: p.id, name: p.name, cwd: p.cwd || '',
          cwdLocked: Boolean(p.cwdLocked), hasDoneNotification: Boolean(p.hasDoneNotification),
          additionalDirectories: p.additionalDirectories || [],
          chats,
        }
      })

      setProjects(restored)
      return { loaded: true }
    },

    async saveAsync(payload) {
      if (cooldownGuard()) return
      try {
        const clean = JSON.parse(JSON.stringify(payload))
        await window.electronAPI?.codexSaveCodePanelState?.(clean)
      } catch (_) {}
    },

    saveSync(payload) {
      try {
        window.electronAPI?.codexSaveCodePanelStateSync?.(payload)
      } catch (_) {}
    },

    async loadRemote() {
      try {
        return await window.electronAPI?.codexLoadCodePanelState?.()
      } catch (_) {
        return null
      }
    },

    // CodeX flushOnUnload DOES skip streaming messages
    flushSkipsStreaming: true,
  }
}
