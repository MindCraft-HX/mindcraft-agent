import { useAgentTabs } from '../../agentCommon/composables/useAgentTabs.js'
import { createClaudeTabAdapter } from '../../agentCommon/composables/tabProviderAdapter.mjs'

/**
 * ClaudeCode tab management — thin wrapper around shared useAgentTabs.
 * The adapter injects ClaudeCode-specific tab shape (runMode, session- prefix),
 * abort IPC (claudeAgentAbort), and directory selection (claudeSelectDirectory).
 *
 * Signature and return value preserved for backward compatibility with claudeCode/index.vue.
 */
export function useClaudeTabs({
  tabs,
  activeId,
  inputEl,
  confirmDialogRef,
  saveHistory,
  scrollBottom,
  setupHistoryTopObserver,
  getLastProjectCwd,
  setLastProjectCwd,
  nextTabId,
}) {
  const adapter = createClaudeTabAdapter({
    getLastProjectCwd,
    setLastProjectCwd,
    scrollBottom,
    saveHistory,
  })

  return useAgentTabs({
    adapter,
    tabs,
    activeId,
    inputEl,
    confirmDialogRef,
    saveHistory,
    scrollBottom,
    setupHistoryTopObserver,
    getLastProjectCwd,
    nextTabId,
  })
}
