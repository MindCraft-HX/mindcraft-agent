'use strict';

/**
 * MindCraft Provider SQL Export — CC Switch compatible format.
 *
 * This module is PURE — no I/O, no storage access, no electron-conf.
 * It receives provider data and options, and returns SQL strings.
 *
 * The caller (IPC handler) is responsible for reading providers from
 * the current runtime storage adapter and passing them in.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete CC Switch compatible SQL dump.
 *
 * @param {object} opts
 * @param {Array<object>} opts.claudeProviders — MindCraft Claude provider list
 * @param {number}  [opts.claudeActiveIdx=-1]  — index of active Claude provider
 * @param {Array<object>} opts.codexProviders  — MindCraft CodeX provider list
 * @param {number}  [opts.codexActiveIdx=-1]   — index of active CodeX provider
 * @param {boolean} [opts.includeSecrets=true] — false to redact keys
 * @param {boolean} [opts.includeActive=false] — true to export is_current flag
 * @returns {string} complete SQL dump text
 */
function buildProviderSqlExport({
  claudeProviders = [],
  claudeActiveIdx = -1,
  codexProviders = [],
  codexActiveIdx = -1,
  includeSecrets = true,
  includeActive = false,
} = {}) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push('-- MindCraft Provider SQL Export');
  lines.push(`-- Generated at: ${now}`);
  lines.push('PRAGMA foreign_keys=OFF;');
  lines.push('BEGIN TRANSACTION;');
  lines.push('');
  lines.push(buildProvidersTableDDL());
  lines.push('');

  let sort = 0;

  // Claude providers
  for (let i = 0; i < claudeProviders.length; i++) {
    const isActive = includeActive && (i === claudeActiveIdx);
    const insert = buildClaudeProviderInsert(claudeProviders[i], sort, { includeSecrets, isActive });
    lines.push(insert);
    lines.push('');
    sort += 1;
  }

  // CodeX providers
  for (let i = 0; i < codexProviders.length; i++) {
    const isActive = includeActive && (i === codexActiveIdx);
    const insert = buildCodexProviderInsert(codexProviders[i], sort, { includeSecrets, isActive });
    lines.push(insert);
    lines.push('');
    sort += 1;
  }

  lines.push('COMMIT;');
  lines.push('PRAGMA foreign_keys=ON;');
  lines.push('');

  return lines.join('\n');
}

/**
 * Build a single INSERT for a Claude provider.
 *
 * @param {object} provider
 * @param {number} sortIndex
 * @param {object}  opts
 * @param {boolean} opts.includeSecrets
 * @param {boolean} opts.isActive
 * @returns {string} INSERT SQL
 */
function buildClaudeProviderInsert(provider, sortIndex, { includeSecrets = true, isActive = false } = {}) {
  const id = uuid();
  const name = provider.name || '';
  const website = provider.website || null;
  const note = provider.note || null;

  // Build settings_config — prefer existing config, rebuild from UI fields if missing
  const settingsConfig = buildClaudeSettingsConfig(provider, { includeSecrets });

  // Build meta
  const meta = buildClaudeMeta(provider);

  const nowSec = Math.floor(Date.now() / 1000);

  return buildInsertRow({
    id,
    app_type: 'claude',
    name,
    settings_config: JSON.stringify(settingsConfig),
    website_url: website,
    category: null,
    created_at: nowSec,
    sort_index: sortIndex,
    notes: note,
    icon: null,
    icon_color: null,
    meta: JSON.stringify(meta),
    is_current: isActive ? 1 : 0,
    in_failover_queue: 0,
    cost_multiplier: '1.0',
    limit_daily_usd: null,
    limit_monthly_usd: null,
    provider_type: null,
  });
}

/**
 * Build a single INSERT for a CodeX provider.
 *
 * @param {object} provider
 * @param {number} sortIndex
 * @param {object}  opts
 * @param {boolean} opts.includeSecrets
 * @param {boolean} opts.isActive
 * @returns {string} INSERT SQL
 */
