const assert = require('node:assert/strict')
const test = require('node:test')

// The production module persists settings through Electron. These parser tests
// run under Node, so provide the small in-memory interface it initializes with.
class TestConf {
  constructor() {
    this.store = {}
  }

  get(key) {
    return this.store[key]
  }

  set(key, value) {
    this.store[key] = value
  }

  delete(key) {
    delete this.store[key]
  }
}

require.cache[require.resolve('electron-conf')] = { exports: { Conf: TestConf } }

const {
  __test__: {
    parseSimpleTomlContent,
    buildRuntimeConfigFromToml,
    extractCodexAgentMessageText,
    extractCodexAssistantHistoryMessageFromJsonlRow,
    normalizeTopLevelCodexStreamEvent,
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

test('runtime config prefers selected provider base_url over stale top-level proxy base_url', () => {
  const toml = parseSimpleTomlContent(`
model = "deepseek-v4-pro"
model_provider = "deepseek"
base_url = "http://127.0.0.1:18528/v1"
experimental_bearer_token = "stale-proxy-token"
api_format = "responses"

[model_providers.deepseek]
base_url = "https://api.mindcraft.com.cn/v1"
experimental_bearer_token = "MC-real-token"
api_format = "chat"
`)

  assert.deepEqual(buildRuntimeConfigFromToml(toml, {}), {
    apiKey: 'MC-real-token',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    model: 'deepseek-v4-pro',
    reasoningEffort: '',
    apiFormat: 'chat',
  })
})

test('runtime active provider apiFormat overrides stale electron-conf chat format', () => {
  const toml = parseSimpleTomlContent(`
model = "gpt-5.4"
model_provider = "MindCraft"
api_format = "chat"

[model_providers.MindCraft]
base_url = "https://api.mindcraft.com.cn/v1"
experimental_bearer_token = "MC-real-token"
api_format = "chat"
`)

  assert.deepEqual(buildRuntimeConfigFromToml(toml, {
    apiKey: 'stale-key',
    baseURL: 'https://stale.example.com/v1',
    model: 'gpt-5.5',
    reasoningEffort: 'high',
    apiFormat: 'chat',
  }, {
    apiKey: 'MC-real-token',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    apiFormat: 'responses',
  }), {
    apiKey: 'MC-real-token',
    baseURL: 'https://api.mindcraft.com.cn/v1',
    model: 'gpt-5.5',
    reasoningEffort: 'high',
    apiFormat: 'responses',
  })
})

test('top-level agent_message stream events are normalized for renderer consumption', () => {
  const normalized = normalizeTopLevelCodexStreamEvent({
    type: 'agent_message',
    id: 'agent-msg-1',
    text: '架构文档已经改成主进程归一化契约。',
  })

  assert.deepEqual(normalized, {
    type: 'item.completed',
    item: {
      id: 'agent-msg-1',
      type: 'agent_message',
      text: '架构文档已经改成主进程归一化契约。',
    },
  })
})

test('history parser accepts both top-level and payload agent_message rows', () => {
  const topLevel = extractCodexAssistantHistoryMessageFromJsonlRow({
    type: 'agent_message',
    text: '文档收口已完成。',
  })
  const payloadWrapped = extractCodexAssistantHistoryMessageFromJsonlRow({
    type: 'event_msg',
    payload: {
      type: 'agent_message',
      message: '现在开始做代码实现。',
    },
  })

  assert.deepEqual(topLevel, {
    role: 'assistant',
    text: '文档收口已完成。',
    content: [{ type: 'output_text', text: '文档收口已完成。' }],
  })
  assert.deepEqual(payloadWrapped, {
    role: 'assistant',
    text: '现在开始做代码实现。',
    content: [{ type: 'output_text', text: '现在开始做代码实现。' }],
  })
  assert.strictEqual(extractCodexAgentMessageText({ message: { content: [{ type: 'output_text', text: '继续处理。' }] } }), '继续处理。')
})
