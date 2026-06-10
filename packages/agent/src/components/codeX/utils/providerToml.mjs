const DEFAULT_PROVIDER_NAME = 'mindcraft'
const DEFAULT_ENV_KEY = 'OPENAI_API_KEY'

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

function findManagedProviderSection(lines) {
  let providerKey = ''
  let start = -1
  let end = lines.length

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = String(lines[i] || '').trim()
    const match = trimmed.match(/^\[model_providers\.(.+)\]$/)
    if (match) {
      if (start < 0) {
        start = i
        providerKey = match[1]
      }
      continue
    }
    if (start >= 0 && /^\[.*\]$/.test(trimmed)) {
      end = i
      break
    }
  }

  return { providerKey, start, end }
}

export function buildManagedProviderToml(provider = {}) {
  const name = normalizeProviderName(provider.name)
  const model = String(provider.model || '').trim()
  const url = String(provider.url || '').trim()
  const envKey = String(provider.envKey || DEFAULT_ENV_KEY).trim() || DEFAULT_ENV_KEY
  const reasoningEffort = String(provider.reasoningEffort || '').trim()

  const out = []
  if (reasoningEffort) out.push(`model_reasoning_effort = ${quoteTomlString(reasoningEffort)}`)
  out.push(`model = ${quoteTomlString(model)}`)
  out.push(`model_provider = ${quoteTomlString(name)}`)
  out.push('')
  out.push(`[model_providers.${name}]`)
  out.push(`name = ${quoteTomlString(name)}`)
  out.push(`base_url = ${quoteTomlString(url)}`)
  out.push(`env_key = ${quoteTomlString(envKey)}`)
  out.push('')
  return out.join('\n')
}

export function extractProviderDraftFromToml(tomlText = '') {
  const lines = String(tomlText || '').split('\n')
  const root = readTomlAssignments(lines)
  const section = findManagedProviderSection(lines)
  const providerFields = section.start >= 0
    ? readTomlAssignments(lines, section.start + 1, section.end)
    : {}

  const providerName = String(root.model_provider || providerFields.name || section.providerKey || '').trim()

  return {
    name: providerName,
    model: String(root.model || '').trim(),
    reasoningEffort: String(root.model_reasoning_effort || root.reasoning_effort || '').trim(),
    url: String(providerFields.base_url || root.base_url || '').trim(),
    envKey: String(providerFields.env_key || DEFAULT_ENV_KEY).trim() || DEFAULT_ENV_KEY,
  }
}

export function mergeManagedProviderToml(existingToml = '', providerToml = '') {
  const current = String(existingToml || '')
  const nextBlock = String(providerToml || '').trim()
  if (!current.trim()) return `${nextBlock}\n`

  const lines = current.split('\n')
  const out = []
  let skipManagedSection = false

  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/\r$/, '')
    const trimmed = line.trim()

    if (/^\[model_providers\./.test(trimmed)) {
      skipManagedSection = true
      continue
    }
    if (skipManagedSection && /^\[.*\]$/.test(trimmed)) {
      skipManagedSection = false
    }
    if (skipManagedSection) continue
    if (/^(model|model_provider|model_reasoning_effort)\s*=/.test(trimmed)) continue

    if (!skipManagedSection) out.push(line)
  }

  const rest = out.join('\n').replace(/^\s+|\s+$/g, '')
  if (!rest) return `${nextBlock}\n`
  return `${nextBlock}\n\n${rest}\n`
}
