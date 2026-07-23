import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

import {
  findPendingClaudePlanReview,
  useClaudePlanReview,
} from '../packages/agent/src/components/claudeCode/composables/useClaudePlanReview.js'

function makePlanMessage() {
  return {
    role: 'tool',
    toolName: 'ExitPlanMode',
    toolUseId: 'tool-plan',
    requestId: 'request-plan',
    sessionId: 'chat-1',
    status: 'pending',
    planReview: true,
    text: '{}',
  }
}

async function flushSubmit() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

test('new SDK empty ExitPlanMode input previews the preceding assistant plan', () => {
  const msg = makePlanMessage()
  const tab = {
    sessionId: 'chat-1',
    thinking: true,
    messages: [
      { role: 'assistant', text: '# Implementation plan\n\n1. Inspect\n2. Change' },
      msg,
    ],
  }
  const state = useClaudePlanReview({ getActiveTab: () => tab, sendResponse: async () => ({ ok: true }) })

  assert.equal(findPendingClaudePlanReview(tab), msg)
  assert.equal(state.show(msg), true)
  assert.match(state.plan.value, /Implementation plan/)
})

test('plan preview survives permission event arriving before the assistant tool event', () => {
  const msg = makePlanMessage()
  const tab = {
    sessionId: 'chat-1',
    thinking: true,
    messages: [msg, { role: 'assistant', text: '# Plan delivered after the placeholder' }],
  }
  const state = useClaudePlanReview({ getActiveTab: () => tab, sendResponse: async () => ({ ok: true }) })

  state.show(msg)
  assert.match(state.plan.value, /delivered after the placeholder/)
})

test('plan review completes only after main process acknowledgement', async () => {
  const msg = makePlanMessage()
  const tab = { sessionId: 'chat-1', thinking: true, messages: [msg] }
  let acknowledge
  const response = new Promise(resolve => { acknowledge = resolve })
  let accepted = 0
  const state = useClaudePlanReview({
    getActiveTab: () => tab,
    sendResponse: () => response,
    onAccepted: () => { accepted += 1 },
  })

  state.show(msg)
  state.finish({ type: 'accept' })
  assert.equal(msg.status, 'pending')
  assert.equal(msg.planSubmitting, true)

  acknowledge({ ok: true })
  await flushSubmit()
  assert.equal(msg.status, 'done')
  assert.equal(msg.planReviewAnswered, true)
  assert.equal(accepted, 1)
})

test('tab deactivation hides but reactivation restores a live plan review', () => {
  const msg = makePlanMessage()
  const tab = { sessionId: 'chat-1', thinking: true, messages: [msg] }
  const state = useClaudePlanReview({ getActiveTab: () => tab, sendResponse: async () => ({ ok: true }) })

  state.show(msg)
  state.deactivate()
  assert.equal(state.visible.value, false)
  assert.equal(msg.status, 'pending')

  state.activate()
  assert.equal(state.visible.value, true)
})

test('plan review received in another tab opens when that live tab becomes active', () => {
  const msg = makePlanMessage()
  const otherTab = { sessionId: 'chat-2', thinking: false, messages: [] }
  const targetTab = { sessionId: 'chat-1', thinking: true, messages: [msg] }
  let activeTab = otherTab
  const state = useClaudePlanReview({
    getActiveTab: () => activeTab,
    sendResponse: async () => ({ ok: true }),
  })

  assert.equal(state.show(msg), false)
  assert.equal(state.visible.value, false)

  activeTab = targetTab
  state.syncActiveTab()
  assert.equal(state.visible.value, true)
})

test('stale plan review response is visible and never becomes accepted', async () => {
  const msg = makePlanMessage()
  const tab = { sessionId: 'chat-1', thinking: true, messages: [msg] }
  const errors = []
  const state = useClaudePlanReview({
    getActiveTab: () => tab,
    sendResponse: async () => ({ ok: false, error: 'stale-request' }),
    notifyError: message => errors.push(message),
  })

  state.show(msg)
  state.finish({ type: 'accept' })
  await flushSubmit()
  assert.equal(msg.status, 'error')
  assert.equal(msg.planReviewAnswered, undefined)
  assert.match(msg.planResponseError, /Claude 未收到操作/)
  assert.equal(errors.length, 1)
})
