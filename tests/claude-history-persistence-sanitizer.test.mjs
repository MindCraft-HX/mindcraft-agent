import test from 'node:test'
import assert from 'node:assert/strict'

import { useClaudeHistory } from '../packages/agent/src/components/claudeCode/composables/useClaudeHistory.js'
import {
  buildClaudePanelStatePayload,
  sanitizeClaudeProjectsForPersistence,
} from '../packages/agent/src/components/claudeCode/utils/historyPersistenceSanitizer.mjs'

test('claude history payload falls back to a valid active project and chat', () => {
  const payload = buildClaudePanelStatePayload({
    lastCwd: 'D:/repo',
    activeProjectId: null,
    activeChatId: null,
    projects: [{
      id: 'proj-1',
      name: 'Project',
      cwd: 'D:/repo',
      cwdLocked: true,
      chats: [{
        id: 'chat-1',
        name: 'Chat',
        sessionId: 'sid-1',
        cliSessionId: 'cli-1',
        filePath: 'C:/Users/me/.claude/projects/repo/cli-1.jsonl',
        updatedAt: '2026-06-10T04:00:00.000Z',
        messages: [],
      }],
    }],
  })

  assert.equal(payload.activeProjectId, 'proj-1')
  assert.equal(payload.activeChatId, 'chat-1')
})

test('claude history payload removes duplicate chats bound to the same jsonl', () => {
  const payload = buildClaudePanelStatePayload({
    lastCwd: 'D:/repo',
    activeProjectId: null,
    activeChatId: null,
    projects: [{
      id: 'proj-1',
      name: 'Project',
      cwd: 'D:/repo',
      cwdLocked: true,
      chats: [
        {
          id: 'chat-old',
          name: 'Old duplicate',
          sessionId: 'placeholder-session',
          cliSessionId: 'cli-1',
          filePath: 'C:/Users/me/.claude/projects/repo/cli-1.jsonl',
          createdAt: '2026-06-10T03:00:00.000Z',
          updatedAt: '2026-06-10T04:00:00.000Z',
          fileSize: 100,
          messages: [],
        },
        {
          id: 'chat-new',
          name: 'Real chat',
          sessionId: 'cli-1',
          cliSessionId: 'cli-1',
          filePath: 'C:\\Users\\me\\.claude\\projects\\repo\\cli-1.jsonl',
          createdAt: '2026-06-10T03:10:00.000Z',
          updatedAt: '2026-06-10T04:10:00.000Z',
          fileSize: 200,
          messages: [],
        },
      ],
    }],
  })

  assert.deepEqual(payload.projects[0].chats.map(chat => chat.id), ['chat-new'])
  assert.equal(payload.activeProjectId, 'proj-1')
  assert.equal(payload.activeChatId, 'chat-new')
})

test('claude project sanitizer remaps active chat when duplicate active entry is removed', () => {
  const result = sanitizeClaudeProjectsForPersistence({
    activeProjectId: 'proj-1',
    activeChatId: 'chat-old',
    projects: [{
      id: 'proj-1',
      chats: [
        {
          id: 'chat-old',
          sessionId: 'placeholder-session',
          cliSessionId: 'cli-1',
          filePath: 'C:/Users/me/.claude/projects/repo/cli-1.jsonl',
          updatedAt: '2026-06-10T04:00:00.000Z',
          fileSize: 100,
        },
        {
          id: 'chat-new',
          sessionId: 'cli-1',
          cliSessionId: 'cli-1',
          filePath: 'C:/Users/me/.claude/projects/repo/cli-1.jsonl',
          updatedAt: '2026-06-10T04:10:00.000Z',
          fileSize: 200,
        },
      ],
    }],
  })

  assert.deepEqual(result.projects[0].chats.map(chat => chat.id), ['chat-new'])
  assert.equal(result.activeProjectId, 'proj-1')
  assert.equal(result.activeChatId, 'chat-new')
})

test('claude history load sanitizes persisted duplicate chats before applying projects', async () => {
  let restoredProjects = null
  let restoredActiveProjectId = null
  let restoredActiveChatId = null
  const projects = { value: [] }

  global.window = {
    electronAPI: {
      claudeLoadCodePanelState: async () => ({
        lastCwd: 'D:/repo',
        projects: [{
          id: 'proj-1',
          name: 'Project',
          cwd: 'D:/repo',
          cwdLocked: true,
          chats: [
            {
              id: 'chat-old',
              sessionId: 'placeholder-session',
              cliSessionId: 'cli-1',
              filePath: 'C:/Users/me/.claude/projects/repo/cli-1.jsonl',
              updatedAt: '2026-06-10T04:00:00.000Z',
              fileSize: 100,
              messages: [],
            },
            {
              id: 'chat-new',
              sessionId: 'cli-1',
              cliSessionId: 'cli-1',
              filePath: 'C:/Users/me/.claude/projects/repo/cli-1.jsonl',
              updatedAt: '2026-06-10T04:10:00.000Z',
              fileSize: 200,
              messages: [],
            },
          ],
        }],
      }),
    },
  }

  const history = useClaudeHistory({
    projects,
    setProjects: (next) => {
      restoredProjects = next
      projects.value = next
    },
    getProjectCounter: () => 0,
    setProjectCounter: () => {},
    getChatCounter: () => 0,
    setChatCounter: () => {},
    getMsgId: () => 0,
    setMsgId: () => {},
    makeRestoredChat: (chat, messages) => ({ ...chat, messages }),
    getActiveProjectId: () => null,
    setActiveProjectId: (next) => { restoredActiveProjectId = next },
    getActiveChatId: () => null,
    setActiveChatId: (next) => { restoredActiveChatId = next },
  })

  const loaded = await history.loadHistory()

  assert.equal(loaded, true)
  assert.deepEqual(restoredProjects[0].chats.map(chat => chat.id), ['chat-new'])
  assert.equal(restoredActiveProjectId, 'proj-1')
  assert.equal(restoredActiveChatId, 'chat-new')
})
