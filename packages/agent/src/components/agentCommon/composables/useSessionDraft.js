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
    clearTimer()
    const chatKey = getChatKey(chat)
    const seq = ++loadSeq
    if (!chatKey) {
      setLocalDraft('')
      return ''
    }
    let text = ''
    try {
      const draft = await window.electronAPI?.getSessionDraft?.(chatKey)
      text = typeof draft?.text === 'string' ? draft.text : ''
    } catch (_) {
      text = ''
    }
    const currentChatKey = getChatKey(typeof getActiveChat === 'function' ? getActiveChat() : null)
    if (seq !== loadSeq || currentChatKey !== chatKey) return text
    if (!text) text = getLegacyDraft(chat)
    applyingRemote = true
    setLocalDraft(text)
    applyingRemote = false
    return text
  }

  async function persistDraftForChat(chat, text = readInputText(), { sync = false } = {}) {
    clearTimer()
    const chatKey = getChatKey(chat)
    if (!chatKey) return null
    const payload = {
      chatKey,
      draft: { text: typeof text === 'string' ? text : '' },
    }
    try {
      if (sync && typeof window.electronAPI?.setSessionDraftSync === 'function') {
        return window.electronAPI.setSessionDraftSync(payload)
      }
      return await window.electronAPI?.setSessionDraft?.(payload)
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
      return await window.electronAPI?.clearSessionDraft?.(chatKey)
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
