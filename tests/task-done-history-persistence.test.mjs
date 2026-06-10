import assert from 'node:assert/strict'
import { useClaudeHistory } from '../packages/agent/src/components/claudeCode/composables/useClaudeHistory.js'
import { useCodexHistory } from '../packages/agent/src/components/codeX/composables/useCodexHistory.js'

function makeProjectsRef(hasDoneNotification) {
  return {
    value: [{
      id: 'proj-1',
      name: 'Project 1',
      cwd: 'D:/demo',
      cwdLocked: true,
      hasDoneNotification,
      chats: [{
        id: 'chat-1',
        name: 'Chat 1',
        sessionId: 'sid-1',
        messages: [],
        thinking: false,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      }],
    }],
  }
}

function makeRestoredChat(chat, messages) {
  return {
    ...chat,
    messages,
  }
}

async function testClaudeHistoryPersistence() {
  const projects = makeProjectsRef(true)
  let savedPayload = null
  let restoredProjects = null
  let restoredActiveProjectId = null
  let restoredActiveChatId = null

  global.window = {
    electronAPI: {
      claudeSaveCodePanelState: async (payload) => { savedPayload = payload },
      claudeSaveCodePanelStateSync: (payload) => { savedPayload = payload },
      claudeLoadCodePanelState: async () => ({
        lastCwd: 'D:/demo',
        activeProjectId: 'proj-1',
        activeChatId: 'chat-1',
        projects: [{
          id: 'proj-1',
          name: 'Project 1',
          cwd: 'D:/demo',
          cwdLocked: true,
          hasDoneNotification: true,
          chats: [{
            id: 'chat-1',
            name: 'Chat 1',
            sessionId: 'sid-1',
            messages: [],
          }],
        }],
      }),
    },
  }

  const history = useClaudeHistory({
    projects,
    setProjects: (next) => { restoredProjects = next },
    getProjectCounter: () => 0,
    setProjectCounter: () => {},
    getChatCounter: () => 0,
    setChatCounter: () => {},
    getMsgId: () => 0,
    setMsgId: () => {},
    makeRestoredChat,
    getActiveProjectId: () => 'proj-1',
    setActiveProjectId: (next) => { restoredActiveProjectId = next },
    getActiveChatId: () => 'chat-1',
    setActiveChatId: (next) => { restoredActiveChatId = next },
  })

  history.saveHistory({ immediate: true })
  assert.equal(savedPayload.projects[0].hasDoneNotification, true)
  assert.equal(savedPayload.activeProjectId, 'proj-1')
  assert.equal(savedPayload.activeChatId, 'chat-1')

  const loaded = await history.loadHistory()
  assert.equal(loaded, true)
  assert.equal(restoredProjects[0].hasDoneNotification, true)
  assert.equal(restoredActiveProjectId, 'proj-1')
  assert.equal(restoredActiveChatId, 'chat-1')
}

async function testCodexHistoryPersistence() {
  const projects = makeProjectsRef(true)
  let savedPayload = null
  let restoredProjects = null

  global.window = {
    electronAPI: {
      codexSaveCodePanelState: async (payload) => { savedPayload = payload },
      codexSaveCodePanelStateSync: (payload) => { savedPayload = payload },
      codexLoadCodePanelState: async () => ({
        lastCwd: 'D:/demo',
        projects: [{
          id: 'proj-1',
          name: 'Project 1',
          cwd: 'D:/demo',
          cwdLocked: true,
          hasDoneNotification: true,
          chats: [{
            id: 'chat-1',
            name: 'Chat 1',
            sessionId: 'sid-1',
            messages: [],
          }],
        }],
      }),
    },
  }

  const history = useCodexHistory({
    projects,
    setProjects: (next) => { restoredProjects = next },
    getProjectCounter: () => 0,
    setProjectCounter: () => {},
    getChatCounter: () => 0,
    setChatCounter: () => {},
    getMsgId: () => 0,
    setMsgId: () => {},
    makeRestoredChat,
    filterMessage: (messages) => messages,
  })

  history.saveHistory({ immediate: true })
  assert.equal(savedPayload.projects[0].hasDoneNotification, true)

  const loaded = await history.loadHistory()
  assert.equal(loaded, true)
  assert.equal(restoredProjects[0].hasDoneNotification, true)
}

await testClaudeHistoryPersistence()
await testCodexHistoryPersistence()

console.log('task done history persistence test passed')
