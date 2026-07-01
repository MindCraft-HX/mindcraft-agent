'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const {
  buildProviderSqlExport,
  buildClaudeProviderInsert,
  buildCodexProviderInsert,
  buildCodexToml,
  buildClaudeSettingsConfig,
  escapeSqlLiteral,
} = require('./ccSwitch');

const { parseCcSwitchExport } = require('../import/ccSwitch');

// ---------------------------------------------------------------------------
// SQL escape
// ---------------------------------------------------------------------------

describe('escapeSqlLiteral', () => {
  it('handles plain strings', () => {
    assert.strictEqual(escapeSqlLiteral('hello'), "'hello'");
  });

  it('escapes single quotes', () => {
    assert.strictEqual(escapeSqlLiteral("it's"), "'it''s'");
  });

  it('handles Chinese characters', () => {
    assert.strictEqual(escapeSqlLiteral('我的供应商 ①②③'), "'我的供应商 ①②③'");
  });

  it('handles backslashes', () => {
    // SQLite does not use backslash escaping in string literals.
    // Backslashes are stored as-is inside single-quoted strings.
    assert.strictEqual(escapeSqlLiteral('a\\b'), "'a\\b'");
  });

  it('handles newlines', () => {
    const result = escapeSqlLiteral('line1\nline2');
    assert.match(result, /line1\s*line2/);
  });
});

// ---------------------------------------------------------------------------
// Claude settings_config rebuild
// ---------------------------------------------------------------------------

