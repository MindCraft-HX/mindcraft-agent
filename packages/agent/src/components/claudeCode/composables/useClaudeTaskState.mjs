function nowTs(now) {
  return Number.isFinite(now) ? Number(now) : Date.now()
}

const TASK_STATE_MARK = '__mindcraftTaskStateNormalized'
const TASK_STATE_VERSION = 2

function markTaskState(state) {
  if (!state || typeof state !== 'object') return state
  try {
    Object.defineProperty(state, TASK_STATE_MARK, {
      value: true,
      configurable: true,
      enumerable: false,
      writable: true,
    })
  } catch (_) {
    state[TASK_STATE_MARK] = true
  }
  return state
}

function normalizeStatus(status, fallback = 'pending') {
  const value = String(status || fallback || 'pending').toLowerCase()
  if (value === 'completed' || value === 'done') return 'completed'
  if (value === 'in_progress' || value === 'running' || value === 'active') return 'in_progress'
  if (value === 'cancelled' || value === 'canceled' || value === 'deleted' || value === 'removed' || value === 'stopped' || value === 'killed') return 'deleted'
  if (value === 'failed' || value === 'error') return 'failed'
  return 'pending'
}

const DEV = typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production'

function normalizeTodoItem(raw = {}, order = 0) {
  const id = String(raw.id || raw.taskId || raw.task_id || '')
  if (!id) return null
  return {
    id,
    description: raw.description || raw.content || raw.task || raw.subject || '',
    status: normalizeStatus(raw.status, 'pending'),
    order: Number.isFinite(raw.order) ? Number(raw.order) : order,
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : 0,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
  }
}

function normalizeRuntimeStep(raw = {}, order = 0) {
  const id = String(raw.id || raw.taskId || raw.task_id || '')
  if (!id) return null
  return {
    id,
    description: raw.description || '',
    status: normalizeStatus(raw.status, 'pending'),
    toolUseId: raw.toolUseId || '',
    order: Number.isFinite(raw.order) ? Number(raw.order) : order,
    createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : 0,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
  }
}

function cloneTodoItems(list = []) {
  const next = []
  for (const item of Array.isArray(list) ? list : []) {
    const normalized = normalizeTodoItem(item, next.length + 1)
    if (!normalized) continue
    next.push(normalized)
  }
  return next
}

function cloneRuntimeSteps(list = []) {
  const next = []
  for (const item of Array.isArray(list) ? list : []) {
    const normalized = normalizeRuntimeStep(item, next.length + 1)
    if (!normalized) continue
    next.push(normalized)
  }
  return next
}

export function createEmptyTaskState() {
  return markTaskState({
    version: TASK_STATE_VERSION,
    batchId: null,
    phase: 'idle',
    visible: false,
    dismissed: false,
    collapsed: false,
    updatedAt: 0,
    todos: [],
    runtimeSteps: [],
  })
}

function createBatchId(now) {
  return `batch-${nowTs(now)}-${Math.random().toString(36).slice(2, 8)}`
}

function setStateUpdated(state, now) {
  state.updatedAt = nowTs(now)
}

function allRuntimeStepsFinished(state) {
  if (!state.runtimeSteps.length) return false
  return state.runtimeSteps.every(step => {
    const status = step?.status
    return status === 'completed' || status === 'deleted' || status === 'failed'
  })
}

function syncPhase(state) {
  if (state.runtimeSteps.length) {
    state.phase = allRuntimeStepsFinished(state) ? 'done' : 'running'
    return state.phase
  }
  if (state.todos.length) {
    const allTodosFinished = state.todos.every(todo => {
      const status = todo?.status
      return status === 'completed' || status === 'deleted' || status === 'failed'
    })
    state.phase = allTodosFinished ? 'done' : 'running'
    return state.phase
  }
  state.phase = 'idle'
  return state.phase
}

