import assert from 'node:assert/strict'
import {
  resolvePlanOverviewCollapsedState,
  resolvePlanOverviewDismissedState,
  shouldRenderPlanOverview,
  shouldRenderPlanOverviewForTurn,
} from '../packages/agent/src/components/codeX/components/messages/tools/currentPlanOverviewState.mjs'

assert.equal(
  resolvePlanOverviewCollapsedState({
    previousSourceMessageId: null,
    nextSourceMessageId: 10,
    wasCollapsed: false,
  }),
  false,
)

assert.equal(
  resolvePlanOverviewCollapsedState({
    previousSourceMessageId: 10,
    nextSourceMessageId: 10,
    wasCollapsed: true,
  }),
  true,
)

assert.equal(
  resolvePlanOverviewCollapsedState({
    previousSourceMessageId: 10,
    nextSourceMessageId: 11,
    wasCollapsed: true,
  }),
  false,
)

assert.equal(
  resolvePlanOverviewCollapsedState({
    previousSourceMessageId: 10,
    nextSourceMessageId: null,
    wasCollapsed: true,
  }),
  false,
)

assert.equal(
  resolvePlanOverviewDismissedState({
    previousDismissedSourceMessageId: null,
    nextSourceMessageId: 10,
  }),
  null,
)

assert.equal(
  resolvePlanOverviewDismissedState({
    previousDismissedSourceMessageId: 10,
    nextSourceMessageId: 10,
  }),
  10,
)

assert.equal(
  resolvePlanOverviewDismissedState({
    previousDismissedSourceMessageId: 10,
    nextSourceMessageId: 11,
  }),
  null,
)

assert.equal(shouldRenderPlanOverview({ sourceMessageId: 10 }, null), true)
assert.equal(shouldRenderPlanOverview({ sourceMessageId: 10 }, 10), false)
assert.equal(shouldRenderPlanOverview({ sourceMessageId: 10 }, 11), true)

assert.equal(
  shouldRenderPlanOverviewForTurn({
    overview: { sourceMessageId: 10 },
    dismissedSourceMessageId: null,
    thinking: true,
    awaitingDone: true,
  }),
  true,
)

assert.equal(
  shouldRenderPlanOverviewForTurn({
    overview: { sourceMessageId: 10 },
    dismissedSourceMessageId: null,
    thinking: false,
    awaitingDone: false,
  }),
  false,
)

console.log('current-plan-overview state test passed')
