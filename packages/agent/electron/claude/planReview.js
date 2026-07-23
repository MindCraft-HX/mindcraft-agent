'use strict'

const MAX_PLAN_FEEDBACK_CHARS = 20_000

function normalizeClaudePlanReviewAction(action) {
  const type = String(action?.type || '')
  if (type === 'accept' || type === 'reject') return { type }
  if (type !== 'feedback') return null
  const feedback = String(action?.feedback || '').trim().slice(0, MAX_PLAN_FEEDBACK_CHARS)
  return feedback ? { type, feedback } : null
}

module.exports = {
  normalizeClaudePlanReviewAction,
}