function buildNormalizedTaskState(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return createEmptyTaskState()
  }
  if (incoming[TASK_STATE_MARK] && incoming.version === TASK_STATE_VERSION) {
    return incoming
  }
  if (Number(incoming.version) !== TASK_STATE_VERSION) {
    return createEmptyTaskState()
  }

  const state = createEmptyTaskState()
  state.batchId = incoming.batchId || null
  state.phase = typeof incoming.phase === 'string' ? incoming.phase : 'idle'
  state.visible = Boolean(incoming.visible)
  state.dismissed = Boolean(incoming.dismissed)
  state.collapsed = Boolean(incoming.collapsed)
  state.updatedAt = Number.isFinite(incoming.updatedAt) ? Number(incoming.updatedAt) : 0
  state.todos = cloneTodoItems(incoming.todos)
  repairOrphanTaskUpdates(state)
  state.runtimeSteps = cloneRuntimeSteps(incoming.runtimeSteps)
  syncPhase(state)
  return markTaskState(state)
}

export function readTaskState(tab) {
  return buildNormalizedTaskState(tab?.taskState)
}

export function ensureTaskState(tab) {
  const state = buildNormalizedTaskState(tab?.taskState)
  if (tab && tab.taskState !== state) tab.taskState = state
  return state
}

export function beginTaskBatch(tab, { reason = 'user_turn', now } = {}) {
  const state = ensureTaskState(tab)
  const ts = nowTs(now)
  state.batchId = createBatchId(ts)
  state.visible = true
  state.dismissed = false
  if (reason === 'user_turn') {
    state.collapsed = false
  }
  state.todos = []
  state.runtimeSteps = []
  syncPhase(state)
  setStateUpdated(state, ts)
  return { openedBatch: true, shouldPersistImmediately: true, reason }
}

export function clearTaskStateForNewTurn(tab, { now } = {}) {
  const state = ensureTaskState(tab)
  state.batchId = createBatchId(now)
  state.runtimeSteps = []
  state.visible = state.todos.length > 0
  state.dismissed = false
  state.collapsed = false
  syncPhase(state)
  setStateUpdated(state, now)
  return state
}

function upsertRuntimeStep(state, { taskId, description = '', toolUseId = '', status, now } = {}) {
  const id = String(taskId || '')
  if (!id) return { created: false, item: null }
  const ts = nowTs(now)
  let item = state.runtimeSteps.find(step => step.id === id) || null
  let created = false

  if (!item) {
    created = true
    item = normalizeRuntimeStep({
      id,
      description,
      toolUseId,
      status,
      order: state.runtimeSteps.length + 1,
      createdAt: ts,
      updatedAt: ts,
    }, state.runtimeSteps.length + 1)
    state.runtimeSteps.push(item)
  }

  item.description = description || item.description || ''
  item.toolUseId = toolUseId || item.toolUseId || ''
  item.status = normalizeStatus(status, item.status || 'in_progress')
  item.updatedAt = ts
  item.order = state.runtimeSteps.findIndex(step => step.id === id) + 1
  return { created, item }
}

export function registerTaskStarted(tab, { taskId, description = '', toolUseId = '', now } = {}) {
  const state = ensureTaskState(tab)
  const meta = upsertRuntimeStep(state, {
    taskId,
    description,
    toolUseId,
    status: 'in_progress',
    now,
  })
  state.visible = true
  state.dismissed = false
  syncPhase(state)
  setStateUpdated(state, now)
  return {
    created: meta.created,
    adoptedPendingTaskId: '',
    shouldPersistImmediately: meta.created,
  }
}

export function registerTaskUpdated(tab, { taskId, patch = {}, now } = {}) {
  const state = ensureTaskState(tab)
  const prevPhase = state.phase
  const meta = upsertRuntimeStep(state, {
    taskId,
    description: patch.description || '',
    toolUseId: patch.toolUseId || '',
    status: patch.status,
    now,
  })
  state.visible = true
  state.dismissed = false
  syncPhase(state)
  setStateUpdated(state, now)
  return {
    created: meta.created,
    becameDone: prevPhase !== 'done' && state.phase === 'done',
    shouldPersistImmediately: meta.created || (prevPhase !== 'done' && state.phase === 'done'),
  }
}

