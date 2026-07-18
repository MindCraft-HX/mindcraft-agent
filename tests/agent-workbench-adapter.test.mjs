import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentWorkbenchAdapter } from '../packages/agent/src/workbench/agentAdapter.mjs'
import { createChatWorkbenchAdapter } from '../packages/agent/src/workbench/chatAdapter.mjs'

test('agent adapter projects lightweight project tabs without exposing panel data', () => {
  const calls = []
  const adapter = createAgentWorkbenchAdapter({
    getTabs: () => [{ id: 'claude:1', name: 'Project', cwd: 'D:/repo', runningCount: 1, hasPendingTool: false, messages: ['secret'] }],
    getActiveProject: () => 'claude:1',
    activateProject: (id, target) => calls.push({ id, target }),
  })
  assert.deepEqual(adapter.getSnapshot(), {
    itemId: 'agent:codehub', kind: 'agent', activeProjectId: 'claude:1',
    tabs: [{ id: 'claude:1', title: 'Project', running: true, pending: false }],
  })
  adapter.activate({ agentTarget: { projectId: 'claude:1' } })
  assert.deepEqual(calls, [{ id: 'claude:1', target: { projectId: 'claude:1' } }])
  assert.deepEqual(adapter.getWorkspaceContext(), { workspaceKey: 'D:/repo', cwd: 'D:/repo' })
})

test('chat adapter activates a session without exposing messages', async () => {
  let selected = ''
  const adapter = createChatWorkbenchAdapter({
    getSession: () => ({ id: 'chat-1', title: 'Planning', streaming: true, messages: ['secret'] }),
    activateSession: async id => { selected = id },
  })
  assert.deepEqual(adapter.getSnapshot(), { itemId: 'chat:simple', kind: 'chat', title: 'Planning', sessionId: 'chat-1', streaming: true })
  await adapter.activate({ chatTarget: { sessionId: 'chat-2' } })
  assert.equal(selected, 'chat-2')
})
