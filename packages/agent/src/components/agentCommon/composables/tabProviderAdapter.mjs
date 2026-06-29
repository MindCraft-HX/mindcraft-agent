/**
 * Tab Provider Adapter — contract definition for useAgentTabs.
 *
 * A tab adapter isolates provider-specific tab shape, session-id prefix,
 * abort mechanism, and optional directory selection.
 *
 * The shared useAgentTabs composable consumes an adapter implementing:
 *
 *   {
 *     createTab: (id: string, cwd: string) => TabObject,
 *     abortSession: (sessionId: string) => void,
 *     onActivate?: (tabId: string) => void,
 *     selectDirectory?: (tab: TabObject, makeSystemMsg: (text: string) => Message) => Promise<void>,
 *   }
 *
 * TabObject must have at minimum: id, name, sessionId, cwd, thinking, messages, currentAssistantId
 */

/**
 * Create a ClaudeCode tab provider adapter.
 *
 * @param {object} deps
 * @param {() => string} deps.getLastProjectCwd
 * @param {(v: string) => void} deps.setLastProjectCwd
 * @param {() => void} deps.scrollBottom
 * @param {() => void} deps.saveHistory
 * @returns {object} adapter for useAgentTabs
 */
export function createClaudeTabAdapter({ getLastProjectCwd, setLastProjectCwd, scrollBottom, saveHistory }) {
  return {
    createTab(id, cwd) {
      return {
        id,
        name: '新对话',
        sessionId: `session-${id}-${Date.now()}`,
        cwd: cwd || getLastProjectCwd?.() || '',
        runMode: 'edit_automatically',
        thinking: false,
        messages: [],
        currentAssistantId: null,
      }
    },

    abortSession(sessionId) {
      window.electronAPI?.claudeAgentAbort?.(sessionId)
    },

    onActivate() {
      // no-op: scroll/focus handled by shared composable
    },

    async selectDirectory(tab, makeSystemMsg) {
      if (!window.electronAPI?.claudeSelectDirectory) return
      let dir
      try {
        dir = await window.electronAPI.claudeSelectDirectory()
      } catch (e) {
        console.warn('[selectDir] failed:', e?.message || e)
        return
      }
      if (dir && tab) {
        tab.cwd = dir
        setLastProjectCwd?.(dir)
        tab.messages.push(makeSystemMsg(`✓ 已设置工作目录：${dir}`))
        scrollBottom?.(tab.id)
        saveHistory?.()
      }
    },
  }
}

/**
 * Create a CodeX tab provider adapter.
 *
 * @param {object} deps
 * @param {() => string} deps.getLastProjectCwd
 * @returns {object} adapter for useAgentTabs
 */
export function createCodexTabAdapter({ getLastProjectCwd }) {
  return {
    createTab(id, cwd) {
      return {
        id,
        name: '新对话',
        sessionId: `codex-session-${id}-${Date.now()}`,
        cwd: cwd || getLastProjectCwd?.() || '',
        thinking: false,
        messages: [],
        currentAssistantId: null,
        sandboxMode: '',
      }
    },

    abortSession(sessionId) {
      window.electronAPI?.codexAgentAbort?.(sessionId)
    },

    onActivate() {
      // no-op
    },

    // CodeX has no selectDirectory
    selectDirectory: undefined,
  }
}
