const DEFAULT_PROVIDER_NAME = 'mindcraft'
const VALID_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh'])

export function normalizeCodexReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase()
  if (!effort) return ''
  if (effort === 'extra_high' || effort === 'max') return 'xhigh'
  return VALID_REASONING_EFFORTS.has(effort) ? effort : ''
}

function normalizeProviderName(name) {
  const value = String(name || '').trim()
  return value || DEFAULT_PROVIDER_NAME
}

function quoteTomlString(value) {
  const text = String(value ?? '')
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseTomlStringValue(rawValue) {
  const value = String(rawValue ?? '').trim()
  if (!value.startsWith('"')) return value

  let out = ''
  let escaped = false
  for (let i = 1; i < value.length; i += 1) {
    const ch = value[i]
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') return out
    out += ch
  }
  return out
}

function readTomlAssignments(lines, startIndex = 0, endIndex = lines.length) {
  const result = {}
  for (let i = startIndex; i < endIndex; i += 1) {
    const line = String(lines[i] || '').replace(/\r$/, '')
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || /^\[.*\]$/.test(trimmed)) continue

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
    if (!match) continue

    result[match[1]] = parseTomlStringValue(match[2])
  }
  return result
}

function findManagedProviderSection(lines, preferredProviderKey = '') {
  let providerKey = ''
  let start = -1
  const preferred = String(preferredProviderKey || '').trim()

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] || '').trim()
    const match = trimmed.match(/^\[model_providers\.(.+)\]$/)
    if (!match) continue
    if (preferred && match[1] !== preferred) continue
    start = i
    providerKey = match[1]
    break
  }

  let end = lines.length
  if (start >= 0) {
    for (let i = start + 1; i < lines.length; i += 1) {
      const trimmed = String(lines[i] || '').trim()
      if (/^\[.*\]$/.test(trimmed)) {
        end = i
        break
      }
    }
  }

  return { providerKey, start, end }
}

export function buildManagedProviderToml(provider = {}) {
  const name = normalizeProviderName(provider.name)
  const model = String(provider.model || '').trim()
  const url = String(provider.url || '').trim()
  const apiKey = String(provider.apiKey || '').trim()
  const reasoningEffort = normalizeCodexReasoningEffort(provider.reasoningEffort)

  const out = []
  if (reasoningEffort) out.push(`model_reasoning_effort = ${quoteTomlString(reasoningEffort)}`)
  out.push(`model = ${quoteTomlString(model)}`)
  out.push(`model_provider = ${quoteTomlString(name)}`)
  out.push('')
  out.push(`[model_providers.${name}]`)
  out.push(`name = ${quoteTomlString(name)}`)
  out.push(`base_url = ${quoteTomlString(url)}`)
  if (apiKey) out.push(`experimental_bearer_token = ${quoteTomlString(apiKey)}`)
  out.push('')
  return out.join('\n')
}

export function extractProviderDraftFromToml(tomlText = '') {
  const lines = String(tomlText || '').split('\n')
  const root = readTomlAssignments(lines)
  const section = findManagedProviderSection(lines, root.model_provider)
  const providerFields = section.start >= 0
    ? readTomlAssignments(lines, section.start + 1, section.end)
    : {}

  const providerName = String(root.model_provider || providerFields.name || section.providerKey || '').trim()

  return {
    name: providerName,
    model: String(root.model || '').trim(),
    reasoningEffort: normalizeCodexReasoningEffort(root.model_reasoning_effort || root.reasoning_effort),
    url: String(providerFields.base_url || root.base_url || '').trim(),
    apiKey: String(providerFields.experimental_bearer_token || root.experimental_bearer_token || root.auth_token || '').trim(),
  }
}

export function mergeManagedProviderToml(existingToml = '', providerToml = '') {
  const current = String(existingToml || '')
  const nextBlock = String(providerToml || '').trim()
  if (!current.trim()) return `${nextBlock}\n`

  const nextLines = nextBlock.split('\n')
  const nextRoot = readTomlAssignments(nextLines)
  const nextSection = findManagedProviderSection(nextLines, nextRoot.model_provider)
  const managedProviderKey = String(nextRoot.model_provider || nextSection.providerKey || '').trim()
  const lines = current.split('\n')
  const currentRoot = readTomlAssignments(lines)
  const currentProviderKey = String(currentRoot.model_provider || '').trim()
  const replaceProviderKeys = new Set([managedProviderKey, currentProviderKey].filter(Boolean))

  const out = []
  let skipManagedSection = false
  let inTopLevel = true

  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/\r$/, '')
    const trimmed = line.trim()

    const providerMatch = trimmed.match(/^\[model_providers\.(.+)\]$/)
    if (providerMatch && replaceProviderKeys.has(providerMatch[1])) {
      skipManagedSection = true
      inTopLevel = false
      continue
    }
    if (skipManagedSection && /^\[.*\]$/.test(trimmed)) {
      skipManagedSection = false
    }
    if (skipManagedSection) continue
    if (/^\[.*\]$/.test(trimmed)) inTopLevel = false
    if (inTopLevel && /^(model|model_provider|model_reasoning_effort)\s*=/.test(trimmed)) continue

    if (!skipManagedSection) out.push(line)
  }

  const rest = out.join('\n').replace(/^\s+|\s+$/g, '')
  if (!rest) return `${nextBlock}\n`
  return `${nextBlock}\n\n${rest}\n`
}
