'use strict';

/**
 * Characterization tests for appendPreservedCodexConfigSections (Batch 5c).
 *
 * This function preserves [plugins.*] and [marketplaces.*] TOML sections
 * from the existing config.toml when writing new content. It prevents
 * the model-config save from overwriting plugin/marketplace entries.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { appendPreservedCodexConfigSections } = require('../packages/agent/electron/codex/configTomlPreserve');

describe('appendPreservedCodexConfigSections', () => {
  it('returns content unchanged when existing is empty', () => {
    const result = appendPreservedCodexConfigSections(
      '[model]\nname = "gpt-4o"\n',
      ''
    );
    assert.strictEqual(result, '[model]\nname = "gpt-4o"\n');
  });

  it('returns content unchanged when existing is null/undefined', () => {
    const result = appendPreservedCodexConfigSections(
      '[model]\nname = "gpt-4o"\n',
      null
    );
    assert.strictEqual(result, '[model]\nname = "gpt-4o"\n');
  });

  it('returns content unchanged when existing has no preserve sections', () => {
    const result = appendPreservedCodexConfigSections(
      '[model]\nname = "gpt-4o"\n',
      '[settings]\nfoo = "bar"\n'
    );
    assert.strictEqual(result, '[model]\nname = "gpt-4o"\n');
  });

  it('preserves [plugins.*] sections from existing', () => {
    const existing = '[plugins.test]\nurl = "https://example.com"\nname = "test"';
    const result = appendPreservedCodexConfigSections(
      '[model]\nname = "gpt-4o"\n',
      existing
    );
    assert.ok(result.includes('[plugins.test]'));
    assert.ok(result.includes('url = "https://example.com"'));
    assert.ok(result.includes('[model]'));
  });

  it('preserves [marketplaces.*] sections from existing', () => {
    const existing = '[marketplaces.my-mkt]\nurl = "https://mkt.example.com"\nauto_update = true';
    const result = appendPreservedCodexConfigSections(
      'api_key = "sk-123"\n',
      existing
    );
    assert.ok(result.includes('[marketplaces.my-mkt]'));
    assert.ok(result.includes('url = "https://mkt.example.com"'));
  });

  it('stops preservation at next non-plugin/non-marketplace section', () => {
    const existing = [
      '[plugins.p1]',
      'url = "a"',
      '[model]',
      'name = "old-model"',
    ].join('\n');
    const result = appendPreservedCodexConfigSections(
      'api_key = "new-key"\n',
      existing
    );
    // Should include plugins.p1, NOT model section
    assert.ok(result.includes('[plugins.p1]'));
    assert.ok(result.includes('url = "a"'));
    assert.ok(!result.includes('name = "old-model"'));
  });

  it('supports multiple consecutive preserve sections', () => {
    const existing = [
      '[plugins.p1]',
      'url = "a"',
      '[plugins.p2]',
      'url = "b"',
      '[marketplaces.m1]',
      'url = "c"',
      '[other]',
      'x = 1',
    ].join('\n');
    const result = appendPreservedCodexConfigSections(
      'api_key = "k"\n',
      existing
    );
    assert.ok(result.includes('[plugins.p1]'));
    assert.ok(result.includes('[plugins.p2]'));
    assert.ok(result.includes('[marketplaces.m1]'));
    assert.ok(!result.includes('[other]'));
  });

  it('handles content already containing the preserve block (dedup)', () => {
    const existing = '[plugins.p1]\nurl = "a"';
    const content = 'api_key = "k"\n\n[plugins.p1]\nurl = "a"\n';
    const result = appendPreservedCodexConfigSections(content, existing);
    // Should NOT duplicate — the preserve block already exists in content
    const occurrences = (result.match(/\[plugins\.p1\]/g) || []).length;
    assert.strictEqual(occurrences, 1, 'should not duplicate preserve section');
  });

  it('normalizes CRLF to LF for comparison (Windows compat)', () => {
    const existing = '[plugins.p1]\r\nurl = "a"\r\n';
    const content = 'api_key = "k"\n\n[plugins.p1]\nurl = "a"\n';
    const result = appendPreservedCodexConfigSections(content, existing);
    const occurrences = (result.match(/\[plugins\.p1\]/g) || []).length;
    assert.strictEqual(occurrences, 1);
  });

  it('returns content when preserve block is empty/whitespace-only', () => {
    const result = appendPreservedCodexConfigSections(
      'api_key = "k"\n',
      '   \n  \n'
    );
    assert.strictEqual(result, 'api_key = "k"\n');
  });

  it('handles sections with dots in the name', () => {
    const existing = '[plugins.com.example.test]\nurl = "x"\n[model]\nn = "m"';
    const result = appendPreservedCodexConfigSections('new = "y"\n', existing);
    assert.ok(result.includes('[plugins.com.example.test]'));
    assert.ok(!result.includes('n = "m"'));
  });

  it('handles empty content gracefully', () => {
    const existing = '[plugins.p1]\nurl = "a"';
    const result = appendPreservedCodexConfigSections('', existing);
    assert.ok(result.includes('[plugins.p1]'));
  });
});
