'use strict';

/**
 * Provider Repository — single authority for provider CRUD.
 *
 * All provider reads and writes go through SQLite. Legacy projection
 * (back-writing to providers.json / electron-conf) is managed by
 * `projection_status` markers and the `projectToLegacy()` function.
 *
 * Shape conversion:
 * - DAO rows (flat, with config_json/metadata_json parsed) ↔
 * - Legacy payload { providers: [{name, key, url, ...}], activeIdx }
 *
 * Business code should use this repository, not call DAO functions directly.
 */

const providerDao = require('../dao/providers');
const { PROJECTION_STATUS } = require('../schema');

// ---------------------------------------------------------------------------
// Shape conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a DAO provider row to the legacy provider object shape.
 * CodeX and Claude have different legacy shapes.
 */
function daoToLegacyProvider(row) {
  const base = {
    id: row.id,
    name: row.name,
    key: row.config?.key || '',
    url: row.config?.url || '',
  };

  if (row.agentType === 'codex') {
    return {
      ...base,
      model: row.config?.model || '',
      reasoningEffort: row.config?.reasoningEffort || '',
      apiFormat: row.config?.apiFormat || 'responses',
      authJson: row.config?.authJson || { OPENAI_API_KEY: row.config?.key || '' },
      tomlText: row.config?.tomlText || '',
      alternativeModels: Array.isArray(row.config?.alternativeModels)
        ? row.config.alternativeModels
        : [],
    };
  }

  // Claude
  return {
    ...base,
    config: row.config || { env: {} },
    website: row.config?.website || '',
    note: row.config?.note || '',
    language: row.config?.language || 'zh-CN',
    permissionPolicy: row.config?.permissionPolicy || 'ask',
    effortLevel: row.config?.effortLevel !== undefined ? row.config.effortLevel : 'medium',
    tierModels: row.metadata?.tierModels || { haiku: '', sonnet: '', opus: '', reasoning: '' },
    selectedTier: row.metadata?.selectedTier || row.config?.model || 'sonnet',
  };
}

/**
 * Convert a legacy provider object to a DAO-compatible object.
 */
function legacyToDaoProvider(legacyProvider, agentType) {
  if (agentType === 'codex') {
    return {
      name: legacyProvider.name,
      config: {
        key: legacyProvider.key || '',
        url: legacyProvider.url || '',
        model: legacyProvider.model || '',
        reasoningEffort: legacyProvider.reasoningEffort || '',
        apiFormat: legacyProvider.apiFormat || 'responses',
        authJson: legacyProvider.authJson || {},
        tomlText: legacyProvider.tomlText || '',
        alternativeModels: Array.isArray(legacyProvider.alternativeModels)
          ? legacyProvider.alternativeModels
          : [],
      },
      metadata: {},
    };
  }

  // Claude
  return {
    name: legacyProvider.name,
    config: {
      ...(legacyProvider.config || {}),
      key: legacyProvider.key || legacyProvider.config?.key || '',
      url: legacyProvider.url || legacyProvider.config?.url || '',
      website: legacyProvider.website || '',
      note: legacyProvider.note || '',
      language: legacyProvider.language || 'zh-CN',
      permissionPolicy: legacyProvider.permissionPolicy || 'ask',
      effortLevel: legacyProvider.effortLevel !== undefined ? legacyProvider.effortLevel : 'medium',
    },
    metadata: {
      tierModels: legacyProvider.tierModels || { haiku: '', sonnet: '', opus: '', reasoning: '' },
      selectedTier: legacyProvider.selectedTier || 'sonnet',
    },
  };
}

/**
 * Convert a list of DAO rows to the legacy payload shape.
 */
function daoListToLegacyPayload(daoRows) {
  if (!daoRows || daoRows.length === 0) {
    return { providers: [], activeIdx: -1 };
  }

  const providers = daoRows.map(daoToLegacyProvider);
  const activeIdx = providers.findIndex((p, i) => daoRows[i].isActive);

  return { providers, activeIdx: activeIdx >= 0 ? activeIdx : -1 };
}

// ---------------------------------------------------------------------------
// Repository API
// ---------------------------------------------------------------------------

