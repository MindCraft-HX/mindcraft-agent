import { createSaveCooldownGuard } from '../utils/historyHelpers.mjs'

/**
 * Shared history persistence composable — used by both ClaudeCode and CodeX.
 *
 * Handles the generic lifecycle:
 *   - lastProjectCwd tracking
 *   - saveHistory (debounced 2s + immediate + 500ms cooldown)
 *   - flushOnUnload (clear debounce + sync save)
 *   - loadHistory (IPC load + apply + restore active)
 *
 * Provider-specific serialization, normalization, and IPC are injected via `adapter`:
 *
 *   adapter = {
 *     buildPanelState: ({ projects, lastCwd, skipStreaming, activeProjectId, activeChatId }) => object,
 *     normalizeMessages: (messages, setMsgId) => Array,
 *     applyProjects: (data, ctx) => boolean,
 *     saveAsync: (payload) => Promise<void>,
 *     saveSync: (payload) => void,
 *     loadRemote: () => Promise<object|null>,
 *     flushSkipsStreaming: boolean,
 *   }
 *
 * @param {object} deps
 * @param {object} deps.adapter
 * @param {import('vue').Ref} deps.projects
 * @param {Function} deps.setProjects
 * @param {Function} deps.getProjectCounter
 * @param {Function} deps.setProjectCounter
 * @param {Function} deps.getChatCounter
 * @param {Function} deps.setChatCounter
 * @param {Function} deps.getMsgId
 * @param {Function} deps.setMsgId
 * @param {Function} deps.makeRestoredChat
 * @param {Function} [deps.getActiveProjectId]
 * @param {Function} [deps.setActiveProjectId]
 * @param {Function} [deps.getActiveChatId]
 * @param {Function} [deps.setActiveChatId]
 */
export function useAgentHistory({
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
}) {
  let lastProjectCwd = ''
  let historySaveTimer = null

  const cooldownGuard = createSaveCooldownGuard(500)

  function getLastProjectCwd() {
    return lastProjectCwd
  }

  function setLastProjectCwd(v) {
    lastProjectCwd = v || ''
  }

  // ── panel state + persist ──────────────────────────────────────

  function buildPanelStatePayload(opts = {}) {
    return adapter.buildPanelState({
      projects: projects.value,
      lastCwd: lastProjectCwd,
      skipStreaming: opts.skipStreaming ?? true,
      activeProjectId: typeof getActiveProjectId === 'function' ? getActiveProjectId() : null,
      activeChatId: typeof getActiveChatId === 'function' ? getActiveChatId() : null,
    })
  }

  function persistNow(skipStreaming) {
    if (cooldownGuard()) return
    const payload = buildPanelStatePayload({ skipStreaming })
    try {
      const clean = JSON.parse(JSON.stringify(payload))
      adapter.saveAsync(clean)?.catch(() => {})
    } catch (_) {}
  }

  function saveHistory({ immediate = false } = {}) {
    if (immediate) {
      if (historySaveTimer) {
        clearTimeout(historySaveTimer)
        historySaveTimer = null
      }
      persistNow(true)
      return
    }
    if (historySaveTimer) clearTimeout(historySaveTimer)
    historySaveTimer = setTimeout(() => {
      historySaveTimer = null
      persistNow(true)
    }, 2000)
  }

  function flushOnUnload() {
    if (historySaveTimer) {
      clearTimeout(historySaveTimer)
      historySaveTimer = null
    }
    const skipStreaming = adapter.flushSkipsStreaming ?? false
    const payload = buildPanelStatePayload({ skipStreaming })
    try {
      adapter.saveSync(payload)
    } catch (_) {}
  }

  // ── load ───────────────────────────────────────────────────────

  async function loadHistory() {
    try {
      const remote = await adapter.loadRemote()
      if (!remote?.projects?.length) return false

      lastProjectCwd = remote.lastCwd || ''

      const ctx = {
        setProjects,
        getProjectCounter,
        setProjectCounter,
        getChatCounter,
        setChatCounter,
        setMsgId,
        getMsgId,
        makeRestoredChat,
      }

      const loaded = adapter.applyProjects(remote, ctx)

      if (loaded) {
        if (typeof setActiveProjectId === 'function') {
          setActiveProjectId(remote.activeProjectId || null)
        }
        if (typeof setActiveChatId === 'function') {
          setActiveChatId(remote.activeChatId || null)
        }
      }

      return loaded
    } catch (_) {
      return false
    }
  }

  return {
    getLastProjectCwd,
    setLastProjectCwd,
    saveHistory,
    flushOnUnload,
    loadHistory,
  }
}
