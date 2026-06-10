import test from 'node:test'
import assert from 'node:assert/strict'

import {
  beginTaskBatch,
  clearTaskStateForNewTurn,
  createEmptyTaskState,
  dismissTaskBar,
  ensureTaskState,
  getTaskItems,
  getTaskViewModel,
  readTaskState,
  registerTaskStarted,
  registerTaskUpdated,
  toggleTaskBarCollapsed,
} from '../packages/agent/src/components/claudeCode/composables/useClaudeTaskState.mjs'

test('createEmptyTaskState returns v2 idle defaults', () => {
  const state = createEmptyTaskState()
  assert.equal(state.version, 2)
  assert.equal(state.phase, 'idle')
  assert.equal(state.visible, false)
  assert.deepEqual(state.todos, [])
  assert.deepEqual(state.runtimeSteps, [])
})

test('ensureTaskState drops legacy state during restore', () => {
  const tab = {
    taskState: {
      version: 1,
      visible: true,
      items: {
        old: { id: 'old', description: 'legacy', status: 'pending' },
      },
      orderedTaskIds: ['old'],
    },
  }

  const state = ensureTaskState(tab)

  assert.equal(state.version, 2)
  assert.equal(state.visible, false)
  assert.deepEqual(state.todos, [])
  assert.deepEqual(state.runtimeSteps, [])
})

test('beginTaskBatch clears runtime steps and reopens panel', () => {
  const tab = { taskState: createEmptyTaskState() }
  tab.taskState.visible = false
  tab.taskState.dismissed = true
  tab.taskState.todos = [
    { id: 'todo-1', description: 'old todo', status: 'completed', order: 1 },
  ]
  tab.taskState.runtimeSteps = [
    { id: 'runtime-1', description: 'old runtime', status: 'failed', toolUseId: 'tool-1', order: 1 },
  ]

  const meta = beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  assert.equal(meta.openedBatch, true)
  assert.equal(tab.taskState.visible, true)
  assert.equal(tab.taskState.dismissed, false)
  assert.deepEqual(tab.taskState.todos, [])
  assert.deepEqual(tab.taskState.runtimeSteps, [])
})

test('registerTaskStarted and registerTaskUpdated maintain runtime step order', () => {
  const tab = { taskState: createEmptyTaskState() }

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })
  registerTaskStarted(tab, {
    taskId: 'runtime-2',
    description: 'second step',
    toolUseId: 'tool-2',
    now: 2,
  })
  registerTaskStarted(tab, {
    taskId: 'runtime-1',
    description: 'first step',
    toolUseId: 'tool-1',
    now: 3,
  })
  registerTaskUpdated(tab, {
    taskId: 'runtime-1',
    patch: { status: 'completed' },
    now: 4,
  })

  assert.deepEqual(
    getTaskViewModel(tab).executionItems.map(item => item.id),
    ['runtime-2', 'runtime-1'],
  )
})

test('clearTaskStateForNewTurn preserves todos only', () => {
  const tab = {
    taskState: {
      version: 2,
      batchId: 'batch-1',
      phase: 'running',
      visible: true,
      dismissed: false,
      collapsed: true,
      updatedAt: 1,
      todos: [
        {
          id: 'todo-1',
          description: 'keep this todo',
          status: 'in_progress',
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      runtimeSteps: [
        {
          id: 'runtime-1',
          description: 'drop this runtime step',
          status: 'failed',
          toolUseId: 'tool-1',
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
  }

  clearTaskStateForNewTurn(tab, { now: 2 })

  assert.deepEqual(tab.taskState.todos.map(item => item.id), ['todo-1'])
  assert.deepEqual(tab.taskState.runtimeSteps, [])
  assert.equal(tab.taskState.collapsed, false)
})

test('dismissTaskBar and collapse operate on v2 state without deleting data', () => {
  const tab = { taskState: createEmptyTaskState() }
  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })
  registerTaskStarted(tab, {
    taskId: 'runtime-1',
    description: 'check logs',
    toolUseId: 'tool-1',
    now: 2,
  })

  toggleTaskBarCollapsed(tab, true, 3)
  dismissTaskBar(tab, 4)

  assert.equal(tab.taskState.collapsed, true)
  assert.equal(tab.taskState.dismissed, true)
  assert.equal(tab.taskState.visible, false)
  assert.equal(getTaskItems(tab).length, 1)
})

test('readTaskState does not replace normalized reference', () => {
  const original = createEmptyTaskState()
  const tab = { taskState: original }

  const state = readTaskState(tab)

  assert.equal(state, original)
  assert.equal(tab.taskState, original)
})
