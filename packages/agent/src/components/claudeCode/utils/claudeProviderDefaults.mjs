const CLAUDE_TIERS = ['haiku', 'sonnet', 'opus', 'reasoning']
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh']

function trim(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTier(value) {
  const tier = trim(value).toLowerCase()
  return CLAUDE_TIERS.includes(tier) ? tier : ''
}

function normalizeEffort(value) {
  const effort = trim(value).toLowerCase()
  if (effort === 'max') return 'xhigh'
  return CLAUDE_EFFORTS.includes(effort) ? effort : ''
}

export function resolveClaudeProviderDefaults(provider = {}, fallback = {}) {
  const config = provider?.config && typeof provider.config === 'object' ? provider.config : {}
  const env = config?.env && typeof config.env === 'object' ? config.env : {}
  const storedModels = provider?.tierModels && typeof provider.tierModels === 'object'
    ? provider.tierModels
    : {}
  const tierModels = {
    haiku: trim(storedModels.haiku || env.ANTHROPIC_DEFAULT_HAIKU_MODEL),
    sonnet: trim(storedModels.sonnet || env.ANTHROPIC_DEFAULT_SONNET_MODEL),
    opus: trim(storedModels.opus || env.ANTHROPIC_DEFAULT_OPUS_MODEL),
    reasoning: trim(storedModels.reasoning || env.ANTHROPIC_REASONING_MODEL),
  }

  let selectedTier = normalizeTier(provider?.selectedTier) || normalizeTier(config?.model)
  const concreteModel = !normalizeTier(config?.model)
    ? trim(config?.model || env.ANTHROPIC_MODEL)
    : trim(env.ANTHROPIC_MODEL)
  if (!selectedTier && concreteModel) {
    selectedTier = CLAUDE_TIERS.find(tier => tierModels[tier] === concreteModel) || ''
  }
  selectedTier = selectedTier || normalizeTier(fallback?.selectedTier) || 'sonnet'

  const effortLevel = normalizeEffort(provider?.effortLevel)
    || normalizeEffort(config?.effortLevel)
    || normalizeEffort(fallback?.effortLevel)
    || 'medium'

  return {
    selectedTier,
    effortLevel,
    tierModels,
    model: tierModels[selectedTier] || concreteModel || '',
  }
}

export function shouldApplyClaudeProviderDefaultsToChat(chat = {}, activeChatId = '') {
  if (activeChatId && chat?.id === activeChatId) return true
  if (chat?.cliSessionId || chat?.filePath) return false
  return !(chat?.messages || []).some(message => message?.role === 'user' || message?.role === 'assistant')
}
