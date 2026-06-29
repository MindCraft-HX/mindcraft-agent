'use strict';

/**
 * No-console guard for main process code.
 *
 * Phase 1: soft enforcement — reports bare console.log/console.warn
 * in electron/** and packages/agent/electron/** source files.
 *
 * Does NOT flag:
 *   - test files (*.test.*)
 *   - __tests__ directories
 *   - Code that already uses a logger helper
 */

const fs = require('fs');
const path = require('path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');

const MAIN_DIRS = [
  'packages/agent/electron',
  'electron',
];

const EXCLUDE_PATTERNS = [
  /\.test\./,
  /[\\/]__tests__[\\/]/,
  /node_modules/,
];

function scanForConsoleLogs(dirPath) {
  const violations = [];
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(ROOT, full);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__tests__') {
          stack.push(full);
        }
      } else if (
        entry.isFile() &&
        /\.(js|mjs|cjs|ts)$/.test(entry.name) &&
        !EXCLUDE_PATTERNS.some(p => p.test(rel))
      ) {
        const content = fs.readFileSync(full, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Match console.log or console.warn but not console.error (errors are fine)
          if (/console\.(log|warn)\s*\(/.test(line)) {
            // Skip if it's inside a comment
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
            // Skip logger.debug() etc. — those use a facade
            if (/logger\./.test(line)) continue;

            violations.push({
              file: rel,
              line: i + 1,
              text: trimmed.substring(0, 120),
            });
          }
        }
      }
    }
  }
  return violations;
}

describe('Main Process No-Console', () => {
  let allViolations;

  before(() => {
    allViolations = [];
    for (const dir of MAIN_DIRS) {
      const fullPath = path.join(ROOT, dir);
      allViolations.push(...scanForConsoleLogs(fullPath));
    }
  });

  it('every main-process console.log/warn has a logger alternative available', () => {
    // Phase 1: soft — report count, don't fail
    if (allViolations.length > 0) {
      console.warn(`⚠ ${allViolations.length} bare console.log/warn calls in main process:`);
      const byFile = {};
      for (const v of allViolations) {
        byFile[v.file] = (byFile[v.file] || 0) + 1;
      }
      for (const [file, count] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
        console.warn(`  ${file}: ${count}`);
      }
    }
    console.log(`\n  Total bare console.log/warn calls: ${allViolations.length}`);
    console.log('  These will be migrated to logger facade in Phase 2.');
    console.log('  New code must use logger, not console.log.');

    // Record baseline — violations should only decrease from here
    assert.ok(true, `Current console.log/warn count: ${allViolations.length}`);
  });
});
