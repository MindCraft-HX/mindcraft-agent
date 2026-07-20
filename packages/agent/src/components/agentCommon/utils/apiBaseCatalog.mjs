const API_BASE_PRESETS = Object.freeze([
  { id: 'mindcraft-api-anthropic', agentType: 'claude', label: 'MindCraft API', url: 'https://api.mindcraft.com.cn', keywords: ['mindcraft', 'mc'] },
  { id: 'anthropic', agentType: 'claude', label: 'Anthropic', url: 'https://api.anthropic.com', keywords: ['claude', 'official'] },
  { id: 'volcengine-agentplan', agentType: 'claude', label: '火山 AgentPlan', url: 'https://ark.cn-beijing.volces.com/api/coding', keywords: ['volcengine', 'ark', '火山'] },
  { id: 'doubao-seed', agentType: 'claude', label: '豆包 Seed', url: 'https://ark.cn-beijing.volces.com/api/compatible', keywords: ['doubao', 'volcengine', '豆包'] },
  { id: 'deepseek-anthropic', agentType: 'claude', label: 'DeepSeek', url: 'https://api.deepseek.com/anthropic', keywords: ['deepseek', '深度求索'] },
  { id: 'zhipu-anthropic', agentType: 'claude', label: '智谱 GLM', url: 'https://open.bigmodel.cn/api/anthropic', keywords: ['zhipu', 'glm', 'bigmodel', '智谱'] },
  { id: 'bailian-coding-anthropic', agentType: 'claude', label: '阿里云百炼 Coding', url: 'https://coding.dashscope.aliyuncs.com/apps/anthropic', keywords: ['bailian', 'dashscope', 'qwen', '百炼', '通义'] },
  { id: 'kimi-api-anthropic', agentType: 'claude', label: 'Kimi API', url: 'https://api.moonshot.cn/anthropic', keywords: ['kimi', 'moonshot', '月之暗面'] },
  { id: 'kimi-coding-plan-anthropic', agentType: 'claude', label: 'Kimi Coding Plan', url: 'https://api.kimi.com/coding/', keywords: ['kimi', 'coding', 'plan', '月之暗面'] },
  { id: 'minimax-anthropic', agentType: 'claude', label: 'MiniMax', url: 'https://api.minimaxi.com/anthropic', keywords: ['minimax'] },
  { id: 'siliconflow-anthropic', agentType: 'claude', label: '硅基流动', url: 'https://api.siliconflow.cn', keywords: ['siliconflow', '硅基'] },
  { id: 'openrouter-anthropic', agentType: 'claude', label: 'OpenRouter', url: 'https://openrouter.ai/api', keywords: ['openrouter', 'router'] },
  { id: 'therouter-anthropic', agentType: 'claude', label: 'TheRouter', url: 'https://api.therouter.ai', keywords: ['therouter', 'router'] },

  { id: 'mindcraft-api', agentType: 'codex', label: 'MindCraft API', url: 'https://api.mindcraft.com.cn/v1', keywords: ['mindcraft', 'mc'] },
  { id: 'openai', agentType: 'codex', label: 'OpenAI', url: 'https://api.openai.com/v1', apiFormat: 'responses', keywords: ['openai', 'official', 'gpt'] },
  { id: 'volcengine-agentplan-codex', agentType: 'codex', label: '火山 AgentPlan', url: 'https://ark.cn-beijing.volces.com/api/coding/v3', apiFormat: 'chat', keywords: ['volcengine', 'ark', '火山'] },
  { id: 'doubao-seed-codex', agentType: 'codex', label: '豆包 Seed', url: 'https://ark.cn-beijing.volces.com/api/v3', apiFormat: 'chat', keywords: ['doubao', 'volcengine', '豆包'] },
  { id: 'deepseek', agentType: 'codex', label: 'DeepSeek', url: 'https://api.deepseek.com', apiFormat: 'chat', keywords: ['deepseek', '深度求索'] },
  { id: 'zhipu', agentType: 'codex', label: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4', apiFormat: 'chat', keywords: ['zhipu', 'glm', 'bigmodel', '智谱'] },
  { id: 'bailian', agentType: 'codex', label: '阿里云百炼', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiFormat: 'chat', keywords: ['bailian', 'dashscope', 'qwen', '百炼', '通义'] },
  { id: 'kimi-api', agentType: 'codex', label: 'Kimi API', url: 'https://api.moonshot.cn/v1', apiFormat: 'chat', keywords: ['kimi', 'moonshot', '月之暗面'] },
  { id: 'kimi-coding-plan', agentType: 'codex', label: 'Kimi Coding Plan', url: 'https://api.kimi.com/coding/v1', apiFormat: 'chat', keywords: ['kimi', 'coding', 'plan', '月之暗面'] },
  { id: 'minimax', agentType: 'codex', label: 'MiniMax', url: 'https://api.minimaxi.com/v1', apiFormat: 'chat', keywords: ['minimax'] },
  { id: 'siliconflow', agentType: 'codex', label: '硅基流动', url: 'https://api.siliconflow.cn/v1', apiFormat: 'chat', keywords: ['siliconflow', '硅基'] },
  { id: 'openrouter', agentType: 'codex', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', apiFormat: 'responses', keywords: ['openrouter', 'router'] },
  { id: 'therouter', agentType: 'codex', label: 'TheRouter', url: 'https://api.therouter.ai/v1', apiFormat: 'responses', keywords: ['therouter', 'router'] },
])

function normalizedSearchText(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s._:/-]+/g, '')
}

export function getApiBasePresets(agentType) {
  return API_BASE_PRESETS.filter(item => item.agentType === agentType)
}

export function searchApiBasePresets(agentType, query = '') {
  const needle = normalizedSearchText(query)
  const presets = getApiBasePresets(agentType)
  if (!needle) return presets
  return presets.filter((preset) => {
    const haystack = normalizedSearchText([preset.label, preset.url, ...(preset.keywords || [])].join(' '))
    return haystack.includes(needle)
  })
}
