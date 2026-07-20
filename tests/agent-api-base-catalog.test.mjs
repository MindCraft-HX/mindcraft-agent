import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getApiBasePresets,
  searchApiBasePresets,
} from '../packages/agent/src/components/agentCommon/utils/apiBaseCatalog.mjs'

test('API Base catalog separates Claude and Codex protocol presets', () => {
  const claude = getApiBasePresets('claude')
  const codex = getApiBasePresets('codex')

  assert.ok(claude.some(item => item.id === 'anthropic'))
  assert.deepEqual(claude.find(item => item.id === 'kimi-api-anthropic'), {
    id: 'kimi-api-anthropic',
    agentType: 'claude',
    label: 'Kimi API',
    url: 'https://api.moonshot.cn/anthropic',
    keywords: ['kimi', 'moonshot', '月之暗面'],
  })
  assert.deepEqual(claude.find(item => item.id === 'kimi-coding-plan-anthropic'), {
    id: 'kimi-coding-plan-anthropic',
    agentType: 'claude',
    label: 'Kimi Coding Plan',
    url: 'https://api.kimi.com/coding/',
    keywords: ['kimi', 'coding', 'plan', '月之暗面'],
  })
  assert.ok(claude.every(item => item.agentType === 'claude'))
  assert.ok(codex.some(item => item.id === 'openai' && item.apiFormat === 'responses'))
  assert.ok(codex.some(item => item.id === 'deepseek' && item.apiFormat === 'chat'))
  assert.deepEqual(codex.find(item => item.id === 'kimi-coding-plan'), {
    id: 'kimi-coding-plan',
    agentType: 'codex',
    label: 'Kimi Coding Plan',
    url: 'https://api.kimi.com/coding/v1',
    apiFormat: 'chat',
    keywords: ['kimi', 'coding', 'plan', '月之暗面'],
  })
  assert.ok(codex.every(item => item.agentType === 'codex'))
})

test('API Base catalog supports case-insensitive fuzzy lookup by name, URL, and aliases', () => {
  assert.deepEqual(searchApiBasePresets('codex', 'router').map(item => item.id), ['openrouter', 'therouter'])
  assert.deepEqual(searchApiBasePresets('claude', '智谱').map(item => item.id), ['zhipu-anthropic'])
  assert.deepEqual(searchApiBasePresets('codex', 'siliconflow.cn/v1').map(item => item.id), ['siliconflow'])
  assert.deepEqual(searchApiBasePresets('codex', 'coding plan').map(item => item.id), ['kimi-coding-plan'])
})

test('API Base catalog does not advertise unsupported agent types', () => {
  assert.deepEqual(getApiBasePresets('gemini'), [])
  assert.deepEqual(searchApiBasePresets('gemini', 'openai'), [])
})