export function dismissTaskBar(tab, now) {
  const state = ensureTaskState(tab)
  state.dismissed = true
  state.visible = false
  setStateUpdated(state, now)
  return state
}

export function toggleTaskBarCollapsed(tab, collapsed, now) {
  const state = ensureTaskState(tab)
  state.collapsed = collapsed === undefined ? !state.collapsed : Boolean(collapsed)
  setStateUpdated(state, now)
  return state.collapsed
}

export function getTaskViewModel(tab) {
  const state = readTaskState(tab)
  return {
    planItems: cloneTodoItems(state.todos).filter(item => String(item.description || '').trim()),
    executionItems: cloneRuntimeSteps(state.runtimeSteps)
      .filter(item => String(item.description || '').trim()),
  }
}

export function getTaskItems(tab) {
  const viewModel = getTaskViewModel(tab)
  return [...viewModel.planItems, ...viewModel.executionItems]
}

export function getTaskDebugSnapshot(tab) {
  const state = readTaskState(tab)
  return {
    phase: state.phase,
    visible: Boolean(state.visible),
    dismissed: Boolean(state.dismissed),
    collapsed: Boolean(state.collapsed),
    todos: state.todos.map(item => ({
      id: item.id,
      description: item.description || '',
      status: item.status || 'pending',
    })),
    runtimeSteps: state.runtimeSteps.map(item => ({
      id: item.id,
      toolUseId: item.toolUseId || '',
      description: item.description || '',
      status: item.status || 'pending',
    })),
  }
}

function normalizeTaskToolName(name) {
  const n = String(name || '').toLowerCase()
  if (n === 'todowrite' || n === 'todo_write') return 'todowrite'
  if (n === 'tasklist' || n === 'task_list') return 'tasklist'
  if (n === 'taskcreate' || n === 'task_create') return 'taskcreate'
  if (n === 'taskupdate' || n === 'task_update') return 'taskupdate'
  if (n === 'taskdelete' || n === 'task_delete') return 'taskdelete'
  return ''
}

export function isTaskToolName(name) {
  return Boolean(normalizeTaskToolName(name))
}

function parseToolPayload(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    if (content.tool_use_result && typeof content.tool_use_result === 'object') {
      return content.tool_use_result
    }
    if (content.toolUseResult && typeof content.toolUseResult === 'object') {
      return {
        ...content,
        ...content.toolUseResult,
      }
    }
    return content
  }

  if (Array.isArray(content)) {
    const joined = content
      .filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join('\n')
    return parseToolPayload(joined)
  }

  if (typeof content === 'string') {
    const raw = content.trim()
    if (!raw) return {}
    try {
      return JSON.parse(raw)
    } catch (_) {
      return {}
    }
  }

  return {}
}

function extractTaskArray(payload) {
  if (Array.isArray(payload?.tasks)) return payload.tasks
  if (Array.isArray(payload?.todos)) return payload.todos
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.toolUseResult?.tasks)) return payload.toolUseResult.tasks
  if (Array.isArray(payload?.toolUseResult?.todos)) return payload.toolUseResult.todos
  if (Array.isArray(payload?.toolUseResult?.items)) return payload.toolUseResult.items
  return null
}

function pickTaskId(payload = {}, fallbackId = '') {
  const id = payload?.taskId
    ?? payload?.task_id
    ?? payload?.id
    ?? payload?.task?.id
    ?? payload?.toolUseResult?.task?.id
    ?? fallbackId
  return id === undefined || id === null ? '' : String(id)
}

