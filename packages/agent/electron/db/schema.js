'use strict';

/**
 * MindCraft SQLite schema constants.
 *
 * Used by migrations and DAOs to reference table/column names and
 * produce the DDL without duplicating strings across files.
 */

const TABLES = {
  providers: 'providers',
  import_runs: 'import_runs',
};

const VALID_AGENT_TYPES = ['claude', 'codex'];
const VALID_PROVIDER_SOURCES = ['mindcraft', 'cc-switch', 'local-cli'];

const PROJECTION_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed',
};

// v1 schema (9 columns) — used by migrateV1 for fresh DBs and v1→v2 upgrade
const V1_PROVIDER_DDL = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mindcraft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
`;

// Full v2 schema (12 columns) — for reference only; v2 columns are added by migration
const PROVIDER_DDL = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mindcraft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sort_index INTEGER NOT NULL DEFAULT 0,
  projection_status TEXT NOT NULL DEFAULT 'pending',
  last_projected_at INTEGER
)
`;

const IMPORT_RUNS_DDL = `
CREATE TABLE IF NOT EXISTS import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_path TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
)
`;

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_providers_agent_active ON providers(agent_type, is_active)',
  'CREATE INDEX IF NOT EXISTS idx_import_runs_created ON import_runs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_providers_agent_sort ON providers(agent_type, sort_index, updated_at)',
];

const SCHEMA_VERSION = 2;

module.exports = {
  TABLES,
  VALID_AGENT_TYPES,
  VALID_PROVIDER_SOURCES,
  PROJECTION_STATUS,
  V1_PROVIDER_DDL,
  PROVIDER_DDL,
  IMPORT_RUNS_DDL,
  INDEXES,
  SCHEMA_VERSION,
};
