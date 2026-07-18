'use strict';

/**
 * Contract test runner — scans test files matching contract patterns
 * and runs them via node:test. Avoids glob shell expansion issues on Windows.
 *
 * Usage: node tests/run-contract-tests.cjs
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---- Pattern definitions ----

const CONTRACT_PATTERNS = [
  // Agent boundary + architecture tests
  { dir: 'tests', match: f => /^agent-.*\.test\.(mjs|cjs)$/.test(f) },
  // Boundary tests
  { dir: 'tests', match: f => /boundary.*\.test\.(cjs|mjs)$/.test(f) },
  // Convergence contract tests
  { dir: 'tests', match: f => /convergence.*\.test\.(mjs|cjs)$/.test(f) },
  // Metrics tests
  { dir: 'tests', match: f => /metrics.*\.test\.(mjs|cjs)$/.test(f) && !f.includes('persisted') },
  // Session tests
  { dir: 'tests', match: f => /session.*\.test\.(mjs|cjs)$/.test(f) },
  // History hydration
  { dir: 'tests', match: f => f === 'history-hydration-authority.test.mjs' },
  // Input history
  { dir: 'tests', match: f => f === 'use-input-history.test.mjs' },
  // Renderer convergence contract
  { dir: 'tests', match: f => f === 'renderer-convergence-contract.test.mjs' },
  // IPC handle dedup (catches double-registration that crashes Electron at startup)
  { dir: 'tests', match: f => f === 'ipc-handle-dedup.test.cjs' },
  // IPC channel parity + registry hard constraint (Batch 3)
  { dir: 'tests', match: f => f === 'ipc-channel-registry.test.cjs' },
  // Workbench architecture contracts
  { dir: 'tests', match: f => /^workbench-.*\.test\.(cjs|mjs)$/.test(f) },
  { dir: 'tests', match: f => f === 'close-participant-registry.test.mjs' },
  { dir: 'tests', match: f => f === 'close-handshake.test.cjs' },
  // Extracted pure-helper / IO-without-state module tests (Batch 2+)
  { dir: 'tests', match: f => /^codex-.*\.test\.cjs$/.test(f) },
  { dir: 'tests', match: f => /^claude-.*\.test\.cjs$/.test(f) },
  // Shared module tests (Batch 5+)
  { dir: 'tests', match: f => /^cli-executor\.test\.cjs$/.test(f) },
  // Token metrics unit tests
  { dir: 'packages/agent/electron/tokenMetrics', match: f => /\.test\.(cjs|mjs)$/.test(f) },
];

const ALL_PATTERNS = [
  { dir: 'tests', match: f => /\.test\.(mjs|cjs)$/.test(f) },
  { dir: 'packages/agent/electron', match: f => /\.test\.(js|cjs|mjs)$/.test(f) },
];

// ---- Collector ----

function collectFiles(patterns) {
  const files = [];
  const seen = new Set();
  for (const { dir, match } of patterns) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;
    const entries = walkDir(dirPath, match);
    for (const e of entries) {
      if (!seen.has(e)) {
        seen.add(e);
        files.push(e);
      }
    }
  }
  return files;
}

function walkDir(dirPath, matchFn) {
  const results = [];
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && matchFn(entry.name)) {
        results.push(full);
      }
    }
  }
  results.sort();
  return results;
}

// ---- Main ----

const mode = process.argv[2] || 'contract';
const patterns = mode === 'all' ? ALL_PATTERNS : CONTRACT_PATTERNS;
const files = collectFiles(patterns);

if (files.length === 0) {
  console.error('No test files found matching patterns.');
  process.exit(1);
}

const relativeFiles = files.map(f => path.relative(ROOT, f));
console.error(`[contract-runner] Running ${relativeFiles.length} test files (mode: ${mode})`);

try {
  execFileSync('node', ['--test', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  // node:test exits with non-zero on test failure — propagate
  process.exit(err.status || 1);
}
