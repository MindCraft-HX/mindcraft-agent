'use strict';

/**
 * CC Switch SQL export parser.
 *
 * Parses `INSERT INTO "providers" (...) VALUES (...)` statements from
 * CC Switch SQLite exports and normalises them into MindCraft provider records.
 *
 * Design:
 * - Does NOT use a real SQLite DB for parsing — text-only parser.
 * - Handles explicit-column INSERT and legacy column-positional INSERT.
 * - Resilient to column reordering, escaping, NULLs, and malformed JSON.
 * - Returns normalised records only; does not write to DB.
 */

// ---------------------------------------------------------------------------
// Value splitter — splits a SQL VALUES tuple while respecting quoting
// ---------------------------------------------------------------------------

/**
 * Split a SQL VALUES (...) content into individual column values.
 *
 * Handles:
 *  - SQLite single-quoted strings with '' escaping.
 *  - NULL literal.
 *  - Integers and floats.
 *  - Nested parentheses inside string literals.
 *  - Commas inside strings are NOT field separators.
 *
 * @param {string} valuesText — content between the outer parentheses of VALUES(...)
 * @returns {string[]}
 */
function splitSqlValues(valuesText) {
  const values = [];
  let current = '';
  let inString = false;
  let depth = 0; // parentheses depth (for edge cases)

  for (let i = 0; i < valuesText.length; i += 1) {
    const ch = valuesText[i];

    if (inString) {
      if (ch === '\'') {
        // Could be escaped quote '' or end of string
        if (i + 1 < valuesText.length && valuesText[i + 1] === '\'') {
          // Preserve raw '' for unescapeSqlValue to handle
          current += '\'\'';
          i += 1; // skip next quote
          continue;
        }
        inString = false;
        current += ch; // include closing quote
        continue;
      }
      current += ch;
      continue;
    }

    // Not in string
    if (ch === '\'') {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '(') { depth += 1; current += ch; continue; }
    if (ch === ')') { depth -= 1; current += ch; continue; }

    if (ch === ',' && depth === 0) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    values.push(current.trim());
  }

  return values;
}

// ---------------------------------------------------------------------------
// Value unescaper
// ---------------------------------------------------------------------------

/**
 * Convert a SQL literal to its JS value.
 *
 *  - `'foo''bar'` -> `foo'bar`
 *  - `NULL` -> null
 *  - `123` -> 123
 *  - `'hello'` -> `hello`
 *
 * @param {string} raw — a single SQL value token
 * @returns {string|number|null}
 */
function unescapeSqlValue(raw) {
  const trimmed = raw.trim();
  if (trimmed === 'NULL' || trimmed === 'null') return null;
  if (trimmed.startsWith('\'') && trimmed.endsWith('\'')) {
    // Remove outer quotes, unescape ''
    const inner = trimmed.slice(1, -1);
    return inner.replace(/''/g, '\'');
  }
  // Try number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  // Fallthrough: return as-is (shouldn't normally happen for well-formed SQL)
  return trimmed;
}

// ---------------------------------------------------------------------------
// INSERT parser
// ---------------------------------------------------------------------------

/**
 * Parse a single INSERT statement and return { table, columns, rawValues }.
 * Returns null if the line is not a valid INSERT.
 *
 * @param {string} line
 * @returns {{ table: string, columns: string[], rawValues: string[] } | null}
 */
function parseInsertLine(line) {
  // Use regex to extract components
  // Groups: 1=table, 3=columns, 4=values
  const match = line.match(
    /INSERT\s+INTO\s+"?(\w+)"?\s*(?:\(((?:[^()]|\((?:[^()]*)\))*)\))?\s*VALUES\s*\(([\s\S]*)\)\s*;?\s*$/i,
  );
  if (!match) return null;

  const table = match[1];
  const columnsRaw = match[2] ? match[2].trim() : '';
  const valuesRaw = match[3];

  // Parse columns if explicit
  const columns = columnsRaw
    ? columnsRaw.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    : [];

  // Split values
  const rawValues = splitSqlValues(valuesRaw);

  return { table, columns, rawValues };
}

// ---------------------------------------------------------------------------
// CC Switch field mapping
// ---------------------------------------------------------------------------

/**
 * Known CC Switch provider columns (current generation).
 * Order here is for legacy positional fallback only.
 */
const LEGACY_COLUMN_ORDER = [
  'id',
  'app_type',
  'name',
  'settings_config',
  'meta',
  'is_current',
];

/**
 * Map raw CC Switch row to a normalised provider record.
 *
 * @param {object} row — { id, app_type, name, settings_config, meta, is_current, ... }
 * @param {string} source — CC Switch export source identifier
 * @returns {object | null} normalised provider, or null if skipped
 */
