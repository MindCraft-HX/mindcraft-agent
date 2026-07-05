import assert from 'node:assert/strict'
import test from 'node:test'
import { sortChatsByRecencyInPlace } from '../packages/agent/src/components/agentCommon/utils/chatRecency.mjs'

test('sortChatsByRecencyInPlace sorts by updatedAt then createdAt descending', () => {
  const chats = [
    { id: 'old', updatedAt: '2026-07-05T01:00:00.000Z' },
    { id: 'fallback', createdAt: '2026-07-05T02:00:00.000Z' },
    { id: 'new', updatedAt: Date.parse('2026-07-05T03:00:00.000Z') },
  ]

  const result = sortChatsByRecencyInPlace(chats)

  assert.equal(result, chats)
  assert.deepEqual(chats.map(chat => chat.id), ['new', 'fallback', 'old'])
})
