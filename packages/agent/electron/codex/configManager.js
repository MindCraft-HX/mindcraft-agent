'use strict';

/**
 * CodeX Config Manager — TOML parsing, provider config, runtime config resolution.
 *
 * Extracted from codexAgent.js (Phase 5 leaf-module split).
 * All functions are pure or take explicit dependencies via the factory.
 */

const fs = require('fs');
const path = require('path');

// ---- TOML Parser (pure utilities, no external deps) ----

function parseTomlStringValue(rawValue) {
  let value = String(rawValue ?? '').trim()
  if (value.startsWith('"')) {
    let out = ''
    let escaped = false
    for (let i = 1; i < value.length; i += 1) {
      const ch = value[i]
      if (escaped) { out += ch; escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') return out
      out += ch
    }
    return out
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (!isNaN(value) && value !== '') return Number(value)
  return value
}

function stripTomlInlineComment(value) {
  const raw = String(value || '').trim()
  if (raw.startsWith('"')) {
    let escaped = false
    for (let i = 1; i < raw.length; i += 1) {
      const ch = raw[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') return raw.slice(0, i + 1)
    }
    return raw
  }
  const hashIdx = raw.indexOf('#')
  return hashIdx >= 0 ? raw.slice(0, hashIdx).trim() : raw
}

function splitTomlDottedKey(pathText) {
  const parts = []
  let current = ''
  let quoted = false
  let escaped = false
  for (const ch of String(pathText || '').trim()) {
    if (escaped) { current += ch; escaped = false; continue }
    if (quoted && ch === '\\') { escaped = true; continue }
    if (ch === '"') { quoted = !quoted; continue }
    if (!quoted && ch === '.') { parts.push(current.trim()); current = ''; continue }
    current += ch
  }
  if (current || pathText) parts.push(current.trim())
  return parts
}

function parseSimpleTomlContent(content) {
  const result = {}
  try {
    let currentSection = result
    for (let rawLine of content.split('\n')) {
      const line = rawLine.replace(/\r$/, '').trim()
      if (!line || line.startsWith('#')) continue
      const sectionMatch = line.match(/^\[([^\]]+)\]$/)
      if (sectionMatch) {
        const keys = splitTomlDottedKey(sectionMatch[1])
        currentSection = keys.reduce((obj, k) => { obj[k] = obj[k] || {}; return obj[k] }, result)
        continue
      }
      const kvMatch = line.match(/^([^=]+?)\s*=\s*(.+)$/s)
      if (kvMatch) {
        const key = kvMatch[1].trim()
        currentSection[key] = parseTomlStringValue(stripTomlInlineComment(kvMatch[2]))
      }
    }
  } catch (_) {}
  return result
}

function parseSimpleToml(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    return parseSimpleTomlContent(fs.readFileSync(filePath, 'utf8'))
  } catch (_) { return {} }
}

function selectCodexTomlProvider(modelProviders, providerId) {
  if (!modelProviders || typeof modelProviders !== 'object') return null
  const id = String(providerId || '').trim()
  if (id && modelProviders[id] && typeof modelProviders[id] === 'object') return modelProviders[id]
  return Object.values(modelProviders).find(v => v && typeof v === 'object' && ('base_url' in v || 'experimental_bearer_token' in v)) || null
}

function normalizeCodexApiFormatValue(format = '') {
  const value = String(format || '').trim()
  if (value === 'chat') return 'chat'
  if (value === 'responses') return 'responses'
  return ''
}

// ---- Provider config (depends on fs + constants) ----

function readCodexProvidersConfig(configDir) {
  const providersFile = path.join(configDir, 'providers.json')
  try {
    if (!fs.existsSync(providersFile)) return null
    return JSON.parse(fs.readFileSync(providersFile, 'utf8'))
  } catch (_) { return null }
}

// ---- Runtime config factory — accepts dependency injections ----

/**
 * Create config manager with injected dependencies.
 *
 * @param {object} opts
 * @param {string} opts.codexConfigDir   — usually ~/.codex
 * @param {string} opts.configTomlFile   — usually ~/.codex/config.toml
 * @param {typeof import('electron-conf').Conf} opts.Conf — electron-conf constructor (optional, for user prefs)
 * @param {(v: string) => string} opts.normalizeReasoningEffort
 */
function createCodexConfigManager(opts = {}) {
  const {
    codexConfigDir,
    configTomlFile,
    Conf,
    normalizeReasoningEffort,
  } = opts;

  const _normalize = normalizeReasoningEffort || ((v) => v || '');

  function buildRuntimeConfigFromProvider(provider = null) {
    if (!provider || typeof provider !== 'object') return {}
    const tomlRuntime = provider.tomlText
      ? buildRuntimeConfigFromToml(parseSimpleTomlContent(provider.tomlText), {}, {})
      : {}
    return {
      apiKey: String(provider.key || tomlRuntime.apiKey || '').trim(),
      baseURL: String(provider.url || tomlRuntime.baseURL || '').trim(),
      model: String(provider.model || tomlRuntime.model || '').trim(),
      reasoningEffort: _normalize(provider.reasoningEffort || tomlRuntime.reasoningEffort || ''),
      apiFormat: normalizeCodexApiFormatValue(provider.apiFormat || tomlRuntime.apiFormat || ''),
    }
  }

  function getActiveCodexProviderRuntime() {
    const stored = readCodexProvidersConfig(codexConfigDir)
    const providers = Array.isArray(stored?.providers) ? stored.providers : []
    if (!providers.length) return {}
    const idx = Number.isInteger(stored?.activeIdx) && stored.activeIdx >= 0 && stored.activeIdx < providers.length
      ? stored.activeIdx : 0
    return buildRuntimeConfigFromProvider(providers[idx])
  }

  function buildRuntimeConfigFromToml(toml = {}, userRuntime = {}, activeProviderRuntime = {}) {
    let tomlApiKey = toml.auth_token || toml.experimental_bearer_token || ''
    let tomlBaseURL = toml.base_url || ''
    let tomlModel = toml.model || ''
    let tomlEffort = toml.model_reasoning_effort || toml.reasoning_effort || toml.reason_effort || ''
    let tomlApiFormat = toml.api_format || ''

    const provider = selectCodexTomlProvider(toml.model_providers, toml.model_provider)
    if (provider) {
      if (provider.experimental_bearer_token) tomlApiKey = provider.experimental_bearer_token || tomlApiKey
      if (provider.base_url) tomlBaseURL = provider.base_url || tomlBaseURL
      if (provider.api_format) tomlApiFormat = provider.api_format || tomlApiFormat
    }

    if (!tomlApiKey && toml.auth && toml.auth.token) tomlApiKey = toml.auth.token
    if (!tomlBaseURL && toml.api && toml.api.base_url) tomlBaseURL = toml.api.base_url
    if (!tomlModel && toml.api && toml.api.model) tomlModel = toml.api.model
    if (!tomlEffort && toml.api && (toml.api.model_reasoning_effort || toml.api.reasoning_effort || toml.api.reason_effort)) {
      tomlEffort = toml.api.model_reasoning_effort || toml.api.reasoning_effort || toml.api.reason_effort
    }

    const providerApiKey = activeProviderRuntime.apiKey || ''
    const providerBaseURL = activeProviderRuntime.baseURL || ''
    const providerModel = activeProviderRuntime.model || ''
    const providerEffort = activeProviderRuntime.reasoningEffort || ''
    const providerApiFormat = normalizeCodexApiFormatValue(activeProviderRuntime.apiFormat)

    const userApiKey = userRuntime.apiKey || ''
    const userBaseURL = userRuntime.baseURL || ''
    const userModel = userRuntime.model || ''
    const userEffort = userRuntime.reasoningEffort || userRuntime.reasonEffort || ''
    const userApiFormat = normalizeCodexApiFormatValue(userRuntime.apiFormat)

    const apiKey = providerApiKey || userApiKey || tomlApiKey
    const baseURL = providerBaseURL || userBaseURL || tomlBaseURL
    const model = userModel || providerModel || tomlModel
    const reasoningEffort = _normalize(userEffort || providerEffort || tomlEffort)
    const apiFormat = providerApiFormat || userApiFormat || normalizeCodexApiFormatValue(tomlApiFormat) || 'responses'

    return { apiKey, baseURL, model, reasoningEffort, apiFormat }
  }

  function readRuntimeConfig() {
    const toml = parseSimpleToml(configTomlFile)
    let userRuntime = {}
    if (Conf) {
      try {
        const conf = new Conf({ name: 'mindcraft-codex' })
        userRuntime = conf.get('runtime') || {}
      } catch (_) {}
    }
    return buildRuntimeConfigFromToml(toml, userRuntime, getActiveCodexProviderRuntime())
  }

  // ---- Sandbox ----

  const CODEX_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']
  const CODEX_SANDBOX_MIGRATE = {
    read_only: 'read-only',
    ask: 'workspace-write',
    allow_all: 'danger-full-access',
  }

  function readSandboxMode() {
    if (!Conf) return 'workspace-write'
    try {
      const conf = new Conf({ name: 'mindcraft-codex' })
      const mode = conf.get('sandboxMode')
      if (mode && CODEX_SANDBOX_MODES.includes(mode)) return mode
      const old = conf.get('permissionPolicy')
      if (old && CODEX_SANDBOX_MIGRATE[old]) {
        conf.set('sandboxMode', CODEX_SANDBOX_MIGRATE[old])
        conf.delete('permissionPolicy')
        return CODEX_SANDBOX_MIGRATE[old]
      }
    } catch (_) {}
    return 'workspace-write'
  }

  return {
    // TOML (stateless, can be used standalone)
    parseTomlStringValue,
    stripTomlInlineComment,
    splitTomlDottedKey,
    parseSimpleTomlContent,
    parseSimpleToml,
    selectCodexTomlProvider,
    normalizeCodexApiFormatValue,

    // Config (stateful, uses injected deps)
    readCodexProvidersConfig,
    buildRuntimeConfigFromProvider,
    getActiveCodexProviderRuntime,
    buildRuntimeConfigFromToml,
    readRuntimeConfig,
    readSandboxMode,

    // Constants
    CODEX_SANDBOX_MODES,
    CODEX_SANDBOX_MIGRATE,
  };
}

// ---- Flat exports for stateless TOML utils ----
module.exports = {
  parseTomlStringValue,
  stripTomlInlineComment,
  splitTomlDottedKey,
  parseSimpleTomlContent,
  parseSimpleToml,
  selectCodexTomlProvider,
  normalizeCodexApiFormatValue,
  createCodexConfigManager,
};
