import { ref, watch } from 'vue'

/**
 * Input history composable — bash-style ↑↓ recall of previously sent messages.
 *
 * Usage in a component:
 *   const { browsing, historyIdx, savedDraft, handleHistoryKeydown, pushToHistory, resetHistory } = useInputHistory()
 *
 *   // In onKeydown (after IME/suggestion panel checks):
 *   const consumed = handleHistoryKeydown(e, textareaEl, tab.inputHistory, (val) => { inputText.value = val })
 *   if (consumed) return
 *
 *   // On send:
 *   pushToHistory(trimmedText, tab.inputHistory)
 *
 *   // On session switch:
 *   resetHistory()
 */

export function useInputHistory() {
  const browsing = ref(false)
  const historyIdx = ref(-1)
  const savedDraft = ref('')

  /** Reset all state (call on session switch) */
  function resetHistory() {
    browsing.value = false
    historyIdx.value = -1
    savedDraft.value = ''
  }

  /** 0-based line number of cursor */
  function getCursorLine(el) {
    if (!el) return 0
    const val = typeof el.value === 'string' ? el.value : ''
    return val.substring(0, el.selectionStart).split('\n').length - 1
  }

  /** Push text to history array (dedup consecutive, max 5). Mutates the array. */
  function pushToHistory(text, history) {
    if (!Array.isArray(history)) return
    const t = String(text || '').trim()
    if (!t) return
    if (history[0] === t) return // dedup consecutive
    history.unshift(t)
    if (history.length > 5) history.length = 5
    // reset browsing state
    browsing.value = false
    historyIdx.value = -1
    savedDraft.value = ''
  }

  /**
   * Handle ArrowUp/ArrowDown/Escape for history navigation.
   * @param {KeyboardEvent} e
   * @param {HTMLTextAreaElement} el
   * @param {string[]} history - the chat's inputHistory array
   * @param {(val: string) => void} onUpdate - callback to set inputText
   * @returns {boolean} true if the event was consumed
   */
  function handleHistoryKeydown(e, el, history, onUpdate) {
    // Only intercept when no modifier keys (except Shift for native newline)
    if (e.ctrlKey || e.metaKey || e.altKey) return false

    if (e.key === 'Escape') {
      if (browsing.value) {
        e.preventDefault()
        onUpdate(savedDraft.value)
        resetHistory()
        return true
      }
      return false
    }

    if (e.key === 'ArrowUp') {
      // If not browsing and not at first line, let native cursor movement happen
      if (!browsing.value && getCursorLine(el) > 0) return false

      e.preventDefault()

      if (!browsing.value) {
        // Enter history mode
        savedDraft.value = typeof el.value === 'string' ? el.value : ''
        if (!Array.isArray(history) || history.length === 0) return true
        browsing.value = true
        historyIdx.value = 0
        onUpdate(history[0])
        return true
      }

      // Already browsing: go further back
      if (!Array.isArray(history) || historyIdx.value >= history.length - 1) return true
      historyIdx.value++
      onUpdate(history[historyIdx.value])
      return true
    }

    if (e.key === 'ArrowDown') {
      if (!browsing.value) return false

      e.preventDefault()

      if (historyIdx.value <= 0) {
        // Going past the most recent: restore saved draft and exit
        onUpdate(savedDraft.value)
        resetHistory()
        return true
      }

      historyIdx.value--
      onUpdate(history[historyIdx.value])
      return true
    }

    // Any other key while browsing → exit history mode, keep current edit
    if (browsing.value) {
      browsing.value = false
      historyIdx.value = -1
      // Don't consume the event — let the key through for typing
    }

    return false
  }

  return {
    browsing,
    historyIdx,
    savedDraft,
    getCursorLine,
    handleHistoryKeydown,
    pushToHistory,
    resetHistory,
  }
}
