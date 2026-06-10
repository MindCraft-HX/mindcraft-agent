import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPlanToolUse,
  applyPlanToolResult,
  beginTaskBatch,
  clearTaskStateForNewTurn,
  createEmptyTaskState,
  getTaskDebugSnapshot,
  getTaskViewModel,
  registerTaskStarted,
  registerTaskUpdated,
  readTaskState,
} from '../packages/agent/src/components/claudeCode/composables/useClaudeTaskState.mjs'

function createTab(taskState = createEmptyTaskState()) {
  return { taskState }
}

test('TodoWrite tool result populates top-level todos only', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  const meta = applyPlanToolResult(tab, {
    toolName: 'TodoWrite',
    toolUseId: 'todo-1',
    content: {
      todos: [
        { id: 'todo-1', content: '修复 task 面板状态机', status: 'in_progress' },
        { id: 'todo-2', content: '验证历史恢复', status: 'pending' },
      ],
    },
    now: 2,
  })

  assert.equal(meta.changed, true)
  const viewModel = getTaskViewModel(tab)
  assert.deepEqual(
    viewModel.planItems.map(item => ({ id: item.id, description: item.description, status: item.status })),
    [
      { id: 'todo-1', description: '修复 task 面板状态机', status: 'in_progress' },
      { id: 'todo-2', description: '验证历史恢复', status: 'pending' },
    ],
  )
  assert.deepEqual(viewModel.executionItems, [])
})

test('TaskCreate populates top-level plan item and TaskUpdate keeps its description', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  applyPlanToolUse(tab, {
    toolName: 'TaskCreate',
    toolUseId: 'task-create-1',
    input: {
      description: 'Validate gray deployment',
    },
    now: 2,
  })

  applyPlanToolResult(tab, {
    toolName: 'TaskUpdate',
    toolUseId: 'task-update-1',
    content: {
      taskId: '4',
      status: 'in_progress',
    },
    now: 3,
  })

  const viewModel = getTaskViewModel(tab)
  assert.deepEqual(
    viewModel.planItems.map(item => ({ id: item.id, description: item.description, status: item.status })),
    [
      { id: '4', description: 'Validate gray deployment', status: 'in_progress' },
    ],
  )
  assert.deepEqual(viewModel.executionItems, [])
})

test('TaskCreate tool results bind pending todos to global task ids before later TaskUpdate events', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  const pendingTasks = [
    ['call-1', 'Create cache billing doc'],
    ['call-2', 'Update import-models command'],
    ['call-3', 'Update CLAUDE.md references'],
    ['call-4', 'Create DRF cache memory'],
  ]

  pendingTasks.forEach(([toolUseId, description], index) => {
    applyPlanToolUse(tab, {
      toolName: 'TaskCreate',
      toolUseId,
      input: { description },
      now: 10 + index,
    })
  })

  ;['9', '10', '11', '12'].forEach((taskId, index) => {
    applyPlanToolResult(tab, {
      toolName: 'TaskCreate',
      toolUseId: `call-${index + 1}`,
      content: {
        toolUseResult: {
          task: {
            id: taskId,
            subject: pendingTasks[index][1],
          },
        },
      },
      now: 20 + index,
    })
  })

  ;['9', '10', '11', '12'].forEach((taskId, index) => {
    applyPlanToolResult(tab, {
      toolName: 'TaskUpdate',
      toolUseId: `update-${taskId}`,
      content: {
        taskId,
        status: index === 3 ? 'completed' : 'in_progress',
      },
      now: 30 + index,
    })
  })

  ;['9', '10', '11', '12'].forEach((taskId, index) => {
    applyPlanToolResult(tab, {
      toolName: 'TaskUpdate',
      toolUseId: `finish-${taskId}`,
      content: {
        taskId,
        status: 'completed',
      },
      now: 40 + index,
    })
  })

  const snapshot = getTaskDebugSnapshot(tab)
  assert.deepEqual(snapshot.todos, [
    { id: '9', description: 'Create cache billing doc', status: 'completed' },
    { id: '10', description: 'Update import-models command', status: 'completed' },
    { id: '11', description: 'Update CLAUDE.md references', status: 'completed' },
    { id: '12', description: 'Create DRF cache memory', status: 'completed' },
  ])
  assert.equal(snapshot.phase, 'done')
})

