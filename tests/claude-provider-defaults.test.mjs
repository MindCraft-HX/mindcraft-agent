import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveClaudeProviderDefaults,
  shouldApplyClaudeProviderDefaultsToChat,
} from '../packages/agent/src/components/claudeCode/utils/claudeProviderDefaults.mjs'

test('Claude provider defaults prefer persisted provider tier and effort', () => {
  const result = resolveClaudeProviderDefaults({
    selectedTier: 'opus',
    effortLevel: 'high',
    tierModels: { sonnet: 'sonnet-model', opus: 'opus-model' },
    config: { model: 'sonnet', effortLevel: 'medium' },
  })

  assert.equal(result.selectedTier, 'opus')
  assert.equal(result.model, 'opus-model')
  assert.equal(result.effortLevel, 'high')
})

test('Claude provider defaults recover legacy config values without provider metadata', () => {
  const result = resolveClaudeProviderDefaults({
    config: {
      model: 'legacy-opus-model',
      effortLevel: 'max',
      env: {
        ANTHROPIC_MODEL: 'legacy-opus-model',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'legacy-opus-model',
      },
    },
  })

  assert.equal(result.selectedTier, 'opus')
  assert.equal(result.model, 'legacy-opus-model')
  assert.equal(result.effortLevel, 'xhigh')
})

test('Claude provider activation updates only the active chat and unsent drafts', () => {
  assert.equal(shouldApplyClaudeProviderDefaultsToChat({ id: 'active', cliSessionId: 'thread-a' }, 'active'), true)
  assert.equal(shouldApplyClaudeProviderDefaultsToChat({ id: 'draft', messages: [] }, 'active'), true)
  assert.equal(shouldApplyClaudeProviderDefaultsToChat({
    id: 'history', cliSessionId: 'thread-b', messages: [{ role: 'user', text: 'hello' }],
  }, 'active'), false)
  assert.equal(shouldApplyClaudeProviderDefaultsToChat({
    id: 'local-history', messages: [{ role: 'assistant', text: 'done' }],
  }, 'active'), false)
})