function buildCodexProviderInsert(provider, sortIndex, { includeSecrets = true, isActive = false } = {}) {
  const id = uuid();
  const name = provider.name || '';
  const apiKey = includeSecrets ? (provider.key || '') : '';
  const model = provider.model || '';
  const reasoningEffort = provider.reasoningEffort || '';
  const apiFormat = provider.apiFormat || 'responses';

  // Build settings_config = { auth: {OPENAI_API_KEY}, config: "toml..." }
  const configToml = buildCodexToml({
    name,
    url: provider.url || '',
    model,
    reasoningEffort,
    apiFormat,
  });

  const settingsConfig = {
    auth: { OPENAI_API_KEY: apiKey },
    config: configToml,
  };

  // Build meta
  const meta = buildCodexMeta({ apiFormat, reasoningEffort });

  const nowSec = Math.floor(Date.now() / 1000);

  return buildInsertRow({
    id,
    app_type: 'codex',
    name,
    settings_config: JSON.stringify(settingsConfig),
    website_url: null,
    category: null,
    created_at: nowSec,
    sort_index: sortIndex,
    notes: null,
    icon: null,
    icon_color: null,
    meta: JSON.stringify(meta),
    is_current: isActive ? 1 : 0,
    in_failover_queue: 0,
    cost_multiplier: '1.0',
    limit_daily_usd: null,
    limit_monthly_usd: null,
    provider_type: null,
  });
}

/**
 * Build CodeX TOML string from provider fields.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.url
 * @param {string} opts.model
 * @param {string} opts.reasoningEffort — may be empty
 * @param {string} opts.apiFormat — 'chat' | 'responses'
 * @returns {string} TOML config block
 */