/**
 * Get providers for an agent type, returned in legacy payload shape.
 *
 * If the DB is empty and `legacyReader` is provided, a one-shot backfill
 * from the legacy store is performed automatically so callers never see
 * an empty result when legacy data exists.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType — 'codex' | 'claude'
 * @param {() => object|null} [legacyReader] — reads legacy store, returns payload or null
 * @returns {{ providers: Array<object>, activeIdx: number }}
 */
function getProviders(db, agentType, legacyReader) {
  const rows = providerDao.listProviders(db, agentType);

  if (rows.length === 0 && typeof legacyReader === 'function') {
    const migResult = migrateFromLegacy(db, agentType, legacyReader);
    if (migResult.ok && migResult.migrated > 0) {
      const backfilled = providerDao.listProviders(db, agentType);
      return daoListToLegacyPayload(backfilled);
    }
  }

  return daoListToLegacyPayload(rows);
}

/**
 * Bulk save providers. Writes to SQLite (authority) and marks all
 * affected rows as `projection_status = 'pending'` so the projection
 * layer can sync to legacy storage.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {{ providers: Array<object>, activeIdx: number }} payload
 * @returns {{ ok: boolean, count: number, ids: string[] }}
 */
function setProviders(db, agentType, { providers = [], activeIdx = 0 }) {
  if (!Array.isArray(providers) || providers.length === 0) {
    // Empty list → clear all providers for this agent type
    const existing = providerDao.listProviders(db, agentType);
    let deleted = 0;
    for (const p of existing) {
      const r = providerDao.deleteProvider(db, p.id);
      if (r.ok) deleted++;
    }
    return { ok: true, count: 0, ids: [], deleted };
  }

  // Resolve missing IDs by matching existing providers by name.
  // This prevents renderer fallback defaults (which lack an `id` field)
  // from being treated as new providers that trigger deletion of all
  // existing migrated/configured providers.
  const existingByName = new Map();
  for (const ep of providerDao.listProviders(db, agentType)) {
    const nameKey = (ep.name || '').toLowerCase();
    if (nameKey && !existingByName.has(nameKey)) {
      existingByName.set(nameKey, ep);
    }
  }

  const daoProviders = providers.map((p) => {
    const dao = legacyToDaoProvider(p, agentType);
    let resolvedId = p.id || undefined;

    // If the incoming provider has no id, try to match an existing
    // provider by name so we UPDATE rather than INSERT+DELETE.
    if (!resolvedId) {
      const nameKey = (p.name || dao.name || '').toLowerCase();
      const match = nameKey ? existingByName.get(nameKey) : undefined;
      if (match) {
        resolvedId = match.id;
      }
    }

    return {
      ...dao,
      id: resolvedId,
      agentType,
      isActive: false,
      projectionStatus: PROJECTION_STATUS.PENDING,
    };
  });

  const result = providerDao.upsertProviders(db, daoProviders, { source: 'mindcraft' });

  // Delete DB providers not present in the incoming list (full replacement)
  const incomingIds = new Set(result.ids.filter(Boolean));
  const existing = providerDao.listProviders(db, agentType);
  let deleted = 0;
  for (const p of existing) {
    if (!incomingIds.has(p.id)) {
      const r = providerDao.deleteProvider(db, p.id);
      if (r.ok) deleted++;
    }
  }

  if (result.ok && activeIdx >= 0 && activeIdx < providers.length) {
    providerDao.setActiveProvider(db, agentType, result.ids[activeIdx]);
  }

  return { ...result, deleted };
}

/**
 * Set the active provider.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {string} providerId
 * @returns {{ ok: boolean }}
 */
function setActiveProvider(db, agentType, providerId) {
  return providerDao.setActiveProvider(db, agentType, providerId);
}

/**
 * Delete a provider.
 *
 * @param {import('sql.js').Database} db
 * @param {string} id
 * @returns {{ ok: boolean }}
 */
function deleteProvider(db, id) {
  return providerDao.deleteProvider(db, id);
}

/**
 * Reorder providers by ID sequence. The orderedIds array determines
 * the new sort_index order. Marks reordered rows as pending projection.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {string[]} orderedIds
 * @returns {{ ok: boolean, count: number }}
 */
