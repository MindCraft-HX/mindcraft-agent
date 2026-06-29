import { useAgentHistory } from '../../agentCommon/composables/useAgentHistory.js'
import { createCodexHistoryAdapter } from '../../agentCommon/composables/historyProviderAdapter.mjs'
import { buildPersistableCodexChat } from '../utils/codexRuntimeState.mjs'
import { shouldPersistInlineMessages, shouldRestoreInlineMessages } from '../utils/historyLoadSafety.mjs'
import { isMeaningfulCodexLocalDraft } from '../../agentCommon/utils/codexEmptyDraft.mjs'
import { stripSystemContextTags } from '../../agentCommon/utils/helpers.js'
import { isVisibleCodexUserMessage } from '../utils/visibleUserMessages.mjs'

/**
 * CodeX history persistence — thin wrapper around shared useAgentHistory.
 * The adapter injects CodeX-specific serialization (buildPersistableCodexChat),
 * message normalization (filterMessage), chat deduplication/sorting,
 * ghost chat detection (isSuspiciousSlashChat), draft filtering (isMeaningfulCodexLocalDraft),
 * and IPC (codexSaveCodePanelState / codexLoadCodePanelState).
 *
 * Signature and return value preserved for backward compatibility with codeX/index.vue.
 */
export function useCodexHistory({
  projects,
  setProjects,
  getProjectCounter,
  setProjectCounter,
  getChatCounter,
  setChatCounter,
  getMsgId,
  setMsgId,
  makeRestoredChat,
  filterMessage,
}) {
  // ── Inline helpers (locally-scoped, same as original) ──────────────

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

  // ── Adapter ────────────────────────────────────────────────────────

  const adapter = createCodexHistoryAdapter({
    buildPersistableCodexChat,
    shouldPersistInlineMessages,
    shouldRestoreInlineMessages,
    isSuspiciousSlashChat,
    isMeaningfulCodexLocalDraft,
    filterMessage,
  })

  return useAgentHistory({
    adapter,
    projects,
    setProjects,
    getProjectCounter,
    setProjectCounter,
    getChatCounter,
    setChatCounter,
    getMsgId,
    setMsgId,
    makeRestoredChat,
  })
}
