import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { ref, nextTick } from 'vue'
import { useCodexTabs } from '../packages/agent/src/components/codeX/composables/useCodexTabs.js'

// ── electronAPI mock ───────────────────────────────────────────────
const originalElectronAPI = globalThis.window?.electronAPI

function setupElectronMock() {
  const calls = []
  globalThis.window = globalThis.window || {}
  globalThis.window.electronAPI = {
    codexAgentAbort: (sessionId) => {
      calls.push({ method: 'codexAgentAbort', args: [sessionId] })
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

  const api = useCodexTabs({
    tabs,
    activeId,
    inputEl,
    confirmDialogRef,
    saveHistory: () => { historyCalls.push('saveHistory') },
    scrollBottom: (id) => { scrollCalls.push({ method: 'scrollBottom', args: [id] }) },
    setupHistoryTopObserver: () => { observerCalls.push('setupHistoryTopObserver') },
    getLastProjectCwd: overrides.getLastProjectCwd ?? (() => '/default/cwd'),
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
describe('useCodexTabs — characterization', () => {
  let electronCalls
  beforeEach(() => { electronCalls = setupElectronMock() })
  afterEach(() => { teardownElectronMock() })

  describe('createTab()', () => {
    it('returns a tab with codex-session- prefix and sandboxMode', () => {
      const { api } = createHarness()
      const tab = api.createTab()

      assert.equal(typeof tab.id, 'string')
      assert.ok(tab.id.startsWith('chat-'))
      assert.equal(tab.name, '新对话')
      assert.ok(tab.sessionId.startsWith('codex-session-'))
      assert.ok(tab.sessionId.includes(tab.id))
      // CodeX uses sandboxMode (ClaudeCode uses runMode)
      assert.equal(tab.sandboxMode, '')
      assert.equal(tab.runMode, undefined)
      assert.equal(tab.cwd, '/default/cwd')
      assert.equal(tab.thinking, false)
      assert.deepEqual(tab.messages, [])
      assert.equal(tab.currentAssistantId, null)
    })

    it('uses getLastProjectCwd for initial cwd', () => {
      const { api } = createHarness({ getLastProjectCwd: () => '/projects/demo' })
      const tab = api.createTab()
      assert.equal(tab.cwd, '/projects/demo')
    })

    it('generates unique sessionIds on each call', () => {
      const { api } = createHarness()
      const a = api.createTab()
      const b = api.createTab()
      assert.notEqual(a.sessionId, b.sessionId)
      assert.notEqual(a.id, b.id)
    })
  })

  describe('newTab()', () => {
    it('pushes tab, sets active, saves history', () => {
      const { api, tabs, activeId, historyCalls } = createHarness()
      api.newTab()
      assert.equal(tabs.value.length, 1)
      assert.equal(activeId.value, tabs.value[0].id)
      assert.ok(historyCalls.includes('saveHistory'))
    })
  })

  describe('switchTab(id)', () => {
    it('sets activeId synchronously, fires scroll + observer on nextTick', async () => {
      const { api, tabs, activeId, scrollCalls, observerCalls } = createHarness()
      api.newTab()
      api.newTab()
      const targetId = tabs.value[0].id
      scrollCalls.length = 0
      observerCalls.length = 0

      api.switchTab(targetId)
      assert.equal(activeId.value, targetId)
      await nextTick()
      assert.equal(scrollCalls.length, 1)
      assert.equal(scrollCalls[0].args[0], targetId)
      assert.ok(observerCalls.includes('setupHistoryTopObserver'))
    })
  })

  describe('deleteTab(id)', () => {
    it('calls codexAgentAbort with the tab sessionId', () => {
      const { api, tabs } = createHarness()
      api.newTab()
      api.newTab()
      const sid = tabs.value[0].sessionId
      api.deleteTab(tabs.value[0].id)
      assert.ok(electronCalls.some(c => c.method === 'codexAgentAbort' && c.args[0] === sid))
    })

    it('removes tab and keeps activeId when deleting non-active', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.newTab()
      const activeBefore = activeId.value
      api.deleteTab(tabs.value[0].id)
      assert.equal(tabs.value.length, 1)
      assert.equal(activeId.value, activeBefore)
    })

    it('moves activeId to previous when deleting active', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.newTab()
      const prevId = tabs.value[0].id
      api.deleteTab(tabs.value[1].id) // delete active
      assert.equal(activeId.value, prevId)
    })

    it('auto-creates new tab when deleting last remaining', () => {
      const { api, tabs, activeId } = createHarness()
      api.newTab()
      api.deleteTab(tabs.value[0].id)
      assert.equal(tabs.value.length, 1)
      assert.equal(activeId.value, tabs.value[0].id)
    })
  })

  describe('requestDeleteTab(tab)', () => {
    it('shows confirm dialog and deletes on ok', async () => {
      const { api, tabs } = createHarness()
      api.newTab()
      await api.requestDeleteTab(tabs.value[0])
      // last tab auto-recreates
      assert.equal(tabs.value.length, 1)
    })

    it('skips when tab is null', async () => {
      const { api, tabs } = createHarness()
      api.newTab()
      await api.requestDeleteTab(null)
      assert.equal(tabs.value.length, 1)
    })

    it('skips deletion when confirm returns false', async () => {
      const { api, tabs, confirmDialogRef } = createHarness()
      confirmDialogRef.value = { open: async () => false }
      api.newTab()
      await api.requestDeleteTab(tabs.value[0])
      assert.equal(tabs.value.length, 1)
    })
  })

  describe('startRename / confirmRename', () => {
    it('sets renaming state, confirms updates name and clears', () => {
      const { api, tabs, historyCalls } = createHarness()
      api.newTab()

      api.startRename(tabs.value[0])
      assert.equal(api.renamingId.value, tabs.value[0].id)
      assert.equal(api.renamingText.value, tabs.value[0].name)

      api.renamingText.value = '代码评审'
      historyCalls.length = 0
      api.confirmRename()

      assert.equal(tabs.value[0].name, '代码评审')
      assert.equal(api.renamingId.value, null)
      assert.ok(historyCalls.includes('saveHistory'))
    })

    it('ignores whitespace-only rename', () => {
      const { api, tabs, historyCalls } = createHarness()
      api.newTab()
      const original = tabs.value[0].name
      api.startRename(tabs.value[0])
      api.renamingText.value = '   '
      historyCalls.length = 0
      api.confirmRename()
      assert.equal(tabs.value[0].name, original)
      assert.ok(!historyCalls.includes('saveHistory'))
    })
  })

  describe('provider differences vs ClaudeCode', () => {
    it('selectDir exists but is a no-op (adapter has no selectDirectory)', async () => {
      const { api, tabs, scrollCalls } = createHarness()
      // selectDir is returned by shared composable, but CodeX adapter provides no implementation
      assert.equal(typeof api.selectDir, 'function')
      api.newTab()
      scrollCalls.length = 0
      // calling it should not throw and should not change anything
      await api.selectDir(tabs.value[0], () => ({}))
      assert.equal(scrollCalls.length, 0) // no-op
    })

    it('tab has sandboxMode but not runMode', () => {
      const { api } = createHarness()
      const tab = api.createTab()
      assert.ok('sandboxMode' in tab)
      assert.ok(!('runMode' in tab))
    })

    it('deletes via codexAgentAbort, not claudeAgentAbort', () => {
      const { api, tabs } = createHarness()
      api.newTab()
      api.deleteTab(tabs.value[0].id)
      assert.ok(electronCalls.every(c => c.method === 'codexAgentAbort'))
      assert.ok(!electronCalls.some(c => c.method === 'claudeAgentAbort'))
    })

    it('does not accept setLastProjectCwd parameter (not in deps)', () => {
      // CodeX tabs composable does not take setLastProjectCwd — this is
      // a deliberate structural difference from ClaudeCode.
      // The harness above omits it, and the composable still works.
      const { api } = createHarness()
      assert.equal(typeof api.newTab, 'function')
    })
  })

  describe('sidebarOpen ref', () => {
    it('starts as true', () => {
      const { api } = createHarness()
      assert.equal(api.sidebarOpen.value, true)
    })
  })
})

console.log('useCodexTabs characterization test passed')
