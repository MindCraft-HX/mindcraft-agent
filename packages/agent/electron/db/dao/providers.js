'use strict';

/**
 * Provider DAO — CRUD operations on the providers table.
 *
 * - Stores JSON as strings at the DB boundary; parse/stringify only here.
 * - Active-provider updates are transactional (only one active per agent_type).
 * - Pure-ish: functions accept an explicit db instance so tests don't depend on the real app profile.
 */

const { VALID_AGENT_TYPES, VALID_PROVIDER_SOURCES, PROJECTION_STATUS } = require('../schema');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp() {
  return Math.floor(Date.now() / 1000);
}

function validateAgentType(agentType) {
  if (!VALID_AGENT_TYPES.includes(agentType)) {
    throw new Error(`Invalid agent_type: "${agentType}". Must be one of: ${VALID_AGENT_TYPES.join(', ')}`);
  }
}

function parseProviderRow(row) {
  if (!row) return null;
  return {
    id: row[0],
    agentType: row[1],
    name: row[2],
    config: safeJsonParse(row[3]),
    metadata: safeJsonParse(row[4]),
    isActive: row[5] === 1,
    source: row[6],
    createdAt: row[7],
    updatedAt: row[8],
    sortIndex: typeof row[9] === 'number' ? row[9] : 0,
    projectionStatus: row[10] || PROJECTION_STATUS.PENDING,
    lastProjectedAt: row[11] || null,
  };
}

