import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentWorkbenchAdapter } from '../packages/agent/src/workbench/agentAdapter.mjs'
import { createChatWorkbenchAdapter } from '../packages/agent/src/workbench/chatAdapter.mjs'

test('agent adapter projects lightweight project tabs without exposing panel data', () => {
  const calls = []
  const adapter = createAgentWorkbenchAdapter({
    getTabs: () => [{
      id: 'claude:1', projectId: '1', agentType: 'claudeCode', name: 'Project', cwd: 'D:/repo',
      runningCount: 1, hasPendingTool: false, hasDoneNotification: true,
      iconClass: 'claude-icon', iconStyle: { color: 'orange' }, messages: ['secret'],
    }],
    getActiveProject: () => 'claude:1',
    getSurfaceState: () => ({ visible: true, active: true, groupId: 'route' }),
    activateProject: (id, target) => calls.push({ id, target }),
  })
  assert.deepEqual(adapter.getSnapshot(), {
    itemId: 'agent:codehub', kind: 'agent', activeProjectId: 'claude:1',
    surfaceState: { visible: true, active: true, groupId: 'route' },
    workspaceContext: {
      workspaceKey: 'cwd:d:/repo', cwd: 'D:/repo',
      label: 'Project', agentType: 'claudeCode', source: 'agent-codehub',
    },
    tabs: [{
      id: 'claude:1', projectId: '1', agentType: 'claudeCode', title: 'Project',
      running: true, pending: false, notification: true,
      iconClass: 'claude-icon', iconStyle: { color: 'orange' },
    }],
  })
  adapter.activate({ agentTarget: { projectId: 'claude:1' } })
  assert.deepEqual(calls, [{ id: 'claude:1', target: { projectId: 'claude:1' } }])
  assert.deepEqual(adapter.getWorkspaceContext(), {
    workspaceKey: 'cwd:d:/repo', cwd: 'D:/repo',
    label: 'Project', agentType: 'claudeCode', source: 'agent-codehub',
  })
})

test('agent adapter delegates external tab commands and releases subscriptions', () => {
  const calls = []
  const adapter = createAgentWorkbenchAdapter({
    getTabs: () => [{ id: 'codex:1', projectId: '1', agentType: 'codex', name: 'Repo' }],
    getActiveProject: () => 'codex:1',
    activateProject: () => {},
    closeProject: id => { calls.push(['close', id]); return true },
    reorderProjects: (from, to) => { calls.push(['reorder', from, to]); return true },
    createProject: agentType => { calls.push(['create', agentType]); return true },
  })
  let published = 0
  adapter.subscribe(() => { published += 1 })
  assert.equal(adapter.closeProject('codex:1'), true)
  assert.equal(adapter.reorderProjects(0, 1), true)
  assert.equal(adapter.createProject('codex'), true)
  adapter.publish()
  assert.equal(published, 1)
  adapter.dispose()
  adapter.publish()
  assert.equal(published, 1)
  assert.deepEqual(calls, [['close', 'codex:1'], ['reorder', 0, 1], ['create', 'codex']])
})

test('chat adapter activates a session without exposing messages', async () => {
  let selected = ''
  const adapter = createChatWorkbenchAdapter({
    getSession: () => ({ id: 'chat-1', title: 'Planning', streaming: true, messages: ['secret'] }),
    activateSession: async id => { selected = id },
  })
  assert.deepEqual(adapter.getSnapshot(), {
    itemId: 'chat:simple', kind: 'chat', title: 'Planning', sessionId: 'chat-1', streaming: true, surfaceState: null,
  })
  await adapter.activate({ chatTarget: { sessionId: 'chat-2' } })
  assert.equal(selected, 'chat-2')
})
