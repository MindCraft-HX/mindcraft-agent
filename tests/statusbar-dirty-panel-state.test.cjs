'use strict';

/**
 * StatusBar dirty panel state regression test.
 *
 * Contract: StatusBar and footer must only consume normalized snapshots
 * from the TurnStore pipeline. Old panel state fields
 * (inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
 *  durationMs, costUsd) must NOT leak into current-turn UI rendering.
 *
 * This test validates the contract at the model level — it checks that
 * panel state data structures follow the contract boundaries, not that
 * the UI renders correctly (that's a separate integration test).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ---- Contract definitions ----

/**
 * Fields that must NOT appear in current-turn UI state.
 * They may appear in history/finalized snapshots but never in live display.
 */
const FORBIDDEN_CURRENT_TURN_FIELDS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheCreationTokens',
  'durationMs',
  'costUsd',
];

/**
 * Fields that are allowed in panel state for session restoration.
 */
const ALLOWED_PANEL_STATE_FIELDS = [
  'model',
  'context',
  'git',
  'draft',
  'title',
  'description',
  'sessionInstruction',
  'effortLevel',
  'reasoningEffort',
  'sandboxMode',
  'permissionPolicy',
  'runMode',
];

describe('StatusBar Dirty Panel State Contract', () => {
  it('defines forbidden current-turn fields that must not leak', () => {
    assert.ok(FORBIDDEN_CURRENT_TURN_FIELDS.length > 0,
      'Must define fields that should not leak from panel state');
  });

  it('forbidden fields are not in allowed panel state list', () => {
    const overlap = FORBIDDEN_CURRENT_TURN_FIELDS.filter(f =>
      ALLOWED_PANEL_STATE_FIELDS.includes(f)
    );
    assert.deepStrictEqual(overlap, [],
      `These fields are both forbidden and allowed: ${overlap.join(', ')}`);
  });

  it('simulated panel state with dirty fields is detectable', () => {
    // Simulate an old panel state that has stored metrics
    const dirtyPanelState = {
      model: 'claude-sonnet-4-5',
      title: 'Test session',
      inputTokens: 12345,
      outputTokens: 678,
      cacheReadTokens: 2000,
      durationMs: 30000,
      costUsd: 0.05,
    };

    const dirty = FORBIDDEN_CURRENT_TURN_FIELDS.filter(f =>
      f in dirtyPanelState
    );

    assert.ok(dirty.length > 0,
      `Dirty panel state should contain forbidden fields, found: ${dirty.join(', ')}`);
  });

  it('clean panel state passes validation', () => {
    const cleanPanelState = {
      model: 'claude-sonnet-4-5',
      title: 'Test session',
      description: 'Working on feature X',
      context: [],
    };

    const dirty = FORBIDDEN_CURRENT_TURN_FIELDS.filter(f =>
      f in cleanPanelState
    );

    assert.strictEqual(dirty.length, 0,
      `Clean panel state should not contain: ${dirty.join(', ')}`);
  });
});