function pickTaskDescription(payload = {}, fallback = '') {
  if (typeof payload?.description === 'string' && payload.description.trim()) return payload.description
  if (typeof payload?.task?.subject === 'string' && payload.task.subject.trim()) return payload.task.subject
  if (typeof payload?.task?.description === 'string' && payload.task.description.trim()) return payload.task.description
  if (typeof payload?.subject === 'string' && payload.subject.trim()) return payload.subject
  if (typeof payload?.activeForm === 'string' && payload.activeForm.trim()) return payload.activeForm
  if (typeof payload?.task === 'string' && payload.task.trim()) return payload.task
  if (typeof payload?.toolUseResult?.task?.subject === 'string' && payload.toolUseResult.task.subject.trim()) return payload.toolUseResult.task.subject
  if (typeof payload?.toolUseResult?.task?.description === 'string' && payload.toolUseResult.task.description.trim()) return payload.toolUseResult.task.description
  if (typeof payload?.content === 'string' && payload.content.trim()) return payload.content
  return fallback || ''
}

function hasSemanticTaskDescription(payload = {}) {
  return Boolean(
    (typeof payload?.description === 'string' && payload.description.trim())
      || (typeof payload?.task?.subject === 'string' && payload.task.subject.trim())
      || (typeof payload?.task?.description === 'string' && payload.task.description.trim())
      || (typeof payload?.subject === 'string' && payload.subject.trim())
      || (typeof payload?.activeForm === 'string' && payload.activeForm.trim())
      || (typeof payload?.task === 'string' && payload.task.trim())
      || (typeof payload?.toolUseResult?.task?.subject === 'string' && payload.toolUseResult.task.subject.trim())
      || (typeof payload?.toolUseResult?.task?.description === 'string' && payload.toolUseResult.task.description.trim()),
  )
}

function pickTaskStatus(payload = {}, fallback = 'pending') {
  const status = payload?.status
    ?? payload?.statusChange?.to
    ?? payload?.status_change?.to
    ?? payload?.toolUseResult?.status
    ?? payload?.toolUseResult?.statusChange?.to
    ?? payload?.toolUseResult?.status_change?.to
    ?? fallback
  return normalizeStatus(status, fallback)
}

function getTodoOrderIndex(todo, fallbackIndex) {
  const order = Number(todo?.order)
  return Number.isFinite(order) && order > 0 ? order - 1 : fallbackIndex
}

function findPendingTodoByNumericOrder(state, taskId) {
  const numericTaskId = Number(taskId)
  if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return null

  const targetIndex = numericTaskId - 1
  return state.todos.find((todo, index) => {
    if (!String(todo?.id || '').startsWith('__pending__:')) return false
    if (!String(todo?.description || '').trim()) return false
    return getTodoOrderIndex(todo, index) === targetIndex
  }) || null
}

function repairOrphanTaskUpdates(state) {
  if (!state?.todos?.length) return false

  let changed = false
  const removeIndexes = new Set()

  state.todos.forEach((todo, index) => {
    const id = String(todo?.id || '')
    const hasDescription = String(todo?.description || '').trim()
    if (!id || hasDescription || id.startsWith('__pending__:')) return

    let target = null

    const pendingTodos = state.todos.filter(candidate => (
      String(candidate?.id || '').startsWith('__pending__:')
      && String(candidate?.description || '').trim()
    ))

    if (pendingTodos.length === 1) {
      target = pendingTodos[0]
    } else {
      target = findPendingTodoByNumericOrder(state, id)
    }

    if (!target) return

    target.id = id
    target.status = normalizeStatus(todo.status, target.status || 'pending')
    target.updatedAt = Math.max(Number(target.updatedAt) || 0, Number(todo.updatedAt) || 0)
    removeIndexes.add(index)
    changed = true
  })

  if (!changed) return false

  state.todos = state.todos
    .filter((_, index) => !removeIndexes.has(index))
    .map((todo, index) => ({ ...todo, order: index + 1 }))
  return true
}

