import { shouldPersistInlineMessages, shouldRestoreInlineMessages } from '../utils/historyLoadSafety.mjs'
import { stripSystemContextTags } from '../../agentCommon/utils/helpers.js'
import { buildPersistableCodexChat } from '../utils/codexRuntimeState.mjs'
import { isVisibleCodexUserMessage } from '../utils/visibleUserMessages.mjs'

export function useCodexHistory({
  projects, setProjects, getProjectCounter, setProjectCounter,
  getChatCounter, setChatCounter, getMsgId, setMsgId, makeRestoredChat,
  filterMessage,
}) {
  let lastProjectCwd = ''
  let historySaveTimer = null

  function normalizePath(v) {
    return String(v || '').replace(/\\/g, '/')
  }

  /**
   * 检测从面板状态恢复的"幽灵"会话：
   * - 名称为 "/" 且无有效用户消息（仅有 "/" 或为空）
   * - 名称为 "/" 且消息中疑似系统上下文泄漏（AGENTS.md / environment_context）
   *
   * 注意：仅匹配 name === '/' 的会话，正常重命名的会话不受影响。
   * chatId 格式为 "chat-{counter}"（非 UUID），无法与 cliSessionId / filePath UUID 做精确比对，
   * 因此不在此处做 ID 一致性检查——该检查由 loadProjectChatsFromCodexSessions 负责。
   */
  function isSuspiciousSlashChat(rawChat, messages) {
    const name = String(rawChat?.name || '').trim()
    if (name !== '/') return false
    const arr = Array.isArray(messages) ? messages : []
    if (!arr.length) return true
    const userTexts = arr
      .filter(isVisibleCodexUserMessage)
      .map(m => String(m?.text || '').trim())
      .filter(Boolean)
    if (!userTexts.length) return true
    const hasSlashOnly = userTexts.some(t => t === '/')
    const hasContextLeak = userTexts.some(t => stripSystemContextTags(t).length === 0)
    return hasSlashOnly || hasContextLeak
  }

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

  function getLastProjectCwd() { return lastProjectCwd }
  function setLastProjectCwd(v) { lastProjectCwd = v || '' }

  function buildPanelState(opts = {}) {
    const { skipStreaming = false } = opts
    const streamingIds = skipStreaming
      ? new Set(projects.value.flatMap(p => (p.chats || []).filter(t => t.thinking || t._awaitingDone).map(t => t.sessionId)))
      : new Set()
    return {
      lastCwd: lastProjectCwd,
      projects: projects.value.map(p => ({
        id: p.id, name: p.name, cwd: p.cwd, cwdLocked: Boolean(p.cwdLocked), hasDoneNotification: Boolean(p.hasDoneNotification),
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
  }

  // P2-4：even immediate saves get a short cooldown to batch rapid-fire calls during streaming
  let _lastPersistMs = 0
  const IMMEDIATE_COOLDOWN_MS = 500

  function persistNow() {
    const now = Date.now()
    if (now - _lastPersistMs < IMMEDIATE_COOLDOWN_MS) return
    _lastPersistMs = now
    const payload = buildPanelState({ skipStreaming: true })
    try {
      const clean = JSON.parse(JSON.stringify(payload))
      void window.electronAPI?.codexSaveCodePanelState?.(clean).catch(() => {})
    } catch (_) {}
  }

  function saveHistory({ immediate = false } = {}) {
    if (immediate) {
      if (historySaveTimer) { clearTimeout(historySaveTimer); historySaveTimer = null }
      persistNow(); return
    }
    if (historySaveTimer) clearTimeout(historySaveTimer)
    historySaveTimer = setTimeout(() => { historySaveTimer = null; persistNow() }, 2000)
  }

  function flushOnUnload() {
    if (historySaveTimer) { clearTimeout(historySaveTimer); historySaveTimer = null }
    try { window.electronAPI?.codexSaveCodePanelStateSync?.(buildPanelState({ skipStreaming: true })) } catch (_) {}
  }

  function normalizeMessages(messages) {
    const arr = Array.isArray(messages) ? messages : []
    // 过滤系统上下文消息（AGENTS.md / environment_context / system-reminder 等），防止从面板状态恢复时泄漏到用户气泡
    const filtered = typeof filterMessage === 'function' ? filterMessage(arr) : arr
    filtered.forEach(m => { if (m?.id > getMsgId()) setMsgId(m.id) })
    // 恢复 compact 消息标记
    filtered.forEach(m => {
      if (m?.role === 'system' && m?.compactTitle && !m?._isCompact) {
        m._isCompact = true
      }
    })
    return filtered
  }

  function applyProjects(data) {
    if (!Array.isArray(data) || !data.length) return false
    const restored = data.map(p => {
      const pNum = parseInt(String(p.id).replace('proj-', '')) || 0
      if (pNum > getProjectCounter()) setProjectCounter(pNum)
      const chats = dedupeRestoredChats((Array.isArray(p.chats) ? p.chats : [])
        .filter(c => !c?.filePath || !c.filePath.includes('subagents'))
        .map(c => {
          const cNum = parseInt(String(c.id).replace('chat-', '')) || 0
          if (cNum > getChatCounter()) setChatCounter(cNum)
          const messages = shouldRestoreInlineMessages(c) ? normalizeMessages(c.messages) : []
          if (isSuspiciousSlashChat(c, messages)) return null
          const restoredChat = makeRestoredChat(c, messages)
          restoredChat._restoredFromPanelState = true
          restoredChat._resumeAllowed = c._resumeAllowed !== false
          return restoredChat
        })
        .filter(Boolean)
      )
        .sort((a, b) => getChatSortTime(b) - getChatSortTime(a))
      const locked = Boolean(p.cwdLocked)
      console.log('[codex-history] applyProjects: restoring project', p.id, 'cwd=', p.cwd, 'cwdLocked=', locked, 'raw=', p.cwdLocked)
      return { id: p.id, name: p.name, cwd: p.cwd || '', cwdLocked: locked, hasDoneNotification: Boolean(p.hasDoneNotification), additionalDirectories: p.additionalDirectories || [], chats }
    })
    setProjects(restored)
    return true
  }

  async function loadHistory() {
    try {
      const remote = await window.electronAPI?.codexLoadCodePanelState?.()
      if (!remote?.projects?.length) return false
      lastProjectCwd = remote.lastCwd || ''
      return applyProjects(remote.projects)
    } catch (_) { return false }
  }

  return { getLastProjectCwd, setLastProjectCwd, saveHistory, flushOnUnload, loadHistory }
}
