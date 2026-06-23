const assert = require('node:assert/strict')
const test = require('node:test')

const {
  __test__: {
    parseSimpleTomlContent,
    buildRuntimeConfigFromToml,
  },
} = require('./codexAgent')

test('runtime config reads model_reasoning_effort from top-level TOML', () => {
  const toml = parseSimpleTomlContent(`
model_reasoning_effort = "xhigh"
model = "gpt-5.4"
model_provider = "default"

[api]
model = "api-model"
reasoning_effort = "low"

[model_providers.default]
base_url = "https://api.example.com/v1"
experimental_bearer_token = "sk-test"
`)

  assert.deepEqual(buildRuntimeConfigFromToml(toml, {}), {
    apiKey: 'sk-test',
    baseURL: 'https://api.example.com/v1',
    model: 'gpt-5.4',
    reasoningEffort: 'xhigh',
    apiFormat: 'responses',
  })
})

test('runtime config resolves quoted provider ids containing dots', () => {
  const toml = parseSimpleTomlContent(`
model = "gpt-5.4"
model_provider = "foo.bar"

[model_providers."foo.bar"]
base_url = "https://dot.example.com/v1"
experimental_bearer_token = "sk-dot"
`)

  assert.deepEqual(buildRuntimeConfigFromToml(toml, {}), {
    apiKey: 'sk-dot',
    baseURL: 'https://dot.example.com/v1',
    model: 'gpt-5.4',
    reasoningEffort: '',
    apiFormat: 'responses',
  })
})

test('runtime electron-conf values override TOML defaults', () => {
  const toml = parseSimpleTomlContent(`
model_reasoning_effort = "low"
model = "toml-model"
base_url = "https://toml.example.com/v1"
experimental_bearer_token = "sk-toml"
`)

  assert.deepEqual(buildRuntimeConfigFromToml(toml, {
    apiKey: 'sk-user',
    baseURL: 'https://user.example.com/v1',
    model: 'user-model',
    reasoningEffort: 'high',
  }), {
    apiKey: 'sk-user',
    baseURL: 'https://user.example.com/v1',
    model: 'user-model',
    reasoningEffort: 'high',
    apiFormat: 'responses',
  })
})
