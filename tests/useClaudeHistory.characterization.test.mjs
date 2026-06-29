import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { ref } from 'vue'
import { useClaudeHistory } from '../packages/agent/src/components/claudeCode/composables/useClaudeHistory.js'

// ── electronAPI mock ───────────────────────────────────────────────
const originalElectronAPI = globalThis.window?.electronAPI

function setupElectronMock() {
  const payloads = []
  globalThis.window = globalThis.window || {}
  globalThis.window.electronAPI = {
    claudeSaveCodePanelState: async (p) => { payloads.push({ async: true, ...p }) },
    claudeSaveCodePanelStateSync: (p) => { payloads.push({ sync: true, ...p }) },
    claudeLoadCodePanelState: async () => null,
  }
  return payloads
}

function teardownElectronMock() {
  if (originalElectronAPI !== undefined) {
    globalThis.window.electronAPI = originalElectronAPI
  } else if (globalThis.window) {
    delete globalThis.window.electronAPI
  }
}

// ── helpers ────────────────────────────────────────────────────────
function makeChat(id, overrides = {}) {
  return {
    id: id || 'chat-1',
    name: overrides.name || '新对话',
    sessionId: overrides.sessionId || `session-${id}-1700000000000`,
    cwd: overrides.cwd || '/home/project',
    runMode: overrides.runMode || 'edit_automatically',
    model: overrides.model || null,
    effort: overrides.effort || null,
    thinking: overrides.thinking ?? false,
    messages: overrides.messages || [],
    currentAssistantId: null,
    cliSessionId: null,
    filePath: overrides.filePath || null,
    createdAt: overrides.createdAt || '2026-06-20T00:00:00Z',
    updatedAt: overrides.updatedAt || '2026-06-28T00:00:00Z',
    fileSize: overrides.fileSize || null,
    titleSource: overrides.titleSource || '',
    _pendingSessionBinding: false,
    _userRenamed: overrides._userRenamed ?? false,
    taskState: overrides.taskState || null,
  }
}

function makeMsg(id, role, text, extra = {}) {
  return { id, role, text, ...extra }
}

