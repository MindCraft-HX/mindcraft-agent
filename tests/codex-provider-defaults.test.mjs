import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldApplyCodexProviderDefaultsToChat } from '../packages/agent/src/components/codeX/utils/codexProviderDefaults.mjs'

test('CodeX provider defaults update only idle chats', () => {
  assert.equal(
    shouldApplyCodexProviderDefaultsToChat({ id: 'active', cliSessionId: 'thread-1' }, 'active'),
    true,
  )
  assert.equal(
    shouldApplyCodexProviderDefaultsToChat({ id: 'active', thinking: true }, 'active'),
    false,
  )
  assert.equal(
    shouldApplyCodexProviderDefaultsToChat({ id: 'active', _awaitingDone: true }, 'active'),
    false,
  )
  assert.equal(shouldApplyCodexProviderDefaultsToChat({ id: 'draft' }, 'active'), true)
  assert.equal(
    shouldApplyCodexProviderDefaultsToChat({ id: 'bound', cliSessionId: 'thread-2' }, 'active'),
    false,
  )
  assert.equal(
    shouldApplyCodexProviderDefaultsToChat({
      id: 'history',
      messages: [{ role: 'user', text: 'hello' }],
    }, 'active'),
    false,
  )
})