function replaceTodos(state, rawTasks, now) {
  const ts = nowTs(now)
  const nextTodos = []
  for (const rawTask of Array.isArray(rawTasks) ? rawTasks : []) {
    const normalized = normalizeTodoItem({
      id: rawTask?.id ?? rawTask?.taskId ?? rawTask?.task_id,
      description: rawTask?.content || rawTask?.description || rawTask?.task || rawTask?.subject || '',
      status: rawTask?.status,
      order: nextTodos.length + 1,
      createdAt: ts,
      updatedAt: ts,
    }, nextTodos.length + 1)
    if (!normalized) continue
    nextTodos.push(normalized)
  }

  const changed = JSON.stringify(nextTodos) !== JSON.stringify(state.todos)
  if (!changed) return false

  state.todos = nextTodos
  state.visible = state.todos.length > 0 || state.runtimeSteps.length > 0
  state.dismissed = false
  syncPhase(state)
  setStateUpdated(state, ts)
  return true
}

function removeTodo(state, payload, now) {
  const id = String(payload?.taskId ?? payload?.task_id ?? payload?.id ?? '')
  if (!id) return false
  const nextTodos = state.todos.filter(item => item.id !== id)
  if (nextTodos.length === state.todos.length) return false
  state.todos = nextTodos.map((item, index) => ({ ...item, order: index + 1 }))
  state.visible = state.todos.length > 0 || state.runtimeSteps.length > 0
  state.dismissed = false
  syncPhase(state)
  setStateUpdated(state, now)
  return true
}

function enrichTodosFromTaskList(state, rawTasks, now) {
  const knownIds = new Set(state.todos.map(todo => String(todo?.id || '')))
  if (!knownIds.size) return false

  const ts = nowTs(now)
  let changed = false

  for (const rawTask of Array.isArray(rawTasks) ? rawTasks : []) {
    const taskId = pickTaskId(rawTask)
    if (!taskId || !knownIds.has(taskId)) continue

    const item = state.todos.find(todo => todo.id === taskId)
    if (!item) continue

    const before = JSON.stringify(item)
    const description = pickTaskDescription(rawTask, item.description || '')
    const status = pickTaskStatus(rawTask, item.status || 'pending')

    if (hasSemanticTaskDescription(rawTask)) {
      item.description = description || item.description || ''
    }
    item.status = status || item.status || 'pending'
    item.updatedAt = ts

    if (before !== JSON.stringify(item)) {
      changed = true
    }
  }

  if (!changed) return false

  state.todos = state.todos.map((todo, index) => ({ ...todo, order: index + 1 }))
  state.visible = state.todos.length > 0 || state.runtimeSteps.length > 0
  state.dismissed = false
  syncPhase(state)
  setStateUpdated(state, ts)
  return true
}

function upsertTaskTodo(state, payload, now, { toolUseId = '', allowOrderFallback = false } = {}) {
  const ts = nowTs(now)
  const taskId = pickTaskId(payload)
  const pendingId = toolUseId ? `__pending__:${toolUseId}` : ''
  let item = taskId ? state.todos.find(todo => todo.id === taskId) : null
  const description = pickTaskDescription(payload, item?.description || '')
  const shouldUpdateDescription = !item || hasSemanticTaskDescription(payload)
  const status = pickTaskStatus(payload, item?.status || 'pending')
  let changedId = false

  if (!item && taskId) {
    item = pendingId
      ? state.todos.find(todo => todo.id === pendingId)
      : state.todos.find(todo => String(todo.id || '').startsWith('__pending__:'))
    if (!item) {
      const pendingTodos = state.todos.filter(todo => String(todo.id || '').startsWith('__pending__:'))
      item = pendingTodos.length === 1 ? pendingTodos[0] : null
    }
    if (item) {
      item.id = taskId
      changedId = true
    }
  }

  if (!item && taskId && allowOrderFallback) {
    const pendingTodos = state.todos.filter(todo => (
      String(todo.id || '').startsWith('__pending__:')
      && String(todo.description || '').trim()
    ))

    if (pendingTodos.length === 1) {
      item = pendingTodos[0]
    } else {
      item = findPendingTodoByNumericOrder(state, taskId)
    }
    if (item) {
      item.id = taskId
      changedId = true
    }
  }

  if (!item && !taskId && description) {
    item = normalizeTodoItem({
      id: pendingId || `__pending__:${ts}:${state.todos.length + 1}`,
      description,
      status,
      order: state.todos.length + 1,
      createdAt: ts,
      updatedAt: ts,
    }, state.todos.length + 1)
    state.todos.push(item)
  }

  if (!item && taskId) {
    item = normalizeTodoItem({
      id: taskId,
      description,
      status,
      order: state.todos.length + 1,
      createdAt: ts,
      updatedAt: ts,
    }, state.todos.length + 1)
    state.todos.push(item)
  }

  if (!item) return false

  const before = JSON.stringify(item)
  if (shouldUpdateDescription) {
    item.description = description || item.description || ''
  }
  item.status = status || item.status || 'pending'
  item.updatedAt = ts
  state.todos = state.todos.map((todo, index) => ({ ...todo, order: index + 1 }))
  state.visible = state.todos.length > 0 || state.runtimeSteps.length > 0
  state.dismissed = false
  syncPhase(state)
  setStateUpdated(state, ts)
  return changedId || before !== JSON.stringify(item)
}