function buildCodexToml({ name, url, model, reasoningEffort, apiFormat }) {
  const wireApi = apiFormat === 'chat' ? 'chat' : 'responses';
  const lines = [];

  lines.push('model_provider = "custom"');
  if (model) lines.push(`model = "${escapeTomlValue(model)}"`);
  if (reasoningEffort) lines.push(`model_reasoning_effort = "${escapeTomlValue(reasoningEffort)}"`);
  lines.push(`wire_api = "${wireApi}"`);
  lines.push('');
  lines.push('[model_providers.custom]');
  lines.push(`name = "${escapeTomlValue(name)}"`);
  lines.push(`base_url = "${escapeTomlValue(url)}"`);
  lines.push('requires_openai_auth = true');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Claude helpers
// ---------------------------------------------------------------------------

/**
 * Build Claude settings_config from provider data.
 *
 * Strategy:
 *  1. If provider.config exists and has env keys, use it as base (it IS the
 *     actual ~/.claude/settings.json object).
 *  2. Overlay UI fields (key, url, tierModels, selectedTier, language,
 *     permissionPolicy, effortLevel) so that any drift between stored config
 *     and UI is reconciled.
 *  3. If provider.config is null/missing, build fresh from UI fields.
 *
 * @param {object} provider
 * @param {object} opts
 * @param {boolean} opts.includeSecrets
 * @returns {object} settings_config
 */
function buildClaudeSettingsConfig(provider, { includeSecrets }) {
  const existingConfig = provider.config || {};
  const existingEnv = existingConfig.env || {};

  const apiKey = includeSecrets ? (provider.key || '') : '';
  const baseUrl = provider.url || '';
  const selectedTier = provider.selectedTier || 'sonnet';
  const language = provider.language || 'zh-CN';
  const permissionPolicy = provider.permissionPolicy || '';
  const effortLevel = provider.effortLevel || '';
  const tierModels = provider.tierModels || {};

  // Start with existing env, overlay with current key/url
  const env = { ...existingEnv };

  // Determine which key field to use
  const hasApiKey = typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.length > 0;
  if (hasApiKey || (apiKey && !env.ANTHROPIC_AUTH_TOKEN)) {
    // Provider uses ANTHROPIC_API_KEY variant — don't add ANTHROPIC_AUTH_TOKEN
    env.ANTHROPIC_API_KEY = apiKey || env.ANTHROPIC_API_KEY || '';
  }
  if (!hasApiKey) {
    env.ANTHROPIC_AUTH_TOKEN = apiKey || env.ANTHROPIC_AUTH_TOKEN || '';
  }
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

  // When redacting, explicitly wipe any keys that may have leaked from config.env.
  // The logic above uses `apiKey || env.OLD_VALUE` which preserves old values
  // when apiKey is ''; this block ensures both fields are blanked.
  if (!includeSecrets) {
    env.ANTHROPIC_AUTH_TOKEN = '';
    env.ANTHROPIC_API_KEY = '';
  }

  // Tier model env vars — map from tierModels UI slots
  // CC Switch doesn't have a specific "reasoning" tier env var;
  // reasoning models go into the ANTHROPIC_MODEL top-level field when selected.
  const tierToEnvKey = {
    sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  };

  for (const [tier, envKey] of Object.entries(tierToEnvKey)) {
    const modelId = tierModels[tier];
    if (modelId && typeof modelId === 'string' && modelId.trim()) {
      env[envKey] = modelId.trim();
    }
  }

  // Build settings_config
  const config = { env };

  // Top-level model = selectedTier
  if (selectedTier) config.model = selectedTier;

  // Claude Code settings-level fields
  if (language) config.language = language;
  if (permissionPolicy) config.permissionPolicy = permissionPolicy;
  if (effortLevel) config.effortLevel = effortLevel;

  return config;
}

/**
 * Build meta JSON for Claude provider.
 */
function buildClaudeMeta(provider) {
  const existingConfig = provider.config || {};
  const existingEnv = existingConfig.env || {};

  // Detect apiKeyField
  const hasApiKey = typeof existingEnv.ANTHROPIC_API_KEY === 'string' && existingEnv.ANTHROPIC_API_KEY.length > 0;
  const apiKeyField = hasApiKey ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN';

  return {
    apiFormat: 'anthropic',
    apiKeyField,
    source: 'mindcraft',
  };
}

// ---------------------------------------------------------------------------
// CodeX meta helper
// ---------------------------------------------------------------------------

/**
 * Build meta JSON for CodeX provider.
 */
function buildCodexMeta({ apiFormat, reasoningEffort }) {
  // Map MindCraft apiFormat → CC Switch apiFormat
  const ccApiFormat = apiFormat === 'chat' ? 'openai_chat' : 'openai_responses';

  const meta = {
    apiFormat: ccApiFormat,
    source: 'mindcraft',
  };

  // Only include codexChatReasoning if reasoningEffort is set
  if (reasoningEffort) {
    meta.codexChatReasoning = {
      effort: reasoningEffort,
      summary: reasoningEffort,
    };
  }

  return meta;
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

const PROVIDERS_COLUMNS = [
  'id', 'app_type', 'name', 'settings_config', 'website_url', 'category',
  'created_at', 'sort_index', 'notes', 'icon', 'icon_color', 'meta',
  'is_current', 'in_failover_queue', 'cost_multiplier', 'limit_daily_usd',
  'limit_monthly_usd', 'provider_type',
];

function buildProvidersTableDDL() {
  return [
    'CREATE TABLE IF NOT EXISTS "providers" (',
    '  "id" TEXT PRIMARY KEY,',
    '  "app_type" TEXT NOT NULL,',
    '  "name" TEXT NOT NULL,',
    '  "settings_config" TEXT NOT NULL,',
    '  "website_url" TEXT,',
    '  "category" TEXT,',
    '  "created_at" INTEGER NOT NULL,',
    '  "sort_index" INTEGER NOT NULL,',
    '  "notes" TEXT,',
    '  "icon" TEXT,',
    '  "icon_color" TEXT,',
    '  "meta" TEXT,',
    '  "is_current" INTEGER NOT NULL DEFAULT 0,',
    '  "in_failover_queue" INTEGER NOT NULL DEFAULT 0,',
    '  "cost_multiplier" TEXT DEFAULT \'1.0\',',
    '  "limit_daily_usd" TEXT,',
    '  "limit_monthly_usd" TEXT,',
    '  "provider_type" TEXT',
    ');',
  ].join('\n');
}

/**
 * Build an INSERT INTO "providers" (...) VALUES (...) statement.
 *
 * @param {object} row — keys matching PROVIDERS_COLUMNS
 * @returns {string}
 */
function buildInsertRow(row) {
  const qCols = PROVIDERS_COLUMNS.map((c) => `"${c}"`).join(', ');
  const values = PROVIDERS_COLUMNS.map((col) => formatSqlValue(row[col])).join(', ');
  return `INSERT INTO "providers" (${qCols}) VALUES (${values});`;
}

/**
 * Format a JS value as an SQL literal.
 *
 * @param {*} value
 * @returns {string}
 */
function formatSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return String(value);
    return 'NULL';
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  return escapeSqlLiteral(String(value));
}

/**
 * SQL string literal escaping.
 *
 * SQLite uses single-quote doubling for escaping inside string literals.
 * Backslashes are NOT escape characters in SQLite string literals, so we
 * must NOT double them — doing so would break roundtrip with unescapeSqlValue
 * in the import parser, which only handles '' unescaping.
 *
 * @param {string} str
 * @returns {string} quoted SQL literal e.g. 'it''s'
 */
function escapeSqlLiteral(str) {
  // Only escape single quotes via doubling — SQLite convention
  const escaped = String(str).replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Escape a value for use inside a TOML double-quoted string.
 */
function escapeTomlValue(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generate a simple UUID v4.
 */
function uuid() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------

module.exports = {
  buildProviderSqlExport,
  buildClaudeProviderInsert,
  buildCodexProviderInsert,
  buildCodexToml,
  buildClaudeSettingsConfig,
  escapeSqlLiteral,
};
