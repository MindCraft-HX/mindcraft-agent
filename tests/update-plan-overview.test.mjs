import assert from 'node:assert/strict'
import { findLatestActiveUpdatePlan } from '../packages/agent/src/components/codeX/components/messages/tools/updatePlanOverview.mjs'

function makePlanMessage(id, payload) {
  return {
    id,
    role: 'tool',
    toolName: 'update_plan',
    text: JSON.stringify(payload),
  }
}

const firstPlan = makePlanMessage(2, {
  explanation: 'Inspect first, then implement.',
  plan: [
    { step: 'Trace message lifecycle', status: 'completed' },
    { step: 'Build current plan overview', status: 'in_progress' },
    { step: 'Verify build output', status: 'pending' },
  ],
})

const replacementPlan = makePlanMessage(4, {
  explanation: 'New snapshot replaces the old one completely.',
  plan: [
    { step: 'Render top overview', status: 'completed' },
    { step: 'Wire jump to source message', status: 'in_progress' },
  ],
})

const latest = findLatestActiveUpdatePlan([
  { id: 1, role: 'user', text: 'start' },
  firstPlan,
  { id: 3, role: 'assistant', text: 'working' },
  replacementPlan,
])

assert.equal(latest?.sourceMessageId, 4)
assert.equal(latest?.explanation, 'New snapshot replaces the old one completely.')
assert.equal(latest?.summary.total, 2)
assert.equal(latest?.currentStep?.step, 'Wire jump to source message')
assert.equal(latest?.completedSteps.length, 1)
assert.equal(latest?.completedSteps[0]?.step, 'Render top overview')

const inactiveAfterUserTurn = findLatestActiveUpdatePlan([
  { id: 1, role: 'user', text: 'start' },
  firstPlan,
  { id: 3, role: 'assistant', text: 'working' },
  { id: 4, role: 'user', text: 'continue' },
])

assert.equal(inactiveAfterUserTurn, null)

const skipInvalidPayload = findLatestActiveUpdatePlan([
  { id: 1, role: 'user', text: 'start' },
  { id: 2, role: 'tool', toolName: 'update_plan', text: 'not-json' },
  replacementPlan,
])

assert.equal(skipInvalidPayload?.sourceMessageId, 4)

const explanationOnlyPlan = findLatestActiveUpdatePlan([
  { id: 1, role: 'user', text: 'start' },
  makePlanMessage(2, {
    explanation: 'Show explanation only.',
    plan: [],
  }),
])

assert.equal(explanationOnlyPlan?.sourceMessageId, 2)
assert.equal(explanationOnlyPlan?.summary.total, 0)
assert.equal(explanationOnlyPlan?.currentStep, null)
assert.equal(explanationOnlyPlan?.completedSteps.length, 0)

console.log('update-plan overview test passed')