function warnOnBrokenTaskState(state, source = '') {
  if (!DEV) return
  const brokenTodo = state?.todos?.find(todo => {
    const description = String(todo?.description || '').trim()
    const status = String(todo?.status || '')
    return !description && status && status !== 'pending'
  })
  if (!brokenTodo) return
  console.error('[claude-task-state] orphan todo detected', {
    source,
    id: brokenTodo.id || '',
    status: brokenTodo.status || '',
  })
}

function applyPlanTool(state, normalizedToolName, payload, now, { toolUseId = '' } = {}) {
  if (normalizedToolName === 'todowrite') {
    const changed = replaceTodos(state, extractTaskArray(payload), now)
    if (changed) warnOnBrokenTaskState(state, 'todowrite')
    return changed
  }
  if (normalizedToolName === 'tasklist') {
    const changed = enrichTodosFromTaskList(state, extractTaskArray(payload), now)
    if (changed) warnOnBrokenTaskState(state, 'tasklist')
    return changed
  }
  if (normalizedToolName === 'taskcreate' || normalizedToolName === 'taskupdate') {
    const changed = upsertTaskTodo(state, payload, now, {
      toolUseId,
      allowOrderFallback: normalizedToolName === 'taskupdate',
    })
    if (changed) warnOnBrokenTaskState(state, normalizedToolName)
    return changed
  }
  if (normalizedToolName === 'taskdelete') {
    const changed = removeTodo(state, payload, now)
    if (changed) warnOnBrokenTaskState(state, normalizedToolName)
    return changed
  }
  return false
}

export function applyPlanToolUse(tab, {
  toolName,
  toolUseId,
  input,
  now,
} = {}) {
  const normalizedToolName = normalizeTaskToolName(toolName)
  if (!normalizedToolName) {
    return { changed: false, shouldPersistImmediately: false, ignored: true }
  }
  const state = ensureTaskState(tab)
  const payload = parseToolPayload(input)
  const changed = applyPlanTool(state, normalizedToolName, payload, now, { toolUseId })
  return {
    changed,
    shouldPersistImmediately: changed,
    ignored: false,
  }
}

export function applyPlanToolResult(tab, {
  toolName,
  toolUseId,
  content,
  now,
} = {}) {
  const normalizedToolName = normalizeTaskToolName(toolName)
  if (!normalizedToolName) {
    return { changed: false, shouldPersistImmediately: false, ignored: true }
  }
  const state = ensureTaskState(tab)
  const payload = parseToolPayload(content)
  const changed = applyPlanTool(state, normalizedToolName, payload, now, { toolUseId })
  return {
    changed,
    shouldPersistImmediately: changed,
    ignored: false,
  }
}