function mapCcSwitchRow(row, source) {
  const appType = String(row.app_type || '').trim().toLowerCase();

  // Filter: only support known agent types
  const supportedTypes = ['codex', 'claude'];
  if (!supportedTypes.includes(appType)) {
    return { __skipped: true, reason: `unsupported app_type: "${row.app_type}"`, raw: row };
  }

  // Parse settings_config
  let config = {};
  try {
    const raw = row.settings_config;
    if (typeof raw === 'string') {
      config = JSON.parse(raw);
    } else if (raw && typeof raw === 'object') {
      config = raw;
    }
  } catch (_) {
    return { __skipped: true, reason: `invalid settings_config JSON for "${row.name}"`, raw: row };
  }

  // Normalise config fields (handle CC Switch field name variants)
  const apiKey = config.api_key || config.key || '';
  const baseUrl = config.api_base || config.base_url || config.url || '';
  const model = config.model || '';
  const reasoningEffort = config.reasoning_effort || config.reasoningEffort || '';
  const apiFormat = config.api_format || config.apiFormat || '';

  const name = String(row.name || '').trim() || 'Unnamed';
  const isActive = row.is_current === 1 || row.is_current === '1' || row.is_current === true;

  // Preserve unknown CC Switch fields in metadata
  const metadata = {
    source: 'cc-switch',
    ccSwitch: {
      id: row.id || null,
      appType: row.app_type,
      rawMeta: (() => { try { return typeof row.meta === 'string' ? JSON.parse(row.meta) : (row.meta || {}); } catch (_) { return {}; } })(),
      rawSettings: typeof row.settings_config === 'string' ? row.settings_config : JSON.stringify(row.settings_config || {}),
    },
  };

  return {
    agentType: appType,
    name,
    config: {
      key: apiKey,
      url: baseUrl,
      model,
      reasoningEffort,
      apiFormat,
    },
    metadata,
    isActive,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse a CC Switch SQL export string into normalised provider records.
 *
 * @param {string} sqlContent — full SQL export text
 * @param {object} [opts]
 * @param {string} [opts.source] — label for metadata (default: 'cc-switch')
 * @returns {{ providers: Array<object>, warnings: Array<string>, skipped: number }}
 */
function parseCcSwitchExport(sqlContent, { source = 'cc-switch' } = {}) {
  if (typeof sqlContent !== 'string' || !sqlContent.trim()) {
    return { providers: [], warnings: ['Empty input'], skipped: 0 };
  }

  const providers = [];
  const warnings = [];
  let skipped = 0;

  // Split into statements. An INSERT statement may span multiple lines.
  // Accumulate lines until we see the closing `);`.
  const statements = splitSqlStatements(sqlContent);

  for (const stmt of statements) {
    if (!/INSERT\s+INTO\s+"?providers"?/i.test(stmt)) continue;

    const parsed = parseInsertLine(stmt);
    if (!parsed) {
      warnings.push(`Could not parse INSERT: ${stmt.slice(0, 80)}...`);
      continue;
    }

    const { columns, rawValues } = parsed;

    // Build row object
    let row;
    if (columns.length > 0) {
      // Explicit columns: map by name
      row = {};
      for (let i = 0; i < columns.length; i += 1) {
        row[columns[i]] = i < rawValues.length ? unescapeSqlValue(rawValues[i]) : null;
      }
    } else {
      // Legacy positional
      row = {};
      for (let i = 0; i < LEGACY_COLUMN_ORDER.length; i += 1) {
        row[LEGACY_COLUMN_ORDER[i]] = i < rawValues.length ? unescapeSqlValue(rawValues[i]) : null;
      }
    }

    const mapped = mapCcSwitchRow(row, source);
    if (mapped.__skipped) {
      skipped += 1;
      warnings.push(mapped.reason);
    } else {
      providers.push(mapped);
    }
  }

  return { providers, warnings, skipped };
}

/**
 * Split SQL content into individual statements.
 * Handles multi-line INSERT statements by accumulating until `);`.
 *
 * @param {string} sqlContent
 * @returns {string[]}
 */
function splitSqlStatements(sqlContent) {
  const lines = sqlContent.split('\n');
  const statements = [];
  let accumulating = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('--') || line.startsWith('#')) continue;

    // Check if this line starts a new INSERT
    if (/INSERT\s+INTO\s+"?providers"?/i.test(line)) {
      // Save previous accumulation if any
      if (accumulating !== null) {
        statements.push(accumulating);
      }
      accumulating = line;
      // Single-line INSERT: has VALUES and ends with );
      if (/\bVALUES\b/i.test(line) && /\);?\s*$/.test(line)) {
        statements.push(accumulating);
        accumulating = null;
      }
      continue;
    }

    // Continuation of a multi-line INSERT
    if (accumulating !== null) {
      accumulating += ' ' + line;
      if (/\);?\s*$/.test(line)) {
        statements.push(accumulating);
        accumulating = null;
      }
    }
  }

  // Don't lose the last accumulated statement
  if (accumulating !== null) {
    statements.push(accumulating);
  }

  return statements;
}

module.exports = {
  parseCcSwitchExport,
  // Exported for testing
  splitSqlStatements,
  splitSqlValues,
  unescapeSqlValue,
  parseInsertLine,
  mapCcSwitchRow,
};
