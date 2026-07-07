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
  chat_threads: 'chat_threads',
  sessions: 'sessions',
  session_bindings: 'session_bindings',
  session_runtime: 'session_runtime',
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

const CHAT_THREADS_DDL = `
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  model TEXT NOT NULL DEFAULT '',
  thinking_level TEXT NOT NULL DEFAULT 'off',
  web_search_enabled INTEGER NOT NULL DEFAULT 0,
  context_summary TEXT NOT NULL DEFAULT ''
)
`;

// T201: session identity — one row per session (chatKey is the stable identity)
const SESSIONS_DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  chat_key TEXT PRIMARY KEY,
  agent TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  title_source TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
`;

// T201: provider binding — maps provider identifiers (cliSessionId, filePath) to chat_key
const SESSION_BINDINGS_DDL = `
CREATE TABLE IF NOT EXISTS session_bindings (
  chat_key TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  cli_session_id TEXT,
  file_path TEXT,
  source TEXT NOT NULL DEFAULT 'scan',
  detached INTEGER NOT NULL DEFAULT 0,
  resume_allowed INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chat_key, provider_key)
)
`;

// T201: session runtime — model, effort, etc. (updated by provider scan)
const SESSION_RUNTIME_DDL = `
CREATE TABLE IF NOT EXISTS session_runtime (
  chat_key TEXT PRIMARY KEY,
  model TEXT NOT NULL DEFAULT '',
  effort TEXT,
  model_tier TEXT NOT NULL DEFAULT '',
  reasoning_effort TEXT,
  updated_at INTEGER NOT NULL
)
`;

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_providers_agent_active ON providers(agent_type, is_active)',
  'CREATE INDEX IF NOT EXISTS idx_import_runs_created ON import_runs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_providers_agent_sort ON providers(agent_type, sort_index, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at DESC)',
  // T201: session indexes
  'CREATE INDEX IF NOT EXISTS idx_sessions_agent_updated ON sessions(agent, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(agent, project_id)',
  'CREATE INDEX IF NOT EXISTS idx_session_bindings_provider ON session_bindings(provider_key)',
  'CREATE INDEX IF NOT EXISTS idx_session_runtime_model ON session_runtime(model)',
];

const SCHEMA_VERSION = 5;

module.exports = {
  TABLES,
  VALID_AGENT_TYPES,
  VALID_PROVIDER_SOURCES,
  PROJECTION_STATUS,
  V1_PROVIDER_DDL,
  PROVIDER_DDL,
  IMPORT_RUNS_DDL,
  CHAT_THREADS_DDL,
  SESSIONS_DDL,
  SESSION_BINDINGS_DDL,
  SESSION_RUNTIME_DDL,
  INDEXES,
  SCHEMA_VERSION,
};
