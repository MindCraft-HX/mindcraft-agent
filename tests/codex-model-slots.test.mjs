import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCodexModelSlots,
  CODEX_MODEL_SLOT_FALLBACKS,
} from '../packages/agent/src/components/codeX/utils/modelSlots.mjs'

test('CodeX fallback model slots use the current MindCraft defaults', () => {
  assert.deepEqual(CODEX_MODEL_SLOT_FALLBACKS, [
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-5.6-luna',
  ])
})

test('buildCodexModelSlots groups by active provider and keeps session model as current selection', () => {
  const result = buildCodexModelSlots({
    storedProviders: {
      activeIdx: 1,
      providers: [
        { name: 'default', model: 'gpt-5.4', alternativeModels: [] },
        { name: 'deepseek', model: 'deepseek-v4-pro', alternativeModels: ['deepseek-v4-flash', 'qwen3.7-plus', 'GLM-5.2'] },
      ],
    },
    sessionModel: 'gpt-5.4',
    runtimeModel: 'deepseek-v4-pro',
    defaultModel: 'deepseek-v4-pro',
  })

  assert.equal(result.currentModel, 'gpt-5.4')
  assert.equal(result.activeProvider?.name, 'deepseek')
  assert.deepEqual(result.items, [
    { id: 'deepseek-v4-pro', slot: 'default' },
    { id: 'deepseek-v4-flash', slot: 'alt1' },
    { id: 'qwen3.7-plus', slot: 'alt2' },
    { id: 'GLM-5.2', slot: 'alt3' },
  ])
})

test('buildCodexModelSlots fills empty alternative slots from stable fallback list', () => {
  const result = buildCodexModelSlots({
    storedProviders: {
      activeIdx: 1,
      providers: [
        { name: 'default', model: 'gpt-5.4', alternativeModels: [] },
        { name: 'MindCraft', model: 'gpt-5.4', alternativeModels: ['gpt-5.5', '', ''] },
      ],
    },
    runtimeModel: 'gpt-5.4',
  })

  assert.deepEqual(result.items, [
    { id: 'gpt-5.4', slot: 'default' },
    { id: 'gpt-5.5', slot: 'alt1' },
    { id: CODEX_MODEL_SLOT_FALLBACKS[1], slot: 'alt2' },
    { id: CODEX_MODEL_SLOT_FALLBACKS[2], slot: 'alt3' },
  ])
})

test('buildCodexModelSlots de-duplicates fallback models against the primary default', () => {
  const result = buildCodexModelSlots({
    storedProviders: {
      activeIdx: 0,
      providers: [
        { name: 'default', model: 'gpt-5.5', alternativeModels: ['', '', ''] },
      ],
    },
    runtimeModel: 'gpt-5.5',
  })

  assert.deepEqual(result.items, [
    { id: 'gpt-5.5', slot: 'default' },
    { id: 'gpt-5.6-terra', slot: 'alt1' },
    { id: 'gpt-5.6-sol', slot: 'alt2' },
    { id: 'gpt-5.6-luna', slot: 'alt3' },
  ])
})

test('simple chat reads the same CodeX fallback list instead of maintaining another model set', async () => {
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../packages/agent/src/components/chat/InputArea.vue', import.meta.url), 'utf8')
  assert.match(source, /CODEX_MODEL_SLOT_FALLBACKS\.map/)
  assert.equal(source.includes("value: 'gpt-4o'"), false)
})
