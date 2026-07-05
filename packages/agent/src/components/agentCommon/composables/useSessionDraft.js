import { perfStart } from '../utils/rendererPerfProbe.mjs'

const DEFAULT_DRAFT_SAVE_DEBOUNCE_MS = 750

function getChatKey(chat) {
  return typeof chat?.sessionId === 'string' ? chat.sessionId : ''
}

function getLegacyDraft(chat) {
  return typeof chat?.draftText === 'string' ? chat.draftText : ''
}

export function useSessionDraft({
  inputText,
  getActiveChat,
  debounceMs = DEFAULT_DRAFT_SAVE_DEBOUNCE_MS,
  labelPrefix = '',
} = {}) {
  let timer = null
  let applyingRemote = false
  let loadSeq = 0
  const _draftCache = new Map()
  // T183 Phase 0: bound cache to prevent unbounded growth across many sessions
  const DRAFT_CACHE_MAX = 200
  function _draftCacheSet(key, value) {
    if (_draftCache.size >= DRAFT_CACHE_MAX && !_draftCache.has(key)) {
      // LRU eviction: delete oldest entry (Map iteration is insertion-ordered)
      const oldest = _draftCache.keys().next().value
      _draftCache.delete(oldest)
    }
    _draftCache.set(key, value)
  }
  const L = labelPrefix // short alias for label interpolation

  function clearTimer() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  function setLocalDraft(value) {
    inputText.value = typeof value === 'string' ? value : ''
  }

  function readInputText() {
    return typeof inputText?.value === 'string' ? inputText.value : ''
  }

  async function loadDraftForChat(chat) {
    const stop = perfStart(`${L}sessionDraft.loadDraftForChat`)
    clearTimer()
    const chatKey = getChatKey(chat)
    const seq = ++loadSeq
    if (!chatKey) {
      setLocalDraft('')
      stop()
      return ''
    }
    const cached = _draftCache.get(chatKey)
    if (cached) {
      stop({ cacheHit: 1 })
      const currentChatKey = getChatKey(typeof getActiveChat === 'function' ? getActiveChat() : null)
      if (seq !== loadSeq || currentChatKey !== chatKey) return cached.text
      let text = cached.text
      if (!text) text = getLegacyDraft(chat)
      applyingRemote = true
      setLocalDraft(text)
      applyingRemote = false
      return text
    }
    // 缓存未命中，走 IPC
    let text = ''
    let stopWall, stopApply
    try {
      stopWall = perfStart(`${L}sessionDraft.getSessionDraft.wall`)
      const draft = await window.electronAPI?.getSessionDraft?.(chatKey)
      if (stopWall) { stopWall(); stopWall = null }
      text = typeof draft?.text === 'string' ? draft.text : ''
      _draftCacheSet(chatKey, { text, updatedAt: draft?.updatedAt || 0 })
    } catch (_) {
      text = ''
    }
    const currentChatKey = getChatKey(typeof getActiveChat === 'function' ? getActiveChat() : null)
    if (seq !== loadSeq || currentChatKey !== chatKey) {
      if (stopWall) stopWall()
      stop({ cacheHit: 0 })
      return text
    }
    if (!text) text = getLegacyDraft(chat)
    stopApply = perfStart(`${L}sessionDraft.getSessionDraft.apply`)
    applyingRemote = true
    setLocalDraft(text)
    applyingRemote = false
    if (stopApply) { stopApply(); stopApply = null }
    stop({ cacheHit: 0 })
    return text
  }

  async function persistDraftForChat(chat, text = readInputText(), { sync = false } = {}) {
    clearTimer()
    const chatKey = getChatKey(chat)
    if (!chatKey) return null
    const safeText = typeof text === 'string' ? text : ''
    const payload = {
      chatKey,
      draft: { text: safeText },
    }
    try {
      let result
      if (sync && typeof window.electronAPI?.setSessionDraftSync === 'function') {
        result = window.electronAPI.setSessionDraftSync(payload)
      } else {
        result = await window.electronAPI?.setSessionDraft?.(payload)
      }
      _draftCacheSet(chatKey, { text: safeText, updatedAt: Date.now() })
      return result
    } catch (_) {
      return null
    }
  }

  function persistActiveDraftNow() {
    const chat = typeof getActiveChat === 'function' ? getActiveChat() : null
    return persistDraftForChat(chat, readInputText(), { sync: true })
  }

  function scheduleActiveDraftPersist() {
    if (applyingRemote) return
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      const chat = typeof getActiveChat === 'function' ? getActiveChat() : null
      void persistDraftForChat(chat)
    }, debounceMs)
  }

  async function clearDraftForChat(chat) {
    clearTimer()
    const chatKey = getChatKey(chat)
    if (!chatKey) return null
    try {
      const result = await window.electronAPI?.clearSessionDraft?.(chatKey)
      _draftCache.delete(chatKey)
      return result
    } catch (_) {
      return null
    }
  }

  function dispose() {
    clearTimer()
  }

  return {
    clearDraftForChat,
    clearTimer,
    dispose,
    loadDraftForChat,
    persistActiveDraftNow,
    persistDraftForChat,
    scheduleActiveDraftPersist,
  }
}
