import { parseUpdatePlanPayload } from './updatePlan.mjs'

function buildOverview(message, parsed) {
  const currentStep = parsed.steps.find(item => item.status === 'in_progress')
    || parsed.steps.find(item => item.status === 'pending')
    || null
  const completedSteps = parsed.steps.filter(item => item.status === 'completed')

  return {
    sourceMessageId: message.id,
    explanation: parsed.explanation,
    steps: parsed.steps,
    summary: parsed.summary,
    currentStep,
    completedSteps,
  }
}

export function findLatestActiveUpdatePlan(messages) {
  const list = Array.isArray(messages) ? messages : []

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index]
    if (!message) continue

    if (message.role === 'user') return null

    if (message.role !== 'tool' || String(message.toolName || '').toLowerCase() !== 'update_plan') continue

    const parsed = parseUpdatePlanPayload(message.text || '')
    if (!parsed.isValid) continue

    return buildOverview(message, parsed)
  }

  return null
}
