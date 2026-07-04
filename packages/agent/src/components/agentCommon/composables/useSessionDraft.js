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
} = {}) {
  let timer = null
  let applyingRemote = false
  let loadSeq = 0
  const _draftCache = new Map()

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
    const stop = perfStart('sessionDraft.loadDraftForChat')
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
      stopWall = perfStart('sessionDraft.getSessionDraft.wall')
      const draft = await window.electronAPI?.getSessionDraft?.(chatKey)
      if (stopWall) { stopWall(); stopWall = null }
      text = typeof draft?.text === 'string' ? draft.text : ''
      _draftCache.set(chatKey, { text, updatedAt: draft?.updatedAt || 0 })
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
    stopApply = perfStart('sessionDraft.getSessionDraft.apply')
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
      _draftCache.set(chatKey, { text: safeText, updatedAt: Date.now() })
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
