import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'

import {
  findPendingClaudeAskMessage,
  useClaudeAskQuestion,
} from '../packages/agent/src/components/claudeCode/composables/useClaudeAskQuestion.js'

function makeAskMessage() {
  return {
    toolName: 'AskUserQuestion',
    status: 'pending',
    sessionId: 'chat-1',
    requestId: 'request-1',
    text: JSON.stringify({
      questions: [{ question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }],
    }),
  }
}

async function flushSubmit() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

test('closing AskUserQuestion only hides it and activation restores an open prompt', () => {
  const msg = makeAskMessage()
  const tab = { sessionId: 'chat-1', thinking: true, messages: [msg] }
  let calls = 0
  const state = useClaudeAskQuestion({
    getActiveTab: () => tab,
    sendResponse: async () => { calls += 1; return { ok: true } },
  })

  state.show(msg)
  state.close()
  assert.equal(state.visible.value, false)
  assert.equal(msg.status, 'pending')
  assert.equal(msg.askAnswered, undefined)
  assert.equal(calls, 0)

  state.reopen(msg)
  state.deactivate()
  state.activate()
  assert.equal(state.visible.value, true)
  assert.equal(findPendingClaudeAskMessage(tab), msg)
})

test('historical pending cards do not reopen without a live turn', () => {
  const msg = makeAskMessage()
  const tab = { sessionId: 'chat-1', thinking: false, messages: [msg] }
  const state = useClaudeAskQuestion({
    getActiveTab: () => tab,
    sendResponse: async () => ({ ok: true }),
  })

  state.syncActiveTab()
  assert.equal(state.visible.value, false)
})

test('AskUserQuestion received in another tab opens when that live tab becomes active', () => {
  const msg = makeAskMessage()
  const otherTab = { sessionId: 'chat-2', thinking: false, messages: [] }
  const targetTab = { sessionId: 'chat-1', thinking: true, messages: [msg] }
  let activeTab = otherTab
  const state = useClaudeAskQuestion({
    getActiveTab: () => activeTab,
    sendResponse: async () => ({ ok: true }),
  })

  assert.equal(state.show(msg), false)
  assert.equal(state.visible.value, false)

  activeTab = targetTab
  state.syncActiveTab()
  assert.equal(state.visible.value, true)
  assert.equal(state.toolMsg.value.requestId, msg.requestId)
  assert.equal(state.toolMsg.value.sessionId, msg.sessionId)
})

test('AskUserQuestion completes only after main process acknowledges the answer', async () => {
  const msg = makeAskMessage()
  const tab = { sessionId: 'chat-1', messages: [msg] }
  let acknowledge
  const response = new Promise(resolve => { acknowledge = resolve })
  const state = useClaudeAskQuestion({
    getActiveTab: () => tab,
    sendResponse: () => response,
  })

  state.show(msg)
  state.answer(state.questions.value[0], { label: 'Yes' })
  assert.equal(msg.status, 'pending')
  assert.equal(msg.askSubmitting, true)

  acknowledge({ ok: true })
  await flushSubmit()
  assert.equal(msg.status, 'done')
  assert.equal(msg.askAnswered, true)
  assert.equal(msg.askAnswerText, 'Continue?: Yes')
})

test('stale AskUserQuestion response is visible as an error, never fake completion', async () => {
  const msg = makeAskMessage()
  const tab = { sessionId: 'chat-1', messages: [msg] }
  const errors = []
  const state = useClaudeAskQuestion({
    getActiveTab: () => tab,
    sendResponse: async () => ({ ok: false, error: 'stale-request' }),
    notifyError: message => errors.push(message),
  })

  state.show(msg)
  state.answer(state.questions.value[0], { label: 'Yes' })
  await flushSubmit()

  assert.equal(msg.status, 'error')
  assert.equal(msg.askAnswered, undefined)
  assert.match(msg.askResponseError, /Claude 未收到回答/)
  assert.equal(errors.length, 1)
})
