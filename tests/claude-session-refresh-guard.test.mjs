import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldReloadClaudeChatFromDisk } from '../packages/agent/src/components/claudeCode/utils/sessionRefreshGuard.mjs'

test('reload remains allowed for idle chat without pending tools', () => {
  const chat = {
    thinking: false,
    messages: [{ role: 'assistant', text: 'done' }],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), true)
})

test('reload is blocked while chat waits for permission approval', () => {
  const chat = {
    thinking: true,
    messages: [
      {
        role: 'tool',
        toolName: 'Edit',
        status: 'pending',
        requestId: 'req-1',
      },
    ],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), false)
})

test('reload is blocked while ask-user-question is still pending', () => {
  const chat = {
    thinking: true,
    messages: [
      {
        role: 'tool',
        toolName: 'AskUserQuestion',
        status: 'pending',
      },
    ],
  }

  assert.equal(shouldReloadClaudeChatFromDisk(chat), false)
})
