'use strict';

/**
 * Provider DAO — CRUD operations on the providers table.
 *
 * - Stores JSON as strings at the DB boundary; parse/stringify only here.
 * - Active-provider updates are transactional (only one active per agent_type).
 * - Pure-ish: functions accept an explicit db instance so tests don't depend on the real app profile.
 */

const { VALID_AGENT_TYPES, VALID_PROVIDER_SOURCES } = require('../schema');
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
      'SELECT id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at FROM providers WHERE agent_type = ? ORDER BY updated_at DESC',
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
      'SELECT id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at FROM providers WHERE id = ?',
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
    `INSERT INTO providers (id, agent_type, name, config_json, metadata_json, is_active, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       agent_type = excluded.agent_type,
       name = excluded.name,
       config_json = excluded.config_json,
       metadata_json = excluded.metadata_json,
       is_active = excluded.is_active,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  );

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

      stmt.bind([id, agentType, name, configJson, metadataJson, isActive, providerSource, now, now]);
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

module.exports = {
  listProviders,
  getProvider,
  upsertProviders,
  setActiveProvider,
  deleteProvider,
};
