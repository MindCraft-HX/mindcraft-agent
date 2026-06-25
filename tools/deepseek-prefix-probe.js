const { startCodexProxy } = require('../packages/agent/electron/codex/proxyServer')
const fs = require('fs')
const os = require('os')
const path = require('path')

function readProviders() {
  const file = path.join(os.homedir(), '.codex', 'providers.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function pickDeepSeekProvider() {
  const state = readProviders()
  const providers = Array.isArray(state?.providers) ? state.providers : []
  const provider = providers.find(p => String(p?.name || '').toLowerCase() === 'deepseek')
  if (!provider) throw new Error('deepseek provider not found in ~/.codex/providers.json')
  return provider
}

function buildResponsesBody(model) {
  const instructions = [
    'You are a coding assistant.',
    'Reply in Chinese.',
    'Keep answers concise.',
    'When discussing cache behavior, be precise about observed facts.',
  ].join('\n')

  const input = [
    { type: 'message', role: 'developer', content: 'Follow repo instructions exactly.' },
    { type: 'message', role: 'user', content: '这是一次缓存命中测试。请只回复“收到测试请求”。' },
  ]

  return {
    model,
    instructions,
    input,
    stream: false,
    reasoning: { effort: 'high' },
    tools: [
      {
        type: 'function',
        name: 'shell_command',
        description: 'Run a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            timeout_ms: { type: 'number' },
          },
          required: ['command'],
        },
      },
    ],
  }
}

function extractUsage(label, body) {
  const usage = body?.usage || {}
  return {
    label,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
    cached_tokens: usage.input_tokens_details?.cached_tokens ?? null,
    raw_usage: usage,
  }
}

async function main() {
  const provider = pickDeepSeekProvider()
  const proxy = await startCodexProxy({
    upstreamUrl: provider.url,
    apiKey: provider.key,
    model: provider.model,
    reasoningEffort: provider.reasoningEffort || 'high',
  })

  const endpoint = `http://127.0.0.1:${proxy.port}/v1/responses`
  const body = buildResponsesBody(provider.model)

  try {
    const first = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const firstJson = await first.json()

    const second = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const secondJson = await second.json()

    console.log(JSON.stringify({
      provider: {
        name: provider.name,
        url: provider.url,
        model: provider.model,
        apiFormat: provider.apiFormat,
        reasoningEffort: provider.reasoningEffort,
      },
      first: extractUsage('first', firstJson),
      second: extractUsage('second', secondJson),
      firstOutput: firstJson?.output?.map(item => ({ type: item?.type, text: item?.content?.[0]?.text || item?.summary?.[0]?.text || '' })),
      secondOutput: secondJson?.output?.map(item => ({ type: item?.type, text: item?.content?.[0]?.text || item?.summary?.[0]?.text || '' })),
    }, null, 2))
  } finally {
    await proxy.close()
  }
}

main().catch(err => {
  console.error('[deepseek-prefix-probe] failed:', err)
  process.exit(1)
})
