import { ref, nextTick } from 'vue'

export function useCodexTabs({
  tabs, activeId, inputEl, confirmDialogRef, saveHistory,
  scrollBottom, setupHistoryTopObserver, getLastProjectCwd, nextTabId,
}) {
  const sidebarOpen = ref(true)
  const renamingId = ref(null)
  const renamingText = ref('')

  function createTab() {
    const id = nextTabId()
    return {
      id, name: '新对话',
      sessionId: `codex-session-${id}-${Date.now()}`,
      cwd: getLastProjectCwd?.() || '',
      thinking: false, messages: [],
      currentAssistantId: null,
      sandboxLevel: '',  // 首次发送消息时由全局默认锁定
    }
  }

  function newTab() {
    const tab = createTab()
    tabs.value.push(tab)
    activeId.value = tab.id
    saveHistory()
    nextTick(() => inputEl.value?.focus())
  }

  function switchTab(id) {
    activeId.value = id
    nextTick(() => { setupHistoryTopObserver(); scrollBottom(id); inputEl.value?.focus() })
  }

  function deleteTab(id) {
    window.electronAPI.codexAgentAbort?.(tabs.value.find(t => t.id === id)?.sessionId)
    const idx = tabs.value.findIndex(t => t.id === id)
    tabs.value.splice(idx, 1)
    if (activeId.value === id) {
      activeId.value = tabs.value[Math.max(0, idx - 1)]?.id || null
      if (!tabs.value.length) newTab()
    }
    saveHistory()
  }

  async function requestDeleteTab(tab) {
    if (!tab) return
    const ok = await confirmDialogRef.value?.open({ message: '是否确认删除该对话？' })
    if (ok) deleteTab(tab.id)
  }

  function startRename(tab) {
    renamingId.value = tab.id
    renamingText.value = tab.name
  }

  function confirmRename() {
    const tab = tabs.value.find(t => t.id === renamingId.value)
    if (tab && renamingText.value.trim()) { tab.name = renamingText.value.trim(); saveHistory() }
    renamingId.value = null
  }

  return { sidebarOpen, renamingId, renamingText, createTab, newTab, switchTab, deleteTab, requestDeleteTab, startRename, confirmRename }
}
