import { useAgentTabs } from '../../agentCommon/composables/useAgentTabs.js'
import { createCodexTabAdapter } from '../../agentCommon/composables/tabProviderAdapter.mjs'

/**
 * CodeX tab management — thin wrapper around shared useAgentTabs.
 * The adapter injects CodeX-specific tab shape, session-id prefix, and abort IPC.
 *
 * Signature and return value preserved for backward compatibility with codeX/index.vue.
 */
export function useCodexTabs({
  tabs, activeId, inputEl, confirmDialogRef, saveHistory,
  scrollBottom, setupHistoryTopObserver, getLastProjectCwd, nextTabId,
}) {
  const adapter = createCodexTabAdapter({ getLastProjectCwd })

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