describe('buildClaudeSettingsConfig', () => {
  it('rebuilds from UI fields when config is null', () => {
    const provider = {
      name: 'Test',
      key: 'sk-test',
      url: 'https://api.test.com',
      selectedTier: 'sonnet',
      language: 'zh-CN',
      permissionPolicy: 'ask',
      effortLevel: 'medium',
      tierModels: {
        sonnet: 'claude-sonnet-4-5',
        opus: 'claude-opus-4-5',
        haiku: 'claude-haiku-4-5',
        reasoning: '',
      },
      config: null,
    };
    const cfg = buildClaudeSettingsConfig(provider, { includeSecrets: true });
    assert.strictEqual(cfg.env.ANTHROPIC_AUTH_TOKEN, 'sk-test');
    assert.strictEqual(cfg.env.ANTHROPIC_BASE_URL, 'https://api.test.com');
    assert.strictEqual(cfg.env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-sonnet-4-5');
    assert.strictEqual(cfg.env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-4-5');
    assert.strictEqual(cfg.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-4-5');
    assert.strictEqual(cfg.model, 'sonnet');
    assert.strictEqual(cfg.language, 'zh-CN');
    assert.strictEqual(cfg.permissionPolicy, 'ask');
    assert.strictEqual(cfg.effortLevel, 'medium');
  });

  it('preserves existing config and overlays UI fields', () => {
    const provider = {
      name: 'Test',
      key: 'sk-new',
      url: 'https://new.example.com',
      selectedTier: 'opus',
      language: 'en',
      config: {
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-old',
          ANTHROPIC_BASE_URL: 'https://old.example.com',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'old-sonnet',
          ANTHROPIC_CUSTOM_KEY: 'custom-value',
        },
        model: 'sonnet',
        language: 'zh-CN',
        permissionPolicy: 'always',
      },
      tierModels: {},
    };
    const cfg = buildClaudeSettingsConfig(provider, { includeSecrets: true });
    // Overlayed
    assert.strictEqual(cfg.env.ANTHROPIC_AUTH_TOKEN, 'sk-new');
    assert.strictEqual(cfg.env.ANTHROPIC_BASE_URL, 'https://new.example.com');
    // Preserved custom key
    assert.strictEqual(cfg.env.ANTHROPIC_CUSTOM_KEY, 'custom-value');
    // Overlayed top-level
    assert.strictEqual(cfg.model, 'opus');
    assert.strictEqual(cfg.language, 'en');
  });

  it('detects ANTHROPIC_API_KEY variant', () => {
    const provider = {
      name: 'Test',
      key: 'sk-test',
      config: {
        env: {
          ANTHROPIC_API_KEY: 'sk-old',
          ANTHROPIC_BASE_URL: 'https://api.example.com',
        },
      },
    };
    const cfg = buildClaudeSettingsConfig(provider, { includeSecrets: true });
    // Should preserve ANTHROPIC_API_KEY, not add ANTHROPIC_AUTH_TOKEN
    assert.strictEqual(cfg.env.ANTHROPIC_API_KEY, 'sk-test');
    assert.strictEqual(cfg.env.ANTHROPIC_AUTH_TOKEN, undefined);
  });

  it('redacts secrets', () => {
    const provider = {
      key: 'sk-secret',
      config: null,
    };
    const cfg = buildClaudeSettingsConfig(provider, { includeSecrets: false });
    assert.strictEqual(cfg.env.ANTHROPIC_AUTH_TOKEN, '');
  });
});

// ---------------------------------------------------------------------------
// CodeX TOML generation
// ---------------------------------------------------------------------------

describe('buildCodexToml', () => {
  it('generates TOML for chat format', () => {
    const toml = buildCodexToml({
      name: 'DeepSeek',
      url: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      reasoningEffort: 'medium',
      apiFormat: 'chat',
    });
    assert.match(toml, /model_provider = "custom"/);
    assert.match(toml, /model = "deepseek-chat"/);
    assert.match(toml, /model_reasoning_effort = "medium"/);
    assert.match(toml, /wire_api = "chat"/);
    assert.match(toml, /base_url = "https:\/\/api.deepseek.com\/v1"/);
    assert.match(toml, /requires_openai_auth = true/);
  });

  it('generates TOML for responses format', () => {
    const toml = buildCodexToml({
      name: 'OpenAI',
      url: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      reasoningEffort: '',
      apiFormat: 'responses',
    });
    assert.match(toml, /wire_api = "responses"/);
    // Should NOT have reasoning_effort line when empty
    assert.ok(!toml.includes('model_reasoning_effort'));
  });

  it('defaults apiFormat to responses', () => {
    const toml = buildCodexToml({
      name: 'Test',
      url: 'https://test.com',
      model: 'test-model',
      reasoningEffort: '',
      apiFormat: '',
    });
    assert.match(toml, /wire_api = "responses"/);
  });

  it('escapes special chars in TOML values', () => {
    const toml = buildCodexToml({
      name: 'Test "Provider"',
      url: 'https://test.com\\api',
      model: 'test-model',
      reasoningEffort: 'high',
      apiFormat: 'chat',
    });
    assert.match(toml, /name = "Test \\"Provider\\""/);
    assert.match(toml, /base_url = "https:\/\/test.com\\\\api"/);
  });
});

// ---------------------------------------------------------------------------
// Full SQL export
// ---------------------------------------------------------------------------

describe('buildProviderSqlExport', () => {
  it('exports Claude providers', () => {
    const sql = buildProviderSqlExport({
      claudeProviders: [{
        name: 'My Claude',
        key: 'sk-claude',
        url: 'https://api.anthropic.com',
        selectedTier: 'sonnet',
        language: 'zh-CN',
        config: null,
        tierModels: {},
      }],
    });
    assert.match(sql, /-- MindCraft Provider SQL Export/);
    assert.match(sql, /PRAGMA foreign_keys=OFF/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "providers"/);
    assert.match(sql, /INSERT INTO "providers"/);
    assert.match(sql, /'claude'/);
    assert.match(sql, /'My Claude'/);
    assert.match(sql, /COMMIT/);
  });

  it('exports CodeX providers', () => {
    const sql = buildProviderSqlExport({
      codexProviders: [{
        name: 'My CodeX',
        key: 'sk-codex',
        url: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        reasoningEffort: 'high',
        apiFormat: 'responses',
      }],
    });
    assert.match(sql, /'codex'/);
    assert.match(sql, /'My CodeX'/);
    assert.match(sql, /OPENAI_API_KEY/);
    assert.match(sql, /wire_api/);
  });

  it('exports mixed Claude + CodeX', () => {
    const sql = buildProviderSqlExport({
      claudeProviders: [{ name: 'Claude-1', key: 'sk-a', config: null, selectedTier: 'sonnet', tierModels: {} }],
      codexProviders: [{ name: 'CodeX-1', key: 'sk-b', model: 'gpt-4o', apiFormat: 'chat' }],
    });
    // Count INSERTs
    const inserts = (sql.match(/INSERT INTO "providers"/g) || []).length;
    assert.strictEqual(inserts, 2);
  });

  it('redacts secrets when includeSecrets is false', () => {
    const sql = buildProviderSqlExport({
      includeSecrets: false,
      claudeProviders: [{ name: 'C', key: 'sk-secret', config: null, selectedTier: 'sonnet', tierModels: {} }],
      codexProviders: [{ name: 'X', key: 'sk-secret2', model: 'gpt-4o', apiFormat: 'chat' }],
    });
    // Should NOT contain the secret keys
    assert.ok(!sql.includes('sk-secret'));
    assert.ok(!sql.includes('sk-secret2'));
  });

  it('exports is_current when includeActive is true', () => {
    const sql = buildProviderSqlExport({
      includeActive: true,
      claudeProviders: [{ name: 'C', key: 'sk-a', config: null, selectedTier: 'sonnet', tierModels: {} }],
      claudeActiveIdx: 0,
    });
    // Check the INSERT line specifically (not the CREATE TABLE)
    const insertLine = sql.split('\n').find((l) => l.startsWith('INSERT INTO'));
    assert.ok(insertLine.includes(', 1,'));
  });

  it('exports is_current=0 when includeActive is false', () => {
    const sql = buildProviderSqlExport({
      includeActive: false,
      claudeProviders: [{ name: 'C', key: 'sk-a', config: null, selectedTier: 'sonnet', tierModels: {} }],
      claudeActiveIdx: 0,
    });
    const insertLine = sql.split('\n').find((l) => l.startsWith('INSERT INTO'));
    assert.ok(insertLine.includes(', 0,'));
  });

  it('handles empty providers gracefully', () => {
    const sql = buildProviderSqlExport({});
    const inserts = (sql.match(/INSERT INTO "providers"/g) || []).length;
    assert.strictEqual(inserts, 0);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: export → parse → verify
// ---------------------------------------------------------------------------

describe('roundtrip', () => {
  it('Claude: export → re-import produces correct fields', () => {
    const original = {
      name: 'Roundtrip Claude',
      key: 'sk-roundtrip',
      url: 'https://api.roundtrip.com',
      website: 'https://console.roundtrip.com',
      note: 'Test note',
      selectedTier: 'opus',
      language: 'en',
      permissionPolicy: 'always',
      effortLevel: 'high',
      tierModels: {
        sonnet: 'sonnet-model',
        opus: 'opus-model',
        haiku: 'haiku-model',
        reasoning: '',
      },
      config: null,
    };

    const sql = buildProviderSqlExport({
      claudeProviders: [original],
    });

    // Parse back
    const result = parseCcSwitchExport(sql, { source: 'cc-switch' });
    assert.ok(result.providers, 'parseCcSwitchExport should return providers');
    assert.strictEqual(result.providers.length, 1);

    const parsed = result.providers[0];
    assert.strictEqual(parsed.agentType, 'claude');
    assert.strictEqual(parsed.name, 'Roundtrip Claude');
    // Key/url are in config sub-object
    assert.strictEqual(parsed.config.key, 'sk-roundtrip');
    assert.strictEqual(parsed.config.url, 'https://api.roundtrip.com');
    // Claude-specific top-level fields
    assert.strictEqual(parsed.website, 'https://console.roundtrip.com');
    assert.strictEqual(parsed.note, 'Test note');
    assert.strictEqual(parsed.selectedTier, 'opus');
    assert.strictEqual(parsed.language, 'en');
    assert.strictEqual(parsed.permissionPolicy, 'always');
    assert.strictEqual(parsed.effortLevel, 'high');
    // Tier models should be roundtripped
    assert.strictEqual(parsed.tierModels.opus, 'opus-model');
  });

  it('Claude: roundtrip preserves secrets in config', () => {
    const original = {
      name: 'Secret Claude',
      key: 'sk-secret-123',
      url: 'https://api.example.com',
      selectedTier: 'sonnet',
      config: null,
      tierModels: {},
    };

    const sql = buildProviderSqlExport({ claudeProviders: [original] });
    const result = parseCcSwitchExport(sql, { source: 'cc-switch' });
    const parsed = result.providers[0];
    assert.strictEqual(parsed.config.key, 'sk-secret-123');
  });

  it('CodeX: export → re-import produces correct fields', () => {
    const original = {
      name: 'Roundtrip CodeX',
      key: 'sk-codex-rt',
      url: 'https://api.codexrt.com/v1',
      model: 'rt-model',
      reasoningEffort: 'low',
      apiFormat: 'chat',
    };

    const sql = buildProviderSqlExport({ codexProviders: [original] });
    const result = parseCcSwitchExport(sql, { source: 'cc-switch' });
    assert.strictEqual(result.providers.length, 1);

    const parsed = result.providers[0];
    assert.strictEqual(parsed.agentType, 'codex');
    assert.strictEqual(parsed.name, 'Roundtrip CodeX');
    // CodeX fields are in config sub-object
    assert.strictEqual(parsed.config.key, 'sk-codex-rt');
    assert.strictEqual(parsed.config.url, 'https://api.codexrt.com/v1');
    assert.strictEqual(parsed.config.model, 'rt-model');
    assert.strictEqual(parsed.config.reasoningEffort, 'low');
    assert.strictEqual(parsed.config.apiFormat, 'chat');
  });

  it('CodeX: roundtrip preserves apiFormat=responses', () => {
    const original = {
      name: 'Responses CodeX',
      key: 'sk-resp',
      url: 'https://api.resp.com/v1',
      model: 'resp-model',
      reasoningEffort: '',
      apiFormat: 'responses',
    };

    const sql = buildProviderSqlExport({ codexProviders: [original] });
    const result = parseCcSwitchExport(sql, { source: 'cc-switch' });
    const parsed = result.providers[0];
    assert.strictEqual(parsed.config.apiFormat, 'responses');
  });

  it('mixed Claude + CodeX roundtrip', () => {
    const sql = buildProviderSqlExport({
      claudeProviders: [
        { name: 'C1', key: 'sk-c1', config: null, selectedTier: 'sonnet', tierModels: {} },
        { name: 'C2', key: 'sk-c2', config: null, selectedTier: 'opus', tierModels: {} },
      ],
      codexProviders: [
        { name: 'X1', key: 'sk-x1', model: 'm1', apiFormat: 'chat' },
      ],
    });

    const result = parseCcSwitchExport(sql, { source: 'cc-switch' });
    assert.strictEqual(result.providers.length, 3);

    const claude = result.providers.filter((p) => p.agentType === 'claude');
    const codex = result.providers.filter((p) => p.agentType === 'codex');
    assert.strictEqual(claude.length, 2);
    assert.strictEqual(codex.length, 1);
    assert.strictEqual(claude[0].name, 'C1');
    assert.strictEqual(claude[1].name, 'C2');
    assert.strictEqual(codex[0].name, 'X1');
  });

  it('special characters in name survive roundtrip', () => {
    const original = {
      name: "Provider's \"Special\" Name",
      key: 'sk-special',
      url: 'https://api.special.com',
      selectedTier: 'sonnet',
      config: null,
      tierModels: {},
    };

    const sql = buildProviderSqlExport({ claudeProviders: [original] });
    const result = parseCcSwitchExport(sql, { source: 'cc-switch' });
    const parsed = result.providers[0];
    assert.strictEqual(parsed.name, "Provider's \"Special\" Name");
  });
});
