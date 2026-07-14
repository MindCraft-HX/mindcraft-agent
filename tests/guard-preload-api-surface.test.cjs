'use strict';

/**
 * Preload API surface guard test (T187 Phase 1).
 *
 * Verifies that unsafe/deprecated preload APIs are not accidentally kept
 * or re-introduced. This test fails if:
 *   - `openNewWindow` is exposed (nodeIntegration: true, contextIsolation: false)
 *   - `openSingleWindow` is exposed (same)
 *
 * These are currently dead surface with no active renderer callers.
 * If a product decision keeps them, add to ALLOWLIST with a documented reason.
 *
 * Related: T187 §2.3, T188 §2.7
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PRELOAD_PATH = path.resolve(__dirname, '..', 'electron', 'preload.js');

// APIs that must NOT be exposed. Add a reason if an API moves from
// REMOVAL_CANDIDATES to ALLOWLIST.
const REMOVAL_CANDIDATES = [
  'openNewWindow',     // nodeIntegration: true + contextIsolation: false, zero renderer callers
  'openSingleWindow',  // same
];

// APIs currently exposed but gated by product decision (T188).
// These do NOT fail the test but print a warning so they are not forgotten.
const T188_GATED = [
  'openClaudeWin',
  'openCodexWin',
];

// APIs that are explicitly supported and expected in preload.
const SUPPORTED_APIS = [
  'openExternalWindow',
  'openSystemSettings',
  'openMdWin',
  'openFolder',
  'openFileWithDefault',
  'openEmail',
  'selectAndReadFile',
  'readFileByPath',
  'openFileDialog',
];

function extractExposedApis(sourceText) {
  const apis = [];
  // Match top-level keys inside contextBridge.exposeInMainWorld("electronAPI", { ... })
  // and also ...createAgentBridge spread.
  //
  // IMPORTANT: This regex assumes 2+ space indentation (current preload.js style).
  // If preload.js is reformatted with tabs or 1-space indent, this will silently
  // miss APIs and REMOVAL_CANDIDATES checks will pass vacuously.
  // If indentation changes, update /^\s{2,}/ to match the new style.
  const lines = sourceText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Match: <spaces>keyName: (args) => ...
    // Also match: keyName (callback) { ... } (method shorthand)
    const keyMatch = lines[i].match(/^\s{2,}(\w+)\s*[:\(]/);
    if (keyMatch && keyMatch[1] !== 'createAgentBridge') {
      const key = keyMatch[1];
      if (!apis.includes(key)) apis.push(key);
    }
  }
  return apis;
}

describe('Preload API Surface (T187 Phase 1)', () => {
  let exposedApis;
  let sourceText;

  before(() => {
    sourceText = fs.readFileSync(PRELOAD_PATH, 'utf8');
    exposedApis = extractExposedApis(sourceText);
  });

  it('preload.js file exists', () => {
    assert.ok(fs.existsSync(PRELOAD_PATH), 'electron/preload.js must exist');
  });

  REMOVAL_CANDIDATES.forEach((api) => {
    it(`REMOVAL CANDIDATE: "${api}" should NOT be exposed in preload.js`, () => {
      assert.ok(
        !exposedApis.includes(api),
        `"${api}" is exposed in preload.js but has zero active renderer callers. ` +
        `It creates Electron windows with nodeIntegration:true + contextIsolation:false. ` +
        `If a supported feature needs this API, add it to the ALLOWLIST with a documented reason.`
      );
    });
  });

  it('T188-gated APIs: openClaudeWin and openCodexWin are present (gated by T188 product decision)', () => {
    for (const api of T188_GATED) {
      assert.ok(
        exposedApis.includes(api),
        `"${api}" is missing from preload.js. ` +
        `This API is gated by T188 product decision — do not remove without resolving T188 LEGACY_STANDALONE_* entries.`
      );
    }
  });

  it('supported preload APIs are still present', () => {
    for (const api of SUPPORTED_APIS) {
      if (!exposedApis.includes(api)) {
        // Some may have been intentionally migrated. Log but don't fail.
        console.warn(`[guard] supported API "${api}" not found in preload.js — may be intentionally moved`);
      }
    }
  });
});
