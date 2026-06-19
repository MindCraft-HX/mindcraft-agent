import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

globalThis.requestIdleCallback = globalThis.requestIdleCallback || ((cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 0))
globalThis.window = globalThis.window || { electronAPI: {} }

import { useCodexAgentStream } from '../packages/agent/src/components/codeX/composables/useCodexAgentStream.js'

function createHarness({ activeProjectId = 'proj-1', panelActive = true } = {}) {
  let msgId = 0
  let doneCount = 0
  let flashCount = 0
  const tab = {
    id: 'chat-1',
    sessionId: 'sess-1',
    cwd: 'D:/repo',
    messages: [],
    thinking: true,
    _awaitingDone: true,
    currentAssistantId: null,
  }
  const ownerProject = { id: 'proj-1', chats: [tab], hasDoneNotification: false }
  const projects = ref([ownerProject])
  const tabs = ref([tab])
  const nextMsgId = () => `msg-${++msgId}`

  globalThis.window.electronAPI = {
    flashTaskbar: () => { flashCount++ },
    codexRegisterCliSessions: () => {},
  }

  const stream = useCodexAgentStream({
    tabs,
    projects,
    getActiveProjectId: () => activeProjectId,
    isPanelActive: ref(panelActive),
    onTaskDone: () => { doneCount++ },
    scrollBottom: () => {},
    saveHistory: () => {},
    nextMsgId,
    isWriteTool: () => false,
    isEditTool: () => false,
    isBashTool: () => false,
    isReadTool: () => false,
    inferToolFailureFromText: () => false,
    createToolMessage: (opts) => ({ id: nextMsgId(), role: 'tool', ...opts }),
    onNewMessage: () => {},
    trimMessages: () => {},
    onCompactBoundary: () => {},
  })

  return { tab, ownerProject, stream, getDoneCount: () => doneCount, getFlashCount: () => flashCount }
}

test('completed done marks background project notification', () => {
  const { ownerProject, stream, getDoneCount, getFlashCount } = createHarness({
    activeProjectId: 'proj-2',
    panelActive: false,
  })

  stream.onAgentDone({ sessionId: 'sess-1', cliSessionId: 'cli-1', reason: 'completed' })

  assert.equal(ownerProject.hasDoneNotification, true)
  assert.equal(getDoneCount(), 1)
  assert.equal(getFlashCount(), 1)
})

test('aborted done does not mark completion notification', () => {
  const { ownerProject, tab, stream, getDoneCount, getFlashCount } = createHarness({
    activeProjectId: 'proj-2',
    panelActive: false,
  })

  stream.onAgentDone({ sessionId: 'sess-1', cliSessionId: 'cli-1', reason: 'aborted' })

  assert.equal(ownerProject.hasDoneNotification, false)
  assert.equal(getDoneCount(), 0)
  assert.equal(getFlashCount(), 0)
  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, false)
})

test('terminal stream message clears thinking even if done event is delayed', () => {
  const { ownerProject, tab, stream, getDoneCount } = createHarness()

  stream.onAgentMessage({ sessionId: 'sess-1', msg: { type: 'task_complete', payload: { type: 'task_complete' } } })

  assert.equal(tab.thinking, false)
  assert.equal(tab._awaitingDone, false)
  assert.equal(tab.currentAssistantId, null)
  assert.equal(ownerProject.hasDoneNotification, false)
  assert.equal(getDoneCount(), 0)
})
