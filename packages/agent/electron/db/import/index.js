'use strict';

/**
 * Shared import orchestrator for config import flows.
 *
 * Supports two sources:
 *  - 'cc-switch':   .sql export from CC Switch
 *  - 'local-cli':   existing local CLI config (config.toml or settings.json)
 *
 * Used by both CodeX and ClaudeCode IPC handlers.
 */

const fs = require('fs');
const path = require('path');
const { parseCcSwitchExport, mapCcSwitchRow } = require('./ccSwitch');
const providerDao = require('../dao/providers');
const importRunsDao = require('../dao/importRuns');
const { backupDb } = require('../backup');

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Preview providers from a CC Switch .sql file.
 *
 * @param {string} filePath — path to .sql file
 * @param {object} [opts]
 * @param {string} [opts.source] — default 'cc-switch'
 * @returns {{ ok: boolean, providers: Array, warnings: Array<string> }}
 */
function previewCcSwitchFile(filePath, { source = 'cc-switch' } = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, providers: [], warnings: [`File not found: ${filePath}`] };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = parseCcSwitchExport(content, { source });

    // Assign tempIds for UI conflict resolution
    const providers = result.providers.map((p, idx) => ({
      tempId: `cc-${idx}`,
      ...p,
    }));

    return { ok: true, providers, warnings: result.warnings };
  } catch (e) {
    return { ok: false, providers: [], warnings: [`Parse error: ${e.message}`] };
  }
}

function selectCodexTomlProvider(cliConfig = {}) {
  const providers = cliConfig.model_providers && typeof cliConfig.model_providers === 'object'
    ? cliConfig.model_providers
    : {};
  const preferred = typeof cliConfig.model_provider === 'string' ? cliConfig.model_provider.trim() : '';

  if (preferred && providers[preferred] && typeof providers[preferred] === 'object') {
    return { providerKey: preferred, provider: providers[preferred] };
  }

  for (const [providerKey, provider] of Object.entries(providers)) {
    if (provider && typeof provider === 'object' && (provider.base_url || provider.experimental_bearer_token || provider.api_format)) {
      return { providerKey, provider };
    }
  }

  return { providerKey: preferred, provider: {} };
}

function mergeCodexImportConfig(existingConfig = {}, incomingConfig = {}) {
  const merged = { ...existingConfig };
  for (const key of ['key', 'url', 'model', 'reasoningEffort', 'apiFormat']) {
    const value = incomingConfig[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      merged[key] = value;
    }
  }

  const existingAuth = existingConfig.authJson && typeof existingConfig.authJson === 'object'
    ? existingConfig.authJson
    : {};
  if (incomingConfig.authJson && typeof incomingConfig.authJson === 'object') {
    merged.authJson = { ...existingAuth, ...incomingConfig.authJson };
  } else if (incomingConfig.key) {
    merged.authJson = { ...existingAuth, OPENAI_API_KEY: incomingConfig.key };
  } else if (!merged.authJson) {
    merged.authJson = {};
  }

  if (Array.isArray(incomingConfig.alternativeModels)) {
    merged.alternativeModels = incomingConfig.alternativeModels;
  } else if (!Array.isArray(merged.alternativeModels)) {
    merged.alternativeModels = [];
  }

  if (incomingConfig.tomlText !== undefined) {
    merged.tomlText = incomingConfig.tomlText || '';
  } else if (merged.tomlText === undefined) {
    merged.tomlText = '';
  }

  return merged;
}

/**
 * Preview providers from local CLI config.
 * For CodeX: reads ~/.codex/config.toml
 * For ClaudeCode: reads ~/.claude/settings.json
 *
 * @param {object} opts
 * @param {string} opts.agentType — 'codex' | 'claude'
 * @param {object} opts.cliConfig — resolved CLI config object
 * @returns {{ ok: boolean, providers: Array, warnings: Array<string> }}
 */
