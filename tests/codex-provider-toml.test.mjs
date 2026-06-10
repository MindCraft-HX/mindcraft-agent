import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildManagedProviderToml,
  extractProviderDraftFromToml,
  mergeManagedProviderToml,
} from '../packages/agent/src/components/codeX/utils/providerToml.mjs'

test('buildManagedProviderToml keeps provider string values quoted and closed', () => {
  const toml = buildManagedProviderToml({
    name: 'mindcraft31231',
    model: 'gpt-5.4',
    url: 'https://api.mindcraft.com.cn/v1',
    reasoningEffort: 'medium',
  })

  assert.match(toml, /^model_reasoning_effort = "medium"$/m)
  assert.match(toml, /^model = "gpt-5\.4"$/m)
  assert.match(toml, /^model_provider = "mindcraft31231"$/m)
  assert.match(toml, /^\[model_providers\.mindcraft31231\]$/m)
  assert.match(toml, /^name = "mindcraft31231"$/m)
  assert.doesNotMatch(toml, /^name = "mindcraft31231$/m)
  assert.match(toml, /^base_url = "https:\/\/api\.mindcraft\.com\.cn\/v1"$/m)
})

test('extractProviderDraftFromToml reads managed provider fields from config.toml', () => {
  const draft = extractProviderDraftFromToml(`
model_reasoning_effort = "medium"
model = "gpt-5.4"
model_provider = "mindcraft31231"

[model_providers.mindcraft31231]
name = "mindcraft31231"
base_url = "https://api.mindcraft.com.cn/v1"
env_key = "OPENAI_API_KEY"

[plugins.foo]
enabled = true
`)

  assert.equal(draft.name, 'mindcraft31231')
  assert.equal(draft.model, 'gpt-5.4')
  assert.equal(draft.reasoningEffort, 'medium')
  assert.equal(draft.url, 'https://api.mindcraft.com.cn/v1')
  assert.equal(draft.envKey, 'OPENAI_API_KEY')
})

test('mergeManagedProviderToml replaces managed provider block and preserves other sections', () => {
  const merged = mergeManagedProviderToml(
    `
model = "old-model"
model_provider = "old-provider"

[model_providers.old-provider]
name = "old-provider"
base_url = "https://old.example.com/v1"
env_key = "OPENAI_API_KEY"

[plugins.bar]
enabled = true

[projects.'D:/demo']
trust_level = "trusted"
`,
    buildManagedProviderToml({
      name: 'mindcraft31231',
      model: 'gpt-5.4',
      url: 'https://api.mindcraft.com.cn/v1',
      reasoningEffort: 'medium',
    }),
  )

  assert.doesNotMatch(merged, /old-provider/)
  assert.match(merged, /^model_provider = "mindcraft31231"$/m)
  assert.match(merged, /^\[model_providers\.mindcraft31231\]$/m)
  assert.match(merged, /^\[plugins\.bar\]$/m)
  assert.match(merged, /^enabled = true$/m)
  assert.match(merged, /^\[projects\.'D:\/demo'\]$/m)
  assert.match(merged, /^trust_level = "trusted"$/m)
})

console.log('codex provider toml tests passed')
