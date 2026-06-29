import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { ref, nextTick } from 'vue'
import { useClaudeTabs } from '../packages/agent/src/components/claudeCode/composables/useClaudeTabs.js'

// ── electronAPI mock ───────────────────────────────────────────────
const originalElectronAPI = globalThis.window?.electronAPI

function setupElectronMock() {
  const calls = []
  globalThis.window = globalThis.window || {}
  globalThis.window.electronAPI = {
    claudeAgentAbort: (sessionId) => {
      calls.push({ method: 'claudeAgentAbort', args: [sessionId] })
    },
    claudeSelectDirectory: async () => {
      calls.push({ method: 'claudeSelectDirectory', args: [] })
      return '/fake/dir'
    },
  }
  return calls
}

function teardownElectronMock() {
  if (originalElectronAPI !== undefined) {
    globalThis.window.electronAPI = originalElectronAPI
  } else if (globalThis.window) {
    delete globalThis.window.electronAPI
  }
}

// ── harness ────────────────────────────────────────────────────────
function createHarness(overrides = {}) {
  let tabIdCounter = 0
  const tabs = ref([])
  const activeId = ref(null)
  const inputEl = ref({ focus: () => {} })
  const confirmDialogRef = ref({ open: async () => true })

  const historyCalls = []
  const scrollCalls = []
  const observerCalls = []

  const api = useClaudeTabs({
    tabs,
    activeId,
    inputEl,
    confirmDialogRef,
    saveHistory: () => { historyCalls.push('saveHistory') },
    scrollBottom: (id) => { scrollCalls.push({ method: 'scrollBottom', args: [id] }) },
    setupHistoryTopObserver: () => { observerCalls.push('setupHistoryTopObserver') },
    getLastProjectCwd: overrides.getLastProjectCwd ?? (() => '/default/cwd'),
    setLastProjectCwd: overrides.setLastProjectCwd ?? ((v) => { historyCalls.push(`setLastProjectCwd:${v}`) }),
    nextTabId: () => `chat-${++tabIdCounter}`,
  })

  return {
    api,
    tabs,
    activeId,
    inputEl,
    confirmDialogRef,
    historyCalls,
    scrollCalls,
    observerCalls,
  }
}