function previewLocalCliConfig({ agentType, cliConfig }) {
  if (!cliConfig || typeof cliConfig !== 'object') {
    return { ok: false, providers: [], warnings: ['No local CLI config available'] };
  }

  if (agentType === 'codex') {
    const { providerKey, provider } = selectCodexTomlProvider(cliConfig);
    const key = provider.experimental_bearer_token || cliConfig.auth_token || cliConfig.experimental_bearer_token || '';
    const url = provider.base_url || cliConfig.base_url || '';
    const model = cliConfig.model || '';
    const reasoningEffort = cliConfig.model_reasoning_effort || cliConfig.reasoning_effort || '';
    const apiFormat = provider.api_format || cliConfig.api_format || cliConfig.wire_api || '';

    if (!key && !url && !model) {
      return { ok: false, providers: [], warnings: ['No config values found in local config.toml'] };
    }

    return {
      ok: true,
      providers: [{
        tempId: 'local-0',
        agentType: 'codex',
        name: provider.name || providerKey || 'Local CLI Config',
        config: {
          key,
          url,
          model,
          reasoningEffort,
          apiFormat,
          authJson: key ? { OPENAI_API_KEY: key } : {},
          alternativeModels: [],
          tomlText: '',
        },
        metadata: { source: 'local-cli' },
        isActive: false,
      }],
      warnings: [],
    };
  }

  if (agentType === 'claude') {
    // settings.json
    const env = cliConfig.env && typeof cliConfig.env === 'object' ? cliConfig.env : {};
    const key = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || cliConfig.ANTHROPIC_AUTH_TOKEN || cliConfig.anthropicAuthToken || '';
    const url = env.ANTHROPIC_BASE_URL || cliConfig.ANTHROPIC_BASE_URL || cliConfig.anthropicBaseUrl || '';
    const model = typeof cliConfig.model === 'string' ? cliConfig.model.trim() : '';
    const selectedTier = ['haiku', 'sonnet', 'opus', 'reasoning'].includes(model) ? model : (model ? 'sonnet' : 'sonnet');
    const tierModels = {
      haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',
      sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || '',
      opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
      reasoning: env.ANTHROPIC_REASONING_MODEL || '',
    };
    if (model && !['haiku', 'sonnet', 'opus', 'reasoning'].includes(model) && !tierModels[selectedTier]) {
      tierModels[selectedTier] = model;
    }

    if (!key) {
      return { ok: false, providers: [], warnings: ['No ANTHROPIC_AUTH_TOKEN found in settings.json'] };
    }

    return {
      ok: true,
      providers: [{
        tempId: 'local-0',
        agentType: 'claude',
        name: 'Local CLI Config',
        config: {
          ...cliConfig,
          key,
          url,
          env: {
            ...env,
            ...(key ? { ANTHROPIC_AUTH_TOKEN: key } : {}),
            ...(url ? { ANTHROPIC_BASE_URL: url } : {}),
            ...(tierModels[selectedTier] ? { ANTHROPIC_MODEL: tierModels[selectedTier] } : {}),
          },
          model: selectedTier,
        },
        tierModels,
        selectedTier,
        metadata: { source: 'local-cli' },
        isActive: false,
      }],
      warnings: [],
    };
  }

  return { ok: false, providers: [], warnings: [`Unknown agentType: ${agentType}`] };
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Add conflict info to preview providers by checking against existing providers.
 *
 * @param {Array} previewProviders — from previewCcSwitchFile or previewLocalCliConfig
 * @param {Array} existingProviders — current providers from DB or legacy storage
 * @returns {Array} preview providers with `conflict` field added
 */
function annotateConflicts(previewProviders, existingProviders = []) {
  const existingNames = new Set(
    existingProviders.map((p) => (p.name || '').toLowerCase()).filter(Boolean),
  );
  return previewProviders.map((p) => {
    const nameKey = (p.name || '').toLowerCase();
    return { ...p, conflict: existingNames.has(nameKey) ? 'name' : null };
  });
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

/**
 * Commit imported providers to the database and project to legacy storage.
 *
 * @param {import('sql.js').Database} db
 * @param {object} opts
 * @param {Array} opts.providers — [{ tempId, action: 'add'|'overwrite'|'skip', targetProviderId?, ... }]
 * @param {Array} opts.previewProviders — original preview providers (for lookup)
 * @param {Array} opts.existingProviders — current providers in legacy storage (for projection)
 * @param {string} opts.agentType — 'codex' | 'claude'
 * @param {string} opts.source — 'cc-switch' | 'local-cli'
 * @param {string} [opts.sourcePath] — file path for audit
 * @param {string} [opts.userDataDir] — for backup
 * @returns {{ ok: boolean, imported: number, skipped: number, backupPath: string, providers: Array, warnings: Array<string> }}
 */
function commitImport(db, {
  providers: decisions,
  previewProviders,
  existingProviders = [],
  agentType,
  source,
  sourcePath,
  userDataDir,
}) {
  // Build lookup from preview
  const previewMap = new Map();
  for (const pp of (previewProviders || [])) {
    previewMap.set(pp.tempId, pp);
  }

  const toUpsert = [];
  const warnings = [];
  let skipped = 0;

  // Build name→id lookup for overwrite matching
  const existingNameMap = new Map();
  const existingById = new Map();
  for (const ep of (existingProviders || [])) {
    const key = (ep.name || '').toLowerCase();
    if (key && !existingNameMap.has(key)) {
      existingNameMap.set(key, ep.id);
    }
    if (ep.id) existingById.set(ep.id, ep);
  }

  for (const d of (decisions || [])) {
    if (d.action === 'skip') {
      skipped += 1;
      continue;
    }

    const preview = previewMap.get(d.tempId);
    if (!preview) {
      warnings.push(`Unknown tempId: ${d.tempId}`);
      skipped += 1;
      continue;
    }

    // Resolve target provider ID for overwrite
    let providerId = undefined; // undefined = auto-generate new UUID
    if (d.action === 'overwrite') {
      if (d.targetProviderId) {
        providerId = d.targetProviderId;
      } else {
        // Match by name from existing providers
        const nameKey = (preview.name || '').toLowerCase();
        if (nameKey && existingNameMap.has(nameKey)) {
          providerId = existingNameMap.get(nameKey);
        } else {
          warnings.push(`Cannot overwrite "${preview.name}": not found in existing providers. Adding as new.`);
        }
      }
      // Track resolved ID for legacy projection filtering
      d._resolvedProviderId = providerId;
    }

    // Validate rename: must be non-empty and unique (no collision with existing or batch peers)
    let resolvedName = preview.name;
    if (d.action === 'rename') {
      const raw = (d.finalName || '').trim();
      if (!raw) {
        warnings.push("Rename: empty name for \"" + preview.name + "\", skipped.");
        skipped += 1;
        continue;
      }
      const nameLower = raw.toLowerCase();
      // Check against existing providers
      if (existingNameMap.has(nameLower)) {
        warnings.push("Rename: \"" + raw + "\" already exists, \"" + preview.name + "\" skipped.");
        skipped += 1;
        continue;
      }
      // Check against already-accumulated names in this batch (avoid intra-batch duplicates)
      const batchNames = new Set(toUpsert.map((p) => (p.name || '').toLowerCase()));
      if (batchNames.has(nameLower)) {
        warnings.push("Rename: \"" + raw + "\" conflicts with another imported provider, \"" + preview.name + "\" skipped.");
        skipped += 1;
        continue;
      }
      resolvedName = raw;
    }

    const providerMetadata = { ...(preview.metadata || {}) };
    if (preview.agentType === 'claude' || agentType === 'claude') {
      if (preview.tierModels !== undefined) providerMetadata.tierModels = preview.tierModels;
      if (preview.selectedTier !== undefined) providerMetadata.selectedTier = preview.selectedTier;
    }

    const effectiveAgentType = preview.agentType || agentType;
    const existingForOverwrite = providerId ? existingById.get(providerId) : null;
    const providerConfig = effectiveAgentType === 'codex'
      ? mergeCodexImportConfig(
          d.action === 'overwrite' && existingForOverwrite ? existingForOverwrite.config || {} : {},
          preview.config || {},
        )
      : preview.config || {};

    toUpsert.push({
      id: providerId,
      agentType: effectiveAgentType,
      name: resolvedName,
      config: providerConfig,
      metadata: providerMetadata,
      isActive: preview.isActive === true,
      source,
      // Preserve provider-type-specific UI/runtime fields (e.g. Claude tierModels)
      ...(preview.tierModels !== undefined ? { tierModels: preview.tierModels } : {}),
      ...(preview.selectedTier !== undefined ? { selectedTier: preview.selectedTier } : {}),
      ...(preview.language !== undefined ? { language: preview.language } : {}),
      ...(preview.permissionPolicy !== undefined ? { permissionPolicy: preview.permissionPolicy } : {}),
      ...(preview.effortLevel !== undefined ? { effortLevel: preview.effortLevel } : {}),
      ...(preview.website !== undefined ? { website: preview.website } : {}),
      ...(preview.note !== undefined ? { note: preview.note } : {}),
      ...(preview.runtimeConfig !== undefined ? { runtimeConfig: preview.runtimeConfig } : {}),
    });
  }

  // Normalize: at most one active provider per agent_type in this batch.
  // If multiple CC Switch providers are marked current, only the last one wins.
  let activeFound = false;
  for (let i = toUpsert.length - 1; i >= 0; i--) {
    if (toUpsert[i].isActive) {
      if (activeFound) {
        toUpsert[i].isActive = false;
      } else {
        activeFound = true;
      }
    }
  }

  // Backup if userDataDir provided
  let backupPath = '';
  if (db && userDataDir) {
    const backupResult = backupDb(db, { userDataDir, label: `pre-import-${Date.now()}` });
    if (backupResult.ok) {
      backupPath = backupResult.backupPath;
    }
  }

  // Write to DB
  const upsertResult = db
    ? providerDao.upsertProviders(db, toUpsert, { source })
    : { ok: false, count: 0, ids: [] };

  if (!upsertResult.ok) {
    return { ok: false, imported: 0, skipped, backupPath, providers: [], warnings: [...warnings, upsertResult.error] };
  }

  // Record import run
  if (db) {
    importRunsDao.recordImportRun(db, {
      source,
      sourcePath: sourcePath || null,
      summary: { imported: upsertResult.count, skipped },
    });
  }

  // Ensure at most one active provider per agent_type after batch import
  if (db && activeFound) {
    const activeProvider = toUpsert.find((p) => p.isActive);
    if (activeProvider) {
      const activeId = activeProvider.id || upsertResult.ids[toUpsert.indexOf(activeProvider)];
      if (activeId) {
        providerDao.setActiveProvider(db, activeProvider.agentType || agentType, activeId);
      }
    }
  }

  // Build the new merged provider list for legacy projection
  const newProviders = [
    ...existingProviders.filter((ep) => {
      // Remove overwritten providers (matches by targetProviderId or resolved name-based ID)
      return !decisions.some((d) =>
        d.action === 'overwrite' && (
          d.targetProviderId === ep.id || d._resolvedProviderId === ep.id
        ),
      );
    }),
    ...toUpsert.map((p, i) => ({
      id: upsertResult.ids[i] || p.id,
      agentType: p.agentType,
      name: p.name,
      config: p.config,
      metadata: p.metadata,
      isActive: p.isActive,
      source: p.source,
      // Preserve provider-type-specific UI/runtime fields for downstream projection
      ...(p.tierModels !== undefined ? { tierModels: p.tierModels } : {}),
      ...(p.selectedTier !== undefined ? { selectedTier: p.selectedTier } : {}),
      ...(p.language !== undefined ? { language: p.language } : {}),
      ...(p.permissionPolicy !== undefined ? { permissionPolicy: p.permissionPolicy } : {}),
      ...(p.effortLevel !== undefined ? { effortLevel: p.effortLevel } : {}),
      ...(p.website !== undefined ? { website: p.website } : {}),
      ...(p.note !== undefined ? { note: p.note } : {}),
      ...(p.runtimeConfig !== undefined ? { runtimeConfig: p.runtimeConfig } : {}),
    })),
  ];

  return {
    ok: true,
    imported: upsertResult.count,
    skipped,
    backupPath,
    providers: newProviders,
    warnings,
  };
}

module.exports = {
  previewCcSwitchFile,
  previewLocalCliConfig,
  annotateConflicts,
  commitImport,
};
