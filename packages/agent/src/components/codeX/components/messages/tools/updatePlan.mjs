function emptyResult() {
  return {
    isValid: false,
    explanation: '',
    steps: [],
    summary: { total: 0, completed: 0, inProgress: 0, pending: 0 },
  }
}

function normalizeStepStatus(status) {
  const raw = String(status || '').toLowerCase()
  if (raw === 'completed' || raw === 'done') return 'completed'
  if (raw === 'in_progress' || raw === 'running' || raw === 'active') return 'in_progress'
  return 'pending'
}

export function parseUpdatePlanPayload(raw) {
  if (!raw || typeof raw !== 'string') return emptyResult()

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (_) {
    return emptyResult()
  }

  const plan = Array.isArray(parsed?.plan) ? parsed.plan : []
  const steps = plan
    .map((item, index) => ({
      id: item?.id || `plan-step-${index}`,
      step: String(item?.step || '').trim(),
      status: normalizeStepStatus(item?.status),
    }))
    .filter(item => item.step)

  const summary = steps.reduce((acc, item) => {
    acc.total += 1
    if (item.status === 'completed') acc.completed += 1
    else if (item.status === 'in_progress') acc.inProgress += 1
    else acc.pending += 1
    return acc
  }, { total: 0, completed: 0, inProgress: 0, pending: 0 })

  return {
    isValid: steps.length > 0 || Boolean(parsed?.explanation),
    explanation: String(parsed?.explanation || '').trim(),
    steps,
    summary,
  }
}
