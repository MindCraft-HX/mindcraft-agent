import { useAgentHistory } from '../../agentCommon/composables/useAgentHistory.js'
import { createClaudeHistoryAdapter } from '../../agentCommon/composables/historyProviderAdapter.mjs'
import { buildClaudePanelStatePayload } from '../utils/historyPersistenceSanitizer.mjs'
import { buildPersistableClaudeChat } from '../utils/claudeRuntimeState.mjs'
import { stripSystemContextTags } from '../../agentCommon/utils/helpers.js'
import { isClaudeMetaUserPromptMessage } from '../utils/internalPromptFilter.mjs'

/**
 * ClaudeCode history persistence — thin wrapper around shared useAgentHistory.
 * The adapter injects ClaudeCode-specific serialization (buildClaudePanelStatePayload),
 * message normalization (stripSystemContextTags, isClaudeMetaUserPromptMessage),
 * panel-state sanitization on load, and IPC (claudeSaveCodePanelState / claudeLoadCodePanelState).
 *
 * Signature and return value preserved for backward compatibility with claudeCode/index.vue.
 * NOTE: The shared composable returns `flushOnUnload`, renamed here to `flushHistoryOnUnload`
 *       to match the existing consumer destructuring in claudeCode/index.vue.
 */
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
  const adapter = createClaudeHistoryAdapter({
    buildClaudePanelStatePayload,
    buildPersistableClaudeChat,
    stripSystemContextTags,
    isClaudeMetaUserPromptMessage,
  })

  const shared = useAgentHistory({
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
    getActiveProjectId,
    setActiveProjectId,
    getActiveChatId,
    setActiveChatId,
  })

  return {
    getLastProjectCwd: shared.getLastProjectCwd,
    setLastProjectCwd: shared.setLastProjectCwd,
    saveHistory: shared.saveHistory,
    flushHistoryOnUnload: shared.flushOnUnload,   // rename for backward compatibility
    loadHistory: shared.loadHistory,
  }
}