test('TaskUpdate tool result statusChange does not roll completed todos back to pending', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  applyPlanToolUse(tab, {
    toolName: 'TaskCreate',
    toolUseId: 'create-1',
    input: { description: 'Create release note' },
    now: 2,
  })

  applyPlanToolResult(tab, {
    toolName: 'TaskCreate',
    toolUseId: 'create-1',
    content: {
      toolUseResult: {
        task: {
          id: '1',
          subject: 'Create release note',
        },
      },
    },
    now: 3,
  })

  applyPlanToolUse(tab, {
    toolName: 'TaskUpdate',
    toolUseId: 'update-1',
    input: {
      taskId: '1',
      status: 'completed',
    },
    now: 4,
  })

  applyPlanToolResult(tab, {
    toolName: 'TaskUpdate',
    toolUseId: 'update-1',
    content: {
      content: 'Updated task #1 status',
      toolUseResult: {
        success: true,
        taskId: '1',
        updatedFields: ['status'],
        statusChange: {
          from: 'in_progress',
          to: 'completed',
        },
      },
    },
    now: 5,
  })

  assert.deepEqual(getTaskDebugSnapshot(tab).todos, [
    { id: '1', description: 'Create release note', status: 'completed' },
  ])
})

test('system task events populate runtime steps only', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  const startedMeta = registerTaskStarted(tab, {
    taskId: 'runtime-1',
    description: 'Start mindcraft-api locally on port 86',
    toolUseId: 'tool-runtime-1',
    now: 2,
  })

  assert.equal(startedMeta.created, true)

  const updatedMeta = registerTaskUpdated(tab, {
    taskId: 'runtime-1',
    patch: { status: 'failed' },
    now: 3,
  })

  assert.equal(updatedMeta.becameDone, true)

  const viewModel = getTaskViewModel(tab)
  assert.deepEqual(viewModel.planItems, [])
  assert.deepEqual(
    viewModel.executionItems.map(item => ({ id: item.id, description: item.description, status: item.status })),
    [
      { id: 'runtime-1', description: 'Start mindcraft-api locally on port 86', status: 'failed' },
    ],
  )
})

test('clearTaskStateForNewTurn keeps todos but clears previous runtime steps', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })

  applyPlanToolResult(tab, {
    toolName: 'TodoWrite',
    toolUseId: 'todo-1',
    content: {
      todos: [
        { id: 'todo-1', content: '排查计费异常', status: 'in_progress' },
      ],
    },
    now: 2,
  })

  registerTaskStarted(tab, {
    taskId: 'runtime-1',
    description: 'Restart mindcraft-api with debug logging',
    toolUseId: 'tool-runtime-1',
    now: 3,
  })

  clearTaskStateForNewTurn(tab, { now: 4 })

  const viewModel = getTaskViewModel(tab)
  assert.deepEqual(
    viewModel.planItems.map(item => item.id),
    ['todo-1'],
  )
  assert.deepEqual(viewModel.executionItems, [])
})

test('readTaskState drops legacy taskState v1 on restore', () => {
  const tab = createTab({
    version: 1,
    batchId: 'legacy-batch',
    phase: 'running',
    visible: true,
    dismissed: false,
    collapsed: false,
    updatedAt: 3,
    items: {
      'legacy-task': {
        id: 'legacy-task',
        description: '历史脏数据',
        status: 'in_progress',
        toolUseId: 'legacy-tool',
      },
    },
    orderedTaskIds: ['legacy-task'],
  })

  const state = readTaskState(tab)
  assert.equal(state.version, 2)
  assert.equal(state.visible, false)
  assert.deepEqual(state.todos, [])
  assert.deepEqual(state.runtimeSteps, [])
})

test('task debug snapshot reflects separated todos and runtime steps', () => {
  const tab = createTab()

  beginTaskBatch(tab, { reason: 'user_turn', now: 1 })
  applyPlanToolResult(tab, {
    toolName: 'TodoWrite',
    toolUseId: 'todo-1',
    content: {
      todos: [
        { id: 'todo-1', content: '修复日志吞异常', status: 'in_progress' },
      ],
    },
    now: 2,
  })
  registerTaskStarted(tab, {
    taskId: 'runtime-1',
    description: 'Check gray container startup and logs',
    toolUseId: 'tool-runtime-1',
    now: 3,
  })

  assert.deepEqual(getTaskDebugSnapshot(tab), {
    phase: 'running',
    visible: true,
    dismissed: false,
    collapsed: false,
    todos: [
      {
        id: 'todo-1',
        description: '修复日志吞异常',
        status: 'in_progress',
      },
    ],
    runtimeSteps: [
      {
        id: 'runtime-1',
        toolUseId: 'tool-runtime-1',
        description: 'Check gray container startup and logs',
        status: 'in_progress',
      },
    ],
  })
})
