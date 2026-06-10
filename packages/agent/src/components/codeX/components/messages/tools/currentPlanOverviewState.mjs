export function resolvePlanOverviewCollapsedState({
  previousSourceMessageId,
  nextSourceMessageId,
  wasCollapsed,
}) {
  if (!nextSourceMessageId) return false
  if (!previousSourceMessageId) return false
  if (previousSourceMessageId !== nextSourceMessageId) return false
  return Boolean(wasCollapsed)
}

export function resolvePlanOverviewDismissedState({
  previousDismissedSourceMessageId,
  nextSourceMessageId,
}) {
  if (!nextSourceMessageId) return null
  if (previousDismissedSourceMessageId !== nextSourceMessageId) return null
  return previousDismissedSourceMessageId
}

export function shouldRenderPlanOverview(overview, dismissedSourceMessageId) {
  const sourceMessageId = overview?.sourceMessageId ?? null
  if (!sourceMessageId) return false
  return sourceMessageId !== dismissedSourceMessageId
}

export function shouldRenderPlanOverviewForTurn({
  overview,
  dismissedSourceMessageId,
  thinking = false,
  awaitingDone = false,
}) {
  if (!shouldRenderPlanOverview(overview, dismissedSourceMessageId)) return false
  return Boolean(thinking || awaitingDone)
}
