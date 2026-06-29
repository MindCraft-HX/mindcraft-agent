import { ref, nextTick } from 'vue'
import { computeNextActiveTab, sanitizeTabName } from '../utils/tabHelpers.mjs'

/**
 * Shared tab-management composable — used by both ClaudeCode and CodeX.
 *
 * Provider-specific behaviors are injected via the `adapter` parameter:
 *
 *   adapter = {
 *     createTab: (id: string, cwd: string) => TabObject,
 *     abortSession: (sessionId: string) => void,
 *     onActivate?: (tabId: string) => void,
 *     selectDirectory?: (tab, makeSystemMsg) => Promise<void>,
 *   }
 *
 * @param {object} deps
 * @param {object} deps.adapter - provider adapter
 * @param {import('vue').Ref<Array>} deps.tabs
 * @param {import('vue').Ref<string|null>} deps.activeId
 * @param {import('vue').Ref} deps.inputEl
 * @param {import('vue').Ref} deps.confirmDialogRef
 * @param {Function} deps.saveHistory
 * @param {Function} deps.scrollBottom
 * @param {Function} deps.setupHistoryTopObserver
 * @param {Function} deps.getLastProjectCwd
 * @param {Function} deps.nextTabId
 */
export function useAgentTabs({
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
}) {
  const sidebarOpen = ref(true)
  const renamingId = ref(null)
  const renamingText = ref('')

  // ── tab lifecycle ──────────────────────────────────────────────

  function createTab() {
    const id = nextTabId()
    return adapter.createTab(id, getLastProjectCwd?.())
  }

  function newTab() {
    const tab = createTab()
    tabs.value.push(tab)
    activeId.value = tab.id
    saveHistory()
    nextTick(() => {
      inputEl.value?.focus()
    })
  }

  function switchTab(id) {
    activeId.value = id
    nextTick(() => {
      setupHistoryTopObserver()
      scrollBottom(id)
      inputEl.value?.focus()
      adapter.onActivate?.(id)
    })
  }

  function deleteTab(id) {
    const tab = tabs.value.find(t => t.id === id)
    if (tab) adapter.abortSession(tab.sessionId)

    const idx = tabs.value.findIndex(t => t.id === id)
    const wasActive = activeId.value === id
    tabs.value.splice(idx, 1)

    const { activeId: nextId, shouldCreateNew } = computeNextActiveTab(tabs.value, idx, wasActive)
    if (nextId !== null) activeId.value = nextId
    if (shouldCreateNew) newTab()

    saveHistory()
  }

  async function requestDeleteTab(tab) {
    if (!tab) return
    const ok = await confirmDialogRef.value?.open({ message: '是否确认删除该对话？' })
    if (ok) deleteTab(tab.id)
  }

  // ── rename ─────────────────────────────────────────────────────

  function startRename(tab) {
    renamingId.value = tab.id
    renamingText.value = tab.name
  }

  function confirmRename() {
    const tab = tabs.value.find(t => t.id === renamingId.value)
    const { value, isValid } = sanitizeTabName(renamingText.value)
    if (tab && isValid) {
      tab.name = value
      saveHistory()
    }
    renamingId.value = null
  }

  // ── directory selection (optional, ClaudeCode only) ────────────

  async function selectDir(activeTab, makeSystemMsg) {
    if (adapter.selectDirectory) {
      await adapter.selectDirectory(activeTab, makeSystemMsg)
    }
  }

  return {
    sidebarOpen,
    renamingId,
    renamingText,
    createTab,
    newTab,
    switchTab,
    deleteTab,
    requestDeleteTab,
    startRename,
    confirmRename,
    selectDir,
  }
}
