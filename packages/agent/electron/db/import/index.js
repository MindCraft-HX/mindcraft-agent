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
    // config.toml has model, auth_token, base_url, etc.
    const key = cliConfig.auth_token || cliConfig.experimental_bearer_token || '';
    const url = cliConfig.base_url || '';
    const model = cliConfig.model || '';
    const reasoningEffort = cliConfig.model_reasoning_effort || cliConfig.reasoning_effort || '';
    const apiFormat = cliConfig.api_format || '';

    if (!key && !url && !model) {
      return { ok: false, providers: [], warnings: ['No config values found in local config.toml'] };
    }

    return {
      ok: true,
      providers: [{
        tempId: 'local-0',
        agentType: 'codex',
        name: 'Local CLI Config',
        config: { key, url, model, reasoningEffort, apiFormat },
        metadata: { source: 'local-cli' },
        isActive: false,
      }],
      warnings: [],
    };
  }

  if (agentType === 'claude') {
    // settings.json
    const key = cliConfig.ANTHROPIC_AUTH_TOKEN || cliConfig.anthropicAuthToken || '';
    const url = cliConfig.ANTHROPIC_BASE_URL || cliConfig.anthropicBaseUrl || '';

    if (!key) {
      return { ok: false, providers: [], warnings: ['No ANTHROPIC_AUTH_TOKEN found in settings.json'] };
    }

    return {
      ok: true,
      providers: [{
        tempId: 'local-0',
        agentType: 'claude',
        name: 'Local CLI Config',
        config: { key, url, model: '', reasoningEffort: '', apiFormat: '' },
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
  for (const ep of (existingProviders || [])) {
    const key = (ep.name || '').toLowerCase();
    if (key && !existingNameMap.has(key)) {
      existingNameMap.set(key, ep.id);
    }
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

    toUpsert.push({
      id: providerId,
      agentType: preview.agentType || agentType,
      name: resolvedName,
      config: preview.config || {},
      metadata: preview.metadata || {},
      isActive: preview.isActive === true,
      source,
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