// ── tests ──────────────────────────────────────────────────────────
describe('useClaudeHistory — characterization', () => {
  let payloads
  beforeEach(() => { payloads = setupElectronMock() })
  afterEach(() => { teardownElectronMock() })

  // ── getLastProjectCwd / setLastProjectCwd ──────────────────────
  describe('getLastProjectCwd / setLastProjectCwd', () => {
    it('starts as empty string', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      assert.equal(h.getLastProjectCwd(), '')
    })

    it('set + get round-trips', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.setLastProjectCwd('/a/b')
      assert.equal(h.getLastProjectCwd(), '/a/b')
      h.setLastProjectCwd(null)
      assert.equal(h.getLastProjectCwd(), '')
    })
  })

  // ── saveHistory ────────────────────────────────────────────────
  describe('saveHistory()', () => {
    it('normal save is debounced (no immediate IPC)', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.setLastProjectCwd('/test')
      h.saveHistory()
      assert.equal(payloads.length, 0, 'normal save debounced')
    })

    it('immediate save persists right away', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.setLastProjectCwd('/test')
      h.saveHistory({ immediate: true })
      assert.equal(payloads.length, 1)
      assert.ok(payloads[0].async)
    })

    it('cooldown suppresses duplicate immediate saves', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.saveHistory({ immediate: true })
      h.saveHistory({ immediate: true })
      assert.equal(payloads.length, 1, 'cooldown at 500ms')
    })

    it('immediate clears pending debounce', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.saveHistory() // starts 2s timer
      h.saveHistory({ immediate: true }) // clears + persists
      assert.equal(payloads.length, 1)
    })

    it('panel state includes lastCwd and projects', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([{
        id: 'proj-1', name: 'P1', cwd: '/p1', cwdLocked: false, hasDoneNotification: false, chats: [],
      }])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        getActiveProjectId: () => 'proj-1',
        setActiveProjectId: () => {},
        getActiveChatId: () => null,
        setActiveChatId: () => {},
      })
      h.setLastProjectCwd('/p1')
      h.saveHistory({ immediate: true })

      assert.equal(payloads.length, 1)
      const p = payloads[0]
      assert.equal(p.lastCwd, '/p1')
      assert.ok(Array.isArray(p.projects))
      assert.equal(p.projects.length, 1)
      assert.equal(p.projects[0].id, 'proj-1')
    })

    it('panel state skips messages for thinking tabs', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([{
        id: 'proj-1', name: 'P1', cwd: '/p1', cwdLocked: false, hasDoneNotification: false,
        chats: [makeChat('chat-1', { thinking: true, messages: [makeMsg(1, 'user', 'hello')] })],
      }])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        getActiveProjectId: () => 'proj-1',
        setActiveProjectId: () => {},
        getActiveChatId: () => null,
        setActiveChatId: () => {},
      })
      // immediate save uses skipStreamingMessages: true
      h.saveHistory({ immediate: true })

      const chat = payloads[0].projects[0].chats[0]
      assert.ok(Array.isArray(chat.messages))
      // thinking tab messages should be empty (skipStreamingMessages: true)
      assert.equal(chat.messages.length, 0)
    })
  })

  // ── flushHistoryOnUnload ───────────────────────────────────────
  describe('flushHistoryOnUnload()', () => {
    it('uses sync IPC', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.flushHistoryOnUnload()
      assert.equal(payloads.length, 1)
      assert.ok(payloads[0].sync, 'should use sync IPC on unload')
    })

    it('clears pending debounce before flush', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      h.saveHistory() // start 2s debounce
      h.flushHistoryOnUnload()
      assert.equal(payloads.length, 1) // only sync, debounce cancelled
    })

    it('does not skip streaming messages on unload flush', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([{
        id: 'proj-1', name: 'P1', cwd: '/p1', cwdLocked: false, hasDoneNotification: false,
        chats: [makeChat('chat-1', { thinking: true, messages: [makeMsg(1, 'user', 'streaming')] })],
      }])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        getActiveProjectId: () => 'proj-1',
        setActiveProjectId: () => {},
        getActiveChatId: () => null,
        setActiveChatId: () => {},
      })
      // flushOnUnload calls buildPanelStatePayload() with NO skipStreamingMessages
      h.flushHistoryOnUnload()
      const chat = payloads[0].projects[0].chats[0]
      // messages ARE included because no skipStreamingMessages param
      assert.equal(chat.messages.length, 1)
    })
  })

  // ── loadHistory ────────────────────────────────────────────────
  describe('loadHistory()', () => {
    it('returns false when remote has no projects', async () => {
      globalThis.window.electronAPI.claudeLoadCodePanelState = async () => ({ projects: [] })
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      const ok = await h.loadHistory()
      assert.equal(ok, false)
    })

    it('returns false on IPC error', async () => {
      globalThis.window.electronAPI.claudeLoadCodePanelState = async () => { throw new Error('fail') }
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      const ok = await h.loadHistory()
      assert.equal(ok, false)
    })

    it('returns false when IPC is unavailable', async () => {
      delete globalThis.window.electronAPI.claudeLoadCodePanelState
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
      })
      const ok = await h.loadHistory()
      assert.equal(ok, false)
    })

    it('loads projects and updates cwd', async () => {
      globalThis.window.electronAPI.claudeLoadCodePanelState = async () => ({
        lastCwd: '/loaded/project',
        activeProjectId: 'proj-loaded',
        activeChatId: null,
        projects: [{
          id: 'proj-loaded',
          name: 'Loaded Project',
          cwd: '/loaded/project',
          cwdLocked: false,
          hasDoneNotification: false,
          chats: [{
            id: 'chat-7',
            name: 'Loaded Chat',
            sessionId: 'session-chat-7-1700000000',
            cwd: '/loaded/project',
            runMode: 'edit_automatically',
            messages: [makeMsg(1, 'user', 'hello world')],
          }],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      let activeProjectSet = null
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        getActiveProjectId: () => 'proj-loaded',
        setActiveProjectId: (v) => { activeProjectSet = v },
        getActiveChatId: () => null,
        setActiveChatId: () => {},
      })

      const ok = await h.loadHistory()

      assert.equal(ok, true)
      assert.equal(h.getLastProjectCwd(), '/loaded/project')
      assert.ok(projects.value.length > 0)
      assert.equal(projects.value[0].name, 'Loaded Project')
    })

    it('filters subagent chat filePaths', async () => {
      globalThis.window.electronAPI.claudeLoadCodePanelState = async () => ({
        lastCwd: '/p',
        activeProjectId: 'proj-1',
        activeChatId: null,
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          chats: [
            { id: 'chat-a', name: 'Normal', sessionId: 's-a', cwd: '/p', runMode: 'edit_automatically',
              filePath: '/sessions/normal.jsonl', messages: [makeMsg(1, 'user', 'hi')] },
            { id: 'chat-b', name: 'Sub', sessionId: 's-b', cwd: '/p', runMode: 'edit_automatically',
              filePath: '/subagents/task.jsonl', messages: [makeMsg(2, 'user', 'filtered')] },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        getActiveProjectId: () => 'proj-1',
        setActiveProjectId: () => {},
        getActiveChatId: () => null,
        setActiveChatId: () => {},
      })

      await h.loadHistory()
      assert.equal(projects.value[0].chats.length, 1)
      assert.equal(projects.value[0].chats[0].id, 'chat-a')
    })

    it('normalizes messages: filters system-context, collapses thinking/read', async () => {
      globalThis.window.electronAPI.claudeLoadCodePanelState = async () => ({
        lastCwd: '/p',
        activeProjectId: 'proj-1',
        activeChatId: null,
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          chats: [{
            id: 'chat-x', name: 'Chat', sessionId: 's-x', cwd: '/p',
            runMode: 'edit_automatically',
            messages: [
              { id: 1, role: 'user', text: 'real question' },
              { id: 2, role: 'tool', text: '...', toolName: 'Thinking' },
              { id: 3, role: 'tool', text: '...', toolName: 'Read' },
              { id: 4, role: 'tool', text: '...', toolName: 'Edit' },
            ],
          }],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useClaudeHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        getActiveProjectId: () => 'proj-1',
        setActiveProjectId: () => {},
        getActiveChatId: () => null,
        setActiveChatId: () => {},
      })

      await h.loadHistory()
      const msgs = projects.value[0].chats[0].messages
      // user message kept, all tools kept but thinking/read collapsed
      assert.ok(msgs.length >= 2)

      const thinkingMsg = msgs.find(m => m.toolName?.toLowerCase() === 'thinking')
      const readMsg = msgs.find(m => m.toolName?.toLowerCase() === 'read')
      const editMsg = msgs.find(m => m.toolName?.toLowerCase() === 'edit')

      if (thinkingMsg) assert.equal(thinkingMsg.expanded, false)
      if (readMsg) assert.equal(readMsg.expanded, false)
      if (editMsg) assert.equal(editMsg.expanded, undefined)
    })
  })
})

console.log('useClaudeHistory characterization test passed')
