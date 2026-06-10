function emptyResult() {
  return {
    isValid: false,
    items: [],
    summary: { total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0 },
    currentItem: null,
  }
}

function normalizeStatus(status, completed) {
  const raw = String(status || '').toLowerCase()
  if (raw === 'completed' || raw === 'done' || completed === true) return 'completed'
  if (raw === 'in_progress' || raw === 'running' || raw === 'active') return 'in_progress'
  if (raw === 'cancelled' || raw === 'canceled') return 'cancelled'
  return 'pending'
}

export function parseTodoListPayload(raw) {
  if (!raw || typeof raw !== 'string') return emptyResult()

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (_) {
    return emptyResult()
  }

  const todos = Array.isArray(parsed?.todos) ? parsed.todos : []
  const items = todos
    .map((item, index) => ({
      id: item?.id || `todo-${index}`,
      content: String(item?.content || item?.text || '').trim(),
      status: normalizeStatus(item?.status, item?.completed),
    }))
    .filter(item => item.content)

  const summary = items.reduce((acc, item) => {
    acc.total += 1
    if (item.status === 'completed') acc.completed += 1
    else if (item.status === 'in_progress') acc.inProgress += 1
    else if (item.status === 'cancelled') acc.cancelled += 1
    else acc.pending += 1
    return acc
  }, { total: 0, pending: 0, inProgress: 0, completed: 0, cancelled: 0 })

  return {
    isValid: items.length > 0,
    items,
    summary,
    currentItem: items.find(item => item.status === 'in_progress') || null,
  }
}