function reorderProviders(db, agentType, orderedIds) {
  return providerDao.reorderProviders(db, agentType, orderedIds);
}

// ---------------------------------------------------------------------------
// Legacy backfill and projection
// ---------------------------------------------------------------------------

/**
 * One-shot migration: backfill SQLite from legacy storage when DB is empty.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {() => object|null} legacyReadFn — reads legacy store, returns payload or null
 * @returns {{ ok: boolean, migrated: number, message: string }}
 */
function migrateFromLegacy(db, agentType, legacyReadFn) {
  try {
    // Check if DB already has providers for this agent type
    const existing = providerDao.listProviders(db, agentType);
    if (existing.length > 0) {
      return { ok: true, migrated: 0, message: 'DB already has providers, skipping migration' };
    }

    const legacyData = legacyReadFn();
    if (!legacyData || !legacyData.providers || legacyData.providers.length === 0) {
      return { ok: true, migrated: 0, message: 'No legacy providers to migrate' };
    }

    const daoProviders = legacyData.providers.map((p, idx) => ({
      ...legacyToDaoProvider(p, agentType),
      agentType,
      isActive: idx === (legacyData.activeIdx ?? 0),
      source: 'mindcraft',
      sortIndex: idx,
      projectionStatus: PROJECTION_STATUS.SYNCED,
    }));

    const result = providerDao.upsertProviders(db, daoProviders, { source: 'mindcraft' });

    return {
      ok: result.ok,
      migrated: result.count,
      message: result.ok
        ? `Migrated ${result.count} providers from legacy storage`
        : `Migration failed: ${result.error}`,
    };
  } catch (e) {
    console.error('[providerStorage] migrateFromLegacy error:', e.message);
    return { ok: false, migrated: 0, message: `Migration error: ${e.message}` };
  }
}

/**
 * Project pending providers to legacy storage.
 *
 * Reads providers with `projection_status = 'pending'` (or 'failed' for retry),
 * calls legacyWriteFn with the full legacy payload, and marks them as 'synced'
 * on success or 'failed' on error.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {(payload: { providers: Array<object>, activeIdx: number }) => void} legacyWriteFn
 * @param {{ retryFailed?: boolean }} opts
 * @returns {{ ok: boolean, synced: number, failed: number, errors: string[] }}
 */
function projectToLegacy(db, agentType, legacyWriteFn, { retryFailed = true } = {}) {
  const result = { ok: false, synced: 0, failed: 0, errors: [] };

  // Collect pending providers
  const pending = providerDao.listProvidersByStatus(db, agentType, PROJECTION_STATUS.PENDING);

  // Optionally retry previously failed projections
  const failed = retryFailed
    ? providerDao.listProvidersByStatus(db, agentType, PROJECTION_STATUS.FAILED)
    : [];

  const toProject = [...pending, ...failed];
  if (toProject.length === 0) {
    result.ok = true;
    return result;
  }

  // Build full legacy payload from ALL providers (not just pending ones)
  const allRows = providerDao.listProviders(db, agentType);
  const legacyPayload = daoListToLegacyPayload(allRows);

  try {
    legacyWriteFn(legacyPayload);

    // Mark all projected as synced
    for (const p of toProject) {
      const statusResult = providerDao.setProjectionStatus(db, p.id, PROJECTION_STATUS.SYNCED);
      if (statusResult.ok) {
        result.synced++;
      } else {
        result.failed++;
        result.errors.push(statusResult.error);
      }
    }
    result.ok = result.failed === 0;
  } catch (e) {
    // Write failed — mark all as failed
    for (const p of toProject) {
      providerDao.setProjectionStatus(db, p.id, PROJECTION_STATUS.FAILED);
    }
    result.failed = toProject.length;
    result.errors.push(e.message);
    result.ok = false;
  }

  return result;
}

module.exports = {
  getProviders,
  setProviders,
  setActiveProvider,
  deleteProvider,
  reorderProviders,
  migrateFromLegacy,
  projectToLegacy,
  // Exported for tests
  daoToLegacyProvider,
  legacyToDaoProvider,
  daoListToLegacyPayload,
};
