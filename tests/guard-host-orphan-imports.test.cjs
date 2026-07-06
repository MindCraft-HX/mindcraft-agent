'use strict';

/**
 * Host orphan import snapshot (T187 Phase 1, updated Phase 3).
 *
 * After T187 Phase 3 cleanup, orphan components and directories are verified
 * to be REMOVED. The test now fails if any removed orphan reappears.
 *
 * Related: T187 §4 Phase 3
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.resolve(__dirname, '..', 'src');

// ── Removed Orphans (T187 Phase 3) ──
// These must NOT exist. Re-adding them is a regression.

const REMOVED_DIRECTORIES = [
  { dir: 'socket', reason: 'voice/character websocket line' },
  { dir: 'api', reason: 'old API hooks (character square, room, chat)' },
  { dir: path.join('hook', 'dict'), reason: 'old character dict hooks' },
  { dir: path.join('hook', 'room'), reason: 'old room rename hooks' },
  { dir: path.join('hook', 'useDevMode'), reason: 'dev mode activation' },
];

const REMOVED_COMPONENTS = [
  { file: path.join('components', 'Settings.vue'), reason: 'replaced by SharedSettings in packages/agent' },
  { file: path.join('components', 'PromptTemplateDrawer.vue'), reason: 'no router import' },
  { file: path.join('components', 'codemirror'), reason: 'only consumer of vue-codemirror dep' },
  { file: path.join('components', 'scrollBar.vue'), reason: 'no imports' },
  { file: path.join('views', 'error'), reason: 'no router import' },
];

const REMOVED_UTILITIES = [
  { file: path.join('utils', 'IndexedDB.js'), reason: 'only imported idb' },
  { file: path.join('utils', 'audioVisual.js'), reason: 'no importers' },
  { file: path.join('utils', 'filterTool.js'), reason: 'mermaid code extraction' },
  { file: path.join('utils', 'request.js'), reason: 'only imported by orphan api modules' },
  { file: path.join('utils', 'xml.js'), reason: 'part of orphan utility chain' },
  { file: path.join('utils', 'zip.js'), reason: 'no importers' },
  { file: path.join('utils', 'prj.js'), reason: 'part of orphan utility chain' },
  { file: path.join('utils', 'encrypt.js'), reason: 'imports js-md5 (orphan dep)' },
  { file: path.join('utils', 'localStorage.js'), reason: 'part of orphan utility chain' },
];

// ── Active files that must NOT be deleted ──

const ACTIVE_FILES = [
  { file: path.join('utils', 'MarkdownIt.js'), label: 'active mdViewer renderer' },
  { file: path.join('utils', 'mitt.js'), label: 'active event bus' },
  { file: path.join('utils', 'debounce.js'), label: 'active utility' },
  { file: path.join('utils', 'throttle.js'), label: 'active utility' },
  { file: path.join('utils', 'common.js'), label: 'active utility' },
  { file: path.join('utils', 'lib.js'), label: 'active utility' },
  { file: path.join('utils', 'util.js'), label: 'active utility' },
  { file: path.join('components', 'mdViewer'), label: 'active mdViewer component' },
  { file: path.join('components', 'Home'), label: 'active Home components' },
];

describe('Host Orphan Removal Guard (T187 Phase 3)', () => {
  // ── Removed directories must NOT exist ──

  REMOVED_DIRECTORIES.forEach(({ dir, reason }) => {
    const fullDir = path.join(SRC_ROOT, dir);
    it(`REMOVED dir absent: "${dir}" — ${reason}`, () => {
      assert.ok(
        !fs.existsSync(fullDir),
        `Directory "${dir}" was removed in T187 Phase 3 but still exists. ` +
        `If intentionally re-added, update this test. Reason: ${reason}`
      );
    });
  });

  // ── Removed components must NOT exist ──

  REMOVED_COMPONENTS.forEach(({ file, reason }) => {
    const fullPath = path.join(SRC_ROOT, file);
    it(`REMOVED component absent: "${file}" — ${reason}`, () => {
      assert.ok(
        !fs.existsSync(fullPath),
        `Component "${file}" was removed in T187 Phase 3 but still exists. ` +
        `If intentionally re-added, update this test. Reason: ${reason}`
      );
    });
  });

  // ── Removed utilities must NOT exist ──

  REMOVED_UTILITIES.forEach(({ file, reason }) => {
    const fullPath = path.join(SRC_ROOT, file);
    it(`REMOVED utility absent: "${file}" — ${reason}`, () => {
      assert.ok(
        !fs.existsSync(fullPath),
        `Utility "${file}" was removed in T187 Phase 3 but still exists. ` +
        `If intentionally re-added, update this test. Reason: ${reason}`
      );
    });
  });

  // ── Active files must still exist ──

  ACTIVE_FILES.forEach(({ file, label }) => {
    const fullPath = path.join(SRC_ROOT, file);
    it(`ACTIVE file present: "${file}" — ${label}`, () => {
      assert.ok(
        fs.existsSync(fullPath),
        `Active file "${file}" (${label}) is missing. This is likely an accidental deletion.`
      );
    });
  });
});