// ── tests ──────────────────────────────────────────────────────────
describe('useClaudeTabs — characterization', () => {
  let electronCalls
  beforeEach(() => { electronCalls = setupElectronMock() })
  afterEach(() => { teardownElectronMock() })

  describe('createTab()', () => {
    it('returns a tab with expected shape and session- prefix', () => {
      const { api } = createHarness()
      const tab = api.createTab()

      assert.equal(typeof tab.id, 'string')
      assert.ok(tab.id.startsWith('chat-'))
      assert.equal(tab.name, '新对话')
      assert.ok(tab.sessionId.startsWith('session-'))
      assert.ok(tab.sessionId.includes(tab.id))
      assert.equal(tab.cwd, '/default/cwd')
      assert.equal(tab.runMode, 'edit_automatically')
      assert.equal(tab.thinking, false)
      assert.deepEqual(tab.messages, [])
      assert.equal(tab.currentAssistantId, null)
    })

    it('uses getLastProjectCwd for cwd', () => {
      const { api } = createHarness({ getLastProjectCwd: () => '/custom/project' })
      const tab = api.createTab()
      assert.equal(tab.cwd, '/custom/project')
    })

    it('yields unique sessionIds across calls', () => {
      const { api } = createHarness()
      const a = api.createTab()
      const b = api.createTab()
      assert.notEqual(a.sessionId, b.sessionId)
      assert.notEqual(a.id, b.id)
    })
  })

  describe('newTab()', () => {
    it('pushes a new tab, sets activeId, and calls saveHistory', () => {
      const { api, tabs, activeId, historyCalls } = createHarness()
      assert.equal(tabs.value.length, 0)
      assert.equal(activeId.value, null)

      api.newTab()

      assert.equal(tabs.value.length, 1)
      assert.equal(activeId.value, tabs.value[0].id)
      assert.ok(historyCalls.includes('saveHistory'))
    })

    it('multiple newTab() calls add distinct tabs', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.newTab()
      api.newTab()

      assert.equal(tabs.value.length, 3)
      assert.equal(activeId.value, tabs.value[2].id)
    })
  })

  describe('switchTab(id)', () => {
    it('sets activeId and triggers scroll + observer (via nextTick)', async () => {
      const { api, tabs, activeId, scrollCalls, observerCalls } = createHarness()
      api.newTab()
      api.newTab()
      scrollCalls.length = 0
      observerCalls.length = 0

      const targetId = tabs.value[0].id
      api.switchTab(targetId)

      // activeId is set synchronously
      assert.equal(activeId.value, targetId)
      // scroll + observer fire on nextTick
      await nextTick()
      assert.equal(scrollCalls.length, 1)
      assert.equal(scrollCalls[0].args[0], targetId)
      assert.ok(observerCalls.includes('setupHistoryTopObserver'))
    })
  })

  describe('deleteTab(id)', () => {
    it('aborts agent and removes tab (non-active stays unchanged)', () => {
      const { api, tabs, activeId, historyCalls } = createHarness()
      api.newTab() // chat-1
      api.newTab() // chat-2
      api.newTab() // chat-3 active
      const t2 = tabs.value[1]
      const t2sid = t2.sessionId
      const activeBefore = activeId.value

      api.deleteTab(t2.id)

      assert.equal(tabs.value.length, 2)
      // activeId unchanged because deleted tab was not active
      assert.equal(activeId.value, activeBefore)
      assert.ok(electronCalls.some(c => c.method === 'claudeAgentAbort' && c.args[0] === t2sid))
      assert.ok(historyCalls.filter(c => c === 'saveHistory').length >= 1)
    })

    it('deleting active tab selects previous', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.newTab()
      api.deleteTab(tabs.value[1].id)
      assert.equal(activeId.value, tabs.value[0].id)
    })

    it('deleting first tab when active selects next', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.newTab()
      api.switchTab(tabs.value[0].id)
      const secondId = tabs.value[1].id
      api.deleteTab(tabs.value[0].id)
      assert.equal(tabs.value.length, 1)
      assert.equal(activeId.value, secondId)
    })

    it('deleting last tab auto-creates a new one', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.deleteTab(tabs.value[0].id)
      assert.equal(tabs.value.length, 1)
      assert.equal(activeId.value, tabs.value[0].id)
    })

    it('silently splices last element when id not found (findIndex=-1)', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      const originalId = tabs.value[0].id
      // findIndex returns -1 for nonexistent id → splice(-1, 1) removes last
      // activeId !== 'nonexistent', so auto-create guard never fires
      api.deleteTab('nonexistent')
      assert.equal(tabs.value.length, 0)
      // activeId still points to the now-deleted tab id
      assert.equal(activeId.value, originalId)
    })
  })

  describe('requestDeleteTab(tab)', () => {
    it('calls confirm dialog and deletes on ok', async () => {
      const { api, tabs } = createHarness()
      api.newTab()
      await api.requestDeleteTab(tabs.value[0])
      // last tab auto-recreates
      assert.equal(tabs.value.length, 1)
    })

    it('returns early when tab is null/undefined', async () => {
      const { api, tabs } = createHarness()
      api.newTab()
      await api.requestDeleteTab(null)
      await api.requestDeleteTab(undefined)
      assert.equal(tabs.value.length, 1)
    })

    it('does not delete when confirm returns false', async () => {
      const { api, tabs, confirmDialogRef } = createHarness()
      confirmDialogRef.value = { open: async () => false }
      api.newTab()
      await api.requestDeleteTab(tabs.value[0])
      assert.equal(tabs.value.length, 1)
    })
  })

  describe('startRename / confirmRename', () => {
    it('startRename sets renaming state', () => {
      const { api, tabs } = createHarness()
      api.newTab()
      api.startRename(tabs.value[0])
      assert.equal(api.renamingId.value, tabs.value[0].id)
      assert.equal(api.renamingText.value, tabs.value[0].name)
    })

    it('confirmRename updates name and saves', () => {
      const { api, tabs, historyCalls } = createHarness()
      api.newTab()
      api.startRename(tabs.value[0])
      api.renamingText.value = '重命名对话'
      historyCalls.length = 0

      api.confirmRename()

      assert.equal(tabs.value[0].name, '重命名对话')
      assert.equal(api.renamingId.value, null)
      assert.ok(historyCalls.includes('saveHistory'))
    })

    it('confirmRename ignores whitespace-only names', () => {
      const { api, tabs, historyCalls } = createHarness()
      api.newTab()
      const originalName = tabs.value[0].name
      api.startRename(tabs.value[0])
      api.renamingText.value = '   '
      historyCalls.length = 0

      api.confirmRename()

      assert.equal(tabs.value[0].name, originalName)
      assert.equal(api.renamingId.value, null)
      assert.ok(!historyCalls.includes('saveHistory'))
    })

    it('confirmRename is safe when no tab is being renamed', () => {
      const { api } = createHarness()
      api.confirmRename()
      assert.equal(api.renamingId.value, null)
    })
  })

  describe('selectDir(activeTab, makeSystemMsg)', () => {
    it('calls claudeSelectDirectory and updates tab cwd', async () => {
      const { api, tabs, scrollCalls, historyCalls } = createHarness()
      api.newTab()
      const tab = tabs.value[0]
      historyCalls.length = 0
      scrollCalls.length = 0

      const makeSystemMsg = (text) => ({ id: 'sys-1', role: 'system', text })
      await api.selectDir(tab, makeSystemMsg)

      assert.equal(tab.cwd, '/fake/dir')
      assert.ok(historyCalls.some(c => c.startsWith('setLastProjectCwd:')))
      assert.equal(tab.messages.length, 1)
      assert.ok(tab.messages[0].text.includes('/fake/dir'))
      assert.equal(scrollCalls.length, 1)
      assert.ok(historyCalls.includes('saveHistory'))
    })

    it('returns early when claudeSelectDirectory is unavailable', async () => {
      const original = globalThis.window.electronAPI.claudeSelectDirectory
      delete globalThis.window.electronAPI.claudeSelectDirectory

      const { api, tabs } = createHarness()
      api.newTab()
      const tab = tabs.value[0]
      tab.cwd = '/original'

      await api.selectDir(tab, () => ({}))
      assert.equal(tab.cwd, '/original')

      globalThis.window.electronAPI.claudeSelectDirectory = original
    })

    it('returns early when activeTab is null', async () => {
      const { api, scrollCalls } = createHarness()
      scrollCalls.length = 0
      await api.selectDir(null, () => ({}))
      assert.equal(scrollCalls.length, 0)
    })

    it('handles claudeSelectDirectory rejection gracefully', async () => {
      const original = globalThis.window.electronAPI.claudeSelectDirectory
      globalThis.window.electronAPI.claudeSelectDirectory = async () => {
        throw new Error('cancelled')
      }

      const { api, tabs } = createHarness()
      api.newTab()
      const tab = tabs.value[0]
      tab.cwd = '/original'

      await api.selectDir(tab, () => ({}))
      assert.equal(tab.cwd, '/original')

      globalThis.window.electronAPI.claudeSelectDirectory = original
    })
  })

  describe('sidebarOpen ref', () => {
    it('starts as true', () => {
      const { api } = createHarness()
      assert.equal(api.sidebarOpen.value, true)
    })
  })
})

console.log('useClaudeTabs characterization test passed')
