// Defaults used only when the active provider has not configured a model slot.
// Stored provider models and existing sessions always take precedence.
export const CODEX_MODEL_SLOT_FALLBACKS = ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna']

function normalizeProvidersState(stored) {
  const providers = Array.isArray(stored)
    ? stored
    : (Array.isArray(stored?.providers) ? stored.providers : [])
  const activeIdx = Array.isArray(stored)
    ? 0
    : (Number.isInteger(stored?.activeIdx) ? stored.activeIdx : 0)
  const activeProvider = activeIdx >= 0 && activeIdx < providers.length ? providers[activeIdx] : providers[0]
  return { providers, activeIdx, activeProvider }
}

function firstDistinctModel(candidates, seen) {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (value && !seen.has(value)) return value
  }
  return ''
}

export function buildCodexModelSlots({
  storedProviders,
  sessionModel = '',
  runtimeModel = '',
  defaultModel = '',
  fallbackModels = CODEX_MODEL_SLOT_FALLBACKS,
} = {}) {
  const { providers, activeProvider } = normalizeProvidersState(storedProviders)
  const currentModel = String(sessionModel || runtimeModel || defaultModel || '').trim()
  const primaryProvider = activeProvider || providers[0] || null
  const primaryDefault = String(primaryProvider?.model || runtimeModel || currentModel || '').trim()
  const primaryAlts = Array.isArray(primaryProvider?.alternativeModels) ? primaryProvider.alternativeModels : []
  const items = []
  const seenModels = new Set()

  if (primaryDefault) {
    items.push({ id: primaryDefault, slot: 'default' })
    seenModels.add(primaryDefault)
  }

  for (let i = 0; i < 3; i++) {
    const slotModel = firstDistinctModel([primaryAlts[i], fallbackModels[i]], seenModels)
    if (!slotModel) continue
    items.push({ id: slotModel, slot: `alt${i + 1}` })
    seenModels.add(slotModel)
  }

  return {
    currentModel,
    items,
    activeProvider: primaryProvider,
  }
}