function safeJsonParse(str) {
  try { return JSON.parse(str || '{}'); } catch (_) { return {}; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all providers for a given agent type, newest first.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType — 'claude' | 'codex'
 * @returns {Array<object>}
 */
function listProviders(db, agentType) {
  validateAgentType(agentType);
  try {
    const result = db.exec(
      'SELECT id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at, sort_index, projection_status, last_projected_at FROM providers WHERE agent_type = ? ORDER BY sort_index ASC, updated_at DESC',
      [agentType],
    );
    if (!result || result.length === 0) return [];
    return result[0].values.map(parseProviderRow);
  } catch (e) {
    console.error('[providers DAO] listProviders error:', e.message);
    return [];
  }
}

/**
 * Get a single provider by ID.
 *
 * @param {import('sql.js').Database} db
 * @param {string} id
 * @returns {object|null}
 */
function getProvider(db, id) {
  try {
    const result = db.exec(
      'SELECT id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at, sort_index, projection_status, last_projected_at FROM providers WHERE id = ?',
      [id],
    );
    if (!result || result.length === 0 || result[0].values.length === 0) return null;
    return parseProviderRow(result[0].values[0]);
  } catch (e) {
    console.error('[providers DAO] getProvider error:', e.message);
    return null;
  }
}

/**
 * Bulk upsert providers.
 *
 * Each provider object should have:
 *   { id?, agentType, name, config: {...}, metadata?: {...}, isActive?: boolean, source?: string }
 *
 * If `id` is missing, a UUID is generated.
 *
 * @param {import('sql.js').Database} db
 * @param {Array<object>} providers
 * @param {object} opts
 * @param {string} opts.source — default source if provider.source is not set
 * @returns {{ ok: boolean, count: number, ids: string[] }}
 */
function upsertProviders(db, providers, { source = 'mindcraft' } = {}) {
  if (!Array.isArray(providers) || providers.length === 0) {
    return { ok: true, count: 0, ids: [] };
  }

  const ids = [];
  const now = timestamp();

  const stmt = db.prepare(
    `INSERT INTO providers (id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at, sort_index, projection_status, last_projected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       agent_type = excluded.agent_type,
       name = excluded.name,
       config_json = excluded.config_json,
       metadata_json = excluded.metadata_json,
       is_active = excluded.is_active,
       source = excluded.source,
       updated_at = excluded.updated_at,
       sort_index = excluded.sort_index,
       projection_status = excluded.projection_status,
       last_projected_at = excluded.last_projected_at`,
  );

  // Determine max sort_index for auto-assignment
  let maxSortIndex = -1;
  try {
    const maxResult = db.exec('SELECT COALESCE(MAX(sort_index), -1) FROM providers');
    if (maxResult && maxResult.length > 0 && maxResult[0].values && maxResult[0].values.length > 0) {
      maxSortIndex = maxResult[0].values[0][0];
    }
  } catch (_) { /* ignore */ }

  try {
    db.run('BEGIN');
    for (const p of providers) {
      const agentType = p.agentType || p.agent_type || '';
      validateAgentType(agentType);

      const id = p.id || uuidv4();
      ids.push(id);
      const name = String(p.name || '').trim();
      const configJson = JSON.stringify(p.config || {});
      const metadataJson = JSON.stringify(p.metadata || {});
      const isActive = p.isActive === true || p.is_active === 1 ? 1 : 0;
      const providerSource = VALID_PROVIDER_SOURCES.includes(p.source)
        ? p.source
        : (VALID_PROVIDER_SOURCES.includes(source) ? source : 'mindcraft');

      // Auto-assign sort_index for new providers (append to end)
      const sortIndex = typeof p.sortIndex === 'number'
        ? p.sortIndex
        : (typeof p.sort_index === 'number' ? p.sort_index : ++maxSortIndex);
      const projectionStatus = p.projectionStatus || p.projection_status || PROJECTION_STATUS.PENDING;
      const lastProjectedAt = p.lastProjectedAt || p.last_projected_at || null;

      stmt.bind([id, agentType, name, configJson, metadataJson, isActive, providerSource, now, now, sortIndex, projectionStatus, lastProjectedAt]);
      stmt.step();
      stmt.reset();
    }
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    console.error('[providers DAO] upsertProviders error:', e.message);
    return { ok: false, count: 0, ids, error: e.message };
  } finally {
    stmt.free();
  }

  return { ok: true, count: ids.length, ids };
}

/**
 * Set the active provider for an agent type.
 * Deactivates all other providers of the same agent_type first (transactional).
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType — 'claude' | 'codex'
 * @param {string} providerId
 * @returns {{ ok: boolean }}
 */
function setActiveProvider(db, agentType, providerId) {
  validateAgentType(agentType);
  try {
    db.run('BEGIN');
    db.run('UPDATE providers SET is_active = 0 WHERE agent_type = ?', [agentType]);
    db.run('UPDATE providers SET is_active = 1, updated_at = ? WHERE id = ?', [timestamp(), providerId]);
    db.run('COMMIT');
    return { ok: true };
  } catch (e) {
    db.run('ROLLBACK');
    console.error('[providers DAO] setActiveProvider error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Delete a provider by ID. Does not cascade or affect other tables.
 *
 * @param {import('sql.js').Database} db
 * @param {string} id
 * @returns {{ ok: boolean }}
 */
function deleteProvider(db, id) {
  try {
    db.run('DELETE FROM providers WHERE id = ?', [id]);
    return { ok: true };
  } catch (e) {
    console.error('[providers DAO] deleteProvider error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Reorder providers for an agent type by assigning sort_index values
 * based on the orderedIds array. Sets projection_status to 'pending'
 * on all reordered rows so the projection layer knows to sync.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {string[]} orderedIds
 * @returns {{ ok: boolean, count: number }}
 */
function reorderProviders(db, agentType, orderedIds) {
  validateAgentType(agentType);
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: true, count: 0 };
  }

  const now = timestamp();
  try {
    db.run('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      db.run(
        'UPDATE providers SET sort_index = ?, projection_status = ?, updated_at = ? WHERE id = ? AND agent_type = ?',
        [i, PROJECTION_STATUS.PENDING, now, orderedIds[i], agentType],
      );
    }
    db.run('COMMIT');
    return { ok: true, count: orderedIds.length };
  } catch (e) {
    db.run('ROLLBACK');
    console.error('[providers DAO] reorderProviders error:', e.message);
    return { ok: false, count: 0, error: e.message };
  }
}

/**
 * Update the projection status and timestamp for a provider.
 *
 * @param {import('sql.js').Database} db
 * @param {string} providerId
 * @param {string} status — one of PROJECTION_STATUS values
 * @returns {{ ok: boolean }}
 */
function setProjectionStatus(db, providerId, status) {
  if (!Object.values(PROJECTION_STATUS).includes(status)) {
    return { ok: false, error: `Invalid projection status: "${status}"` };
  }

  const now = timestamp();
  try {
    db.run(
      'UPDATE providers SET projection_status = ?, last_projected_at = ?, updated_at = ? WHERE id = ?',
      [status, status === PROJECTION_STATUS.SYNCED ? now : null, now, providerId],
    );
    return { ok: true };
  } catch (e) {
    console.error('[providers DAO] setProjectionStatus error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * List providers filtered by projection status.
 *
 * @param {import('sql.js').Database} db
 * @param {string} agentType
 * @param {string} status — one of PROJECTION_STATUS values
 * @returns {Array<object>}
 */
function listProvidersByStatus(db, agentType, status) {
  validateAgentType(agentType);
  try {
    const result = db.exec(
      'SELECT id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at, sort_index, projection_status, last_projected_at FROM providers WHERE agent_type = ? AND projection_status = ? ORDER BY sort_index ASC',
      [agentType, status],
    );
    if (!result || result.length === 0) return [];
    return result[0].values.map(parseProviderRow);
  } catch (e) {
    console.error('[providers DAO] listProvidersByStatus error:', e.message);
    return [];
  }
}

module.exports = {
  listProviders,
  getProvider,
  upsertProviders,
  setActiveProvider,
  deleteProvider,
  reorderProviders,
  setProjectionStatus,
  listProvidersByStatus,
};
