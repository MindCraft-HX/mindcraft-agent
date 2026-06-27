import test from 'node:test'
import assert from 'node:assert/strict'

import {
  attachTurnTokensToLastRenderableMessage,
  hasMeaningfulTurnTokens,
} from '../packages/agent/src/components/agentCommon/utils/turnTokensAttachment.mjs'

test('attachTurnTokensToLastRenderableMessage creates footer host after latest user when assistant is missing', () => {
  let msgId = 0
  const messages = [
    { id: 'u1', role: 'user', text: 'hello' },
    { id: 'tool1', role: 'tool', text: 'running' },
  ]

  const changed = attachTurnTokensToLastRenderableMessage(messages, {
    inputTokens: 100,
    outputTokens: 5,
    cacheReadTokens: 20,
    cacheCreationTokens: 0,
    durationMs: 1234,
  }, {
    nextMsgId: () => `msg-${++msgId}`,
  })

  assert.equal(changed, true)
  assert.equal(messages.at(-1).role, 'assistant')
  assert.deepEqual(messages.at(-1)._turnTokens, {
    inputTokens: 100,
    outputTokens: 5,
    cacheReadTokens: 20,
    cacheCreationTokens: 0,
    durationMs: 1234,
    costUsd: 0,
  })
})

test('attachTurnTokensToLastRenderableMessage can replace incomplete footer tokens with final snapshot', () => {
  const messages = [
    { id: 'u1', role: 'user', text: 'hello' },
    {
      id: 'a1',
      role: 'assistant',
      text: 'done',
      _turnTokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 153000,
        costUsd: 0,
      },
    },
  ]

  const changed = attachTurnTokensToLastRenderableMessage(messages, {
    inputTokens: 923,
    outputTokens: 396,
    cacheReadTokens: 147800,
    cacheCreationTokens: 0,
    durationMs: 153000,
  }, {
    replace: true,
  })

  assert.equal(changed, true)
  assert.deepEqual(messages[1]._turnTokens, {
    inputTokens: 923,
    outputTokens: 396,
    cacheReadTokens: 147800,
    cacheCreationTokens: 0,
    durationMs: 153000,
    costUsd: 0,
  })
})

test('hasMeaningfulTurnTokens accepts duration-only snapshot but still allows later replacement', () => {
  assert.equal(hasMeaningfulTurnTokens({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    durationMs: 10,
  }), true)
})

console.log('turn tokens attachment tests passed')
