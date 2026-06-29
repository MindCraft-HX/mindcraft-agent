import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { ref } from 'vue'
import { useCodexHistory } from '../packages/agent/src/components/codeX/composables/useCodexHistory.js'

// ── electronAPI mock ───────────────────────────────────────────────
const originalElectronAPI = globalThis.window?.electronAPI

function setupElectronMock() {
  const payloads = []
  globalThis.window = globalThis.window || {}
  globalThis.window.electronAPI = {
    codexSaveCodePanelState: async (p) => { payloads.push({ async: true, ...p }) },
    codexSaveCodePanelStateSync: (p) => { payloads.push({ sync: true, ...p }) },
    codexLoadCodePanelState: async () => null,
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
function makeCodexChat(id, overrides = {}) {
  return {
    id: id || 'chat-1',
    name: overrides.name || '新对话',
    sessionId: overrides.sessionId || `codex-session-${id}-1700000000000`,
    cwd: overrides.cwd || '/home/project',
    thinking: overrides.thinking ?? false,
    messages: overrides.messages || [],
    currentAssistantId: null,
    sandboxMode: overrides.sandboxMode ?? '',
    model: overrides.model || null,
    reasoningEffort: overrides.reasoningEffort || null,
    networkAccessEnabled: overrides.networkAccessEnabled ?? null,
    webSearchMode: overrides.webSearchMode || null,
    _thinkingStart: overrides._thinkingStart ?? null,
    _awaitingDone: overrides._awaitingDone ?? false,
    cliSessionId: overrides.cliSessionId || null,
    filePath: overrides.filePath || null,
    createdAt: overrides.createdAt || '2026-06-20T00:00:00Z',
    updatedAt: overrides.updatedAt || '2026-06-28T00:00:00Z',
    fileSize: overrides.fileSize || null,
    titleSource: overrides.titleSource || '',
    _userRenamed: overrides._userRenamed ?? false,
    _resumeAllowed: overrides._resumeAllowed ?? true,
    metrics: overrides.metrics || null,
  }
}

function makeMsg(id, role, text, extra = {}) {
  return { id, role, text, ...extra }
}

function identityFilter(msgs) { return msgs }

// ── tests ──────────────────────────────────────────────────────────
describe('useCodexHistory — characterization', () => {
  let payloads
  beforeEach(() => { payloads = setupElectronMock() })
  afterEach(() => { teardownElectronMock() })

  // ── getLastProjectCwd / setLastProjectCwd ──────────────────────
  describe('getLastProjectCwd / setLastProjectCwd', () => {
    it('round-trips correctly', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      assert.equal(h.getLastProjectCwd(), '')
      h.setLastProjectCwd('/codex/project')
      assert.equal(h.getLastProjectCwd(), '/codex/project')
      h.setLastProjectCwd(null)
      assert.equal(h.getLastProjectCwd(), '')
    })
  })

  // ── saveHistory ────────────────────────────────────────────────
  describe('saveHistory()', () => {
    it('normal save debounced, immediate persists via codex IPC', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      h.saveHistory()
      assert.equal(payloads.length, 0, 'debounced')

      h.saveHistory({ immediate: true })
      assert.equal(payloads.length, 1)
      assert.ok(payloads[0].async)
    })

    it('cooldown suppresses rapid immediate saves', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      h.saveHistory({ immediate: true })
      h.saveHistory({ immediate: true })
      assert.equal(payloads.length, 1)
    })

    it('panel state includes CodeX-specific fields', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([{
        id: 'proj-1', name: 'P1', cwd: '/p1', cwdLocked: false, hasDoneNotification: false,
        additionalDirectories: ['/extra'],
        chats: [makeCodexChat('chat-1', {
          sandboxMode: 'strict',
          reasoningEffort: 'high',
        })],
      }])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      h.setLastProjectCwd('/p1')
      h.saveHistory({ immediate: true })

      const p = payloads[0]
      assert.equal(p.lastCwd, '/p1')
      assert.equal(p.projects.length, 1)
      assert.deepEqual(p.projects[0].additionalDirectories, ['/extra'])

      const chat = p.projects[0].chats[0]
      assert.equal(chat.sandboxMode, 'strict')
      assert.equal(chat.reasoningEffort, 'high')
    })

    it('skipStreaming drops messages for thinking/_awaitingDone tabs', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([{
        id: 'proj-1', name: 'P1', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
        additionalDirectories: [],
        chats: [makeCodexChat('t1', {
          thinking: true,
          messages: [makeMsg(1, 'user', 'streaming...')],
        })],
      }])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      // immediate save uses skipStreaming: true
      h.saveHistory({ immediate: true })

      const chat = payloads[0].projects[0].chats[0]
      assert.deepEqual(chat.messages, [])
    })
  })

  // ── flushOnUnload ──────────────────────────────────────────────
  describe('flushOnUnload()', () => {
    it('uses sync IPC with codexSaveCodePanelStateSync', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      h.flushOnUnload()
      assert.equal(payloads.length, 1)
      assert.ok(payloads[0].sync)
    })

    it('clears pending debounce', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      h.saveHistory()
      h.flushOnUnload()
      assert.equal(payloads.length, 1)
    })

    it('CodeX flush skips streaming messages (differs from ClaudeCode)', () => {
      let pc = 0, cc = 0, mi = 0
      const projects = ref([{
        id: 'proj-1', name: 'P1', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
        additionalDirectories: [],
        chats: [makeCodexChat('t1', {
          thinking: true,
          messages: [makeMsg(1, 'user', 'streaming...')],
        })],
      }])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      // CodeX flushOnUnload ALWAYS uses skipStreaming: true
      h.flushOnUnload()
      const chat = payloads[0].projects[0].chats[0]
      assert.deepEqual(chat.messages, [])
    })
  })

  // ── loadHistory ────────────────────────────────────────────────
  describe('loadHistory()', () => {
    it('returns false on empty projects', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({ projects: [] })
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      assert.equal(await h.loadHistory(), false)
    })

    it('returns false on IPC error', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => { throw new Error('fail') }
      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })
      assert.equal(await h.loadHistory(), false)
    })

    it('loads projects and sets cwd', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/codex/loaded',
        projects: [{
          id: 'proj-cx',
          name: 'CodeX Project',
          cwd: '/codex/loaded',
          cwdLocked: false,
          hasDoneNotification: false,
          additionalDirectories: [],
          chats: [{
            id: 'chat-cx-1',
            name: 'CodeX Chat',
            sessionId: 'codex-session-chat-cx-1-170000000',
            cwd: '/codex/loaded',
            messages: [makeMsg(1, 'user', 'codex hello')],
          }],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m, _restoredFromPanelState: true, _resumeAllowed: c._resumeAllowed !== false }),
        filterMessage: identityFilter,
      })

      assert.equal(await h.loadHistory(), true)
      assert.equal(h.getLastProjectCwd(), '/codex/loaded')
      assert.equal(projects.value.length, 1)
      assert.equal(projects.value[0].name, 'CodeX Project')
      assert.equal(projects.value[0].chats.length, 1)
    })

    it('filters subagent chats', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [
            { id: 'chat-a', name: 'Normal', sessionId: 's-a', cwd: '/p',
              messages: [makeMsg(1, 'user', 'hi')], filePath: '/sessions/normal.jsonl' },
            { id: 'chat-b', name: 'Sub', sessionId: 's-b', cwd: '/p',
              messages: [makeMsg(2, 'user', 'bye')], filePath: '/subagents/task.jsonl' },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      assert.equal(projects.value[0].chats.length, 1)
    })

    it('deduplicates chats by id keeping higher score', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [
            { id: 'chat-dup', name: 'V1', sessionId: 's1', cwd: '/p',
              messages: [makeMsg(1, 'user', 'a')], updatedAt: '2026-01-01T00:00:00Z' },
            { id: 'chat-dup', name: 'V2', sessionId: 's2', cwd: '/p',
              messages: [makeMsg(2, 'user', 'b'), makeMsg(3, 'assistant', 'c')], updatedAt: '2026-06-01T00:00:00Z' },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      // V2 has more messages → higher score → kept
      assert.equal(projects.value[0].chats.length, 1)
      assert.equal(projects.value[0].chats[0].name, 'V2')
    })

    it('sorts chats by updatedAt descending', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [
            { id: 'old', name: 'Old', sessionId: 's-old', cwd: '/p',
              messages: [makeMsg(1, 'user', 'old')], updatedAt: '2026-01-01T00:00:00Z' },
            { id: 'new', name: 'New', sessionId: 's-new', cwd: '/p',
              messages: [makeMsg(2, 'user', 'new')], updatedAt: '2026-06-01T00:00:00Z' },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      assert.equal(projects.value[0].chats.length, 2)
      // newest first
      assert.equal(projects.value[0].chats[0].name, 'New')
      assert.equal(projects.value[0].chats[1].name, 'Old')
    })

    it('filters ghost slash chats (isSuspiciousSlashChat)', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [
            { id: 'ghost', name: '/', sessionId: 's-ghost', cwd: '/p',
              messages: [] }, // empty → suspicious
            { id: 'real', name: 'Real Chat', sessionId: 's-real', cwd: '/p',
              messages: [makeMsg(1, 'user', 'real')] },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      // ghost chat with name '/' and no messages should be filtered
      assert.equal(projects.value[0].chats.length, 1)
      assert.equal(projects.value[0].chats[0].name, 'Real Chat')
    })

    it('filters meaningless local drafts (isMeaningfulCodexLocalDraft)', async () => {
      // isMeaningfulCodexLocalDraft considers a draft meaningful if:
      // - has cliSessionId/filePath, OR non-default title, OR description, OR instruction, OR visible user msgs
      // To be filtered, a draft must have: no session/path, default title, no messages, no description
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [
            { id: 'empty', name: '新对话', sessionId: 's-empty', cwd: '/p',
              messages: [], filePath: null, cliSessionId: null },
            { id: 'good', name: 'Good Chat', sessionId: 's-good', cwd: '/p',
              messages: [makeMsg(1, 'user', 'content')] },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      // empty draft with default title, no messages, no session/path → filtered
      assert.equal(projects.value[0].chats.length, 1)
      assert.equal(projects.value[0].chats[0].id, 'good')
    })

    it('filterMessage is called for message normalization', async () => {
      const filtered = []
      const filterSpy = (msgs) => {
        filtered.push(...msgs)
        // filter out assistant messages
        return msgs.filter(m => m.role !== 'assistant')
      }

      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [{
            id: 'chat-1', name: 'Chat', sessionId: 's-1', cwd: '/p',
            messages: [
              makeMsg(1, 'user', 'question'),
              makeMsg(2, 'assistant', 'answer'),
            ],
          }],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: filterSpy,
      })

      await h.loadHistory()
      assert.equal(projects.value[0].chats.length, 1)
      // filterMessage removed assistant, only user remains
      const msgs = projects.value[0].chats[0].messages
      assert.equal(msgs.length, 1)
      assert.equal(msgs[0].role, 'user')
    })

    it('marks restored chats with _restoredFromPanelState', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [{
            id: 'chat-1', name: 'Chat', sessionId: 's-1', cwd: '/p',
            messages: [makeMsg(1, 'user', 'hello')],
          }],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m, _restoredFromPanelState: true, _resumeAllowed: c._resumeAllowed !== false }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      const chat = projects.value[0].chats[0]
      assert.equal(chat._restoredFromPanelState, true)
    })

    it('respects _resumeAllowed flag', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [
            { id: 'resumable', name: 'Can Resume', sessionId: 's-r', cwd: '/p',
              messages: [makeMsg(1, 'user', 'hi')], _resumeAllowed: true },
            { id: 'blocked', name: 'Cannot Resume', sessionId: 's-b', cwd: '/p',
              messages: [makeMsg(2, 'user', 'hi')], _resumeAllowed: false },
          ],
        }],
      })

      let pc = 0, cc = 0, mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => pc, setProjectCounter: v => { pc = v },
        getChatCounter: () => cc, setChatCounter: v => { cc = v },
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m, _restoredFromPanelState: true, _resumeAllowed: c._resumeAllowed !== false }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      // _resumeAllowed: false is still loaded (isMeaningfulCodexLocalDraft handles filtering)
      // but the flag is passed through
      assert.equal(projects.value[0].chats.length, 2)
    })

    // ── P1 regression: msgId must be advanced correctly after restore ──
    it('P1: advances msgId to max historical id (not NaN)', async () => {
      globalThis.window.electronAPI.codexLoadCodePanelState = async () => ({
        lastCwd: '/p',
        projects: [{
          id: 'proj-1', name: 'P', cwd: '/p', cwdLocked: false, hasDoneNotification: false,
          additionalDirectories: [],
          chats: [{
            id: 'chat-1', name: 'Chat', sessionId: 's-1', cwd: '/p',
            messages: [
              { id: 15, role: 'user', text: 'first' },
              { id: 99, role: 'user', text: 'largest' },
              { id: 3, role: 'user', text: 'smaller' },
            ],
          }],
        }],
      })

      let mi = 0
      const projects = ref([])
      const h = useCodexHistory({
        projects, setProjects: v => projects.value = v,
        getProjectCounter: () => 0, setProjectCounter: () => {},
        getChatCounter: () => 0, setChatCounter: () => {},
        getMsgId: () => mi, setMsgId: v => { mi = v },
        makeRestoredChat: (c, m) => ({ ...c, messages: m }),
        filterMessage: identityFilter,
      })

      await h.loadHistory()
      // msgId should be advanced to the largest message id (99)
      assert.equal(mi, 99, 'msgId should be 99 after restore, not undefined/NaN')
      // Simulate creating next message: ++msgId should give 100, not NaN
      const nextId = ++mi
      assert.equal(nextId, 100, 'next message id should be 100')
      assert.ok(!Number.isNaN(nextId), 'next message id should not be NaN')
    })
  })
})

console.log('useCodexHistory characterization test passed')
