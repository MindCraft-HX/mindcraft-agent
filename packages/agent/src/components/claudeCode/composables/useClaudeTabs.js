import { ref, nextTick } from 'vue'

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
  const sidebarOpen = ref(true)
  const renamingId = ref(null)
  const renamingText = ref('')

  function createTab() {
    const id = nextTabId()
    return {
      id,
      name: '新对话',
      sessionId: `session-${id}-${Date.now()}`,
      cwd: getLastProjectCwd?.() || '',
      runMode: 'edit_automatically',
      thinking: false,
      messages: [],
      currentAssistantId: null,
    }
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
    nextTick(() => { setupHistoryTopObserver(); scrollBottom(id); inputEl.value?.focus() })
  }

  function deleteTab(id) {
    window.electronAPI.claudeAgentAbort?.(tabs.value.find(t => t.id === id)?.sessionId)
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
    if (tab && renamingText.value.trim()) {
      tab.name = renamingText.value.trim()
      saveHistory()
    }
    renamingId.value = null
  }

  async function selectDir(activeTab, makeSystemMsg) {
    if (!window.electronAPI?.claudeSelectDirectory) return
    let dir
    try {
      dir = await window.electronAPI.claudeSelectDirectory()
    } catch (e) {
      console.warn('[selectDir] failed:', e?.message || e)
      return
    }
    if (dir && activeTab) {
      activeTab.cwd = dir
      setLastProjectCwd?.(dir)
      activeTab.messages.push(makeSystemMsg(`✓ 已设置工作目录：${dir}`))
      scrollBottom(activeTab.id)
      saveHistory()
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

