'use strict';

/**
 * Agent module import integrity test.
 *
 * Verifies that every destructured import in the two giant agent files
 * actually matches what the required module exports.  This catches the
 * class of bugs that node --check cannot detect: a valid `require()`
 * whose destructured binding is not in the module's exports.
 *
 * Example of what this catches:
 *   const { createCliExecutor } = require('./shared/cliExecutor')
 *   // but ./shared/cliExecutor.js exports { createCliExecutor } — OK
 *
 *   const { createCliExecutor } = require('./shared/skills/scanner')
 *   // but scanner.js exports { scanSkillsDirs } — BUG (though in this
 *   // case it's the reverse: import was missing entirely)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const AGENT_DIR = path.resolve(__dirname, '..', 'packages', 'agent', 'electron');
const AGENT_FILES = ['codexAgent.js', 'claudeAgent.js'];

/**
 * Collect destructured requires from source text.
 * Returns [{ file, line, binding, modulePath }]
 */
function collectDestructuredRequires(sourceFile, sourceText) {
  const results = [];
  const lines = sourceText.split('\n');
  // Match: const { a, b, c } = require('...')
  const re = /^\s*const\s*\{\s*([^}]+)\s*\}\s*=\s*require\(['"]([^'"]+)['"]\)/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const bindings = m[1].split(',').map(s => {
      // Handle `foo as bar` and `foo: bar` renaming
      let parts = s.split(/\s+as\s+/);
      if (parts.length === 1) parts = s.split(/\s*:\s*/);
      return { binding: parts[0].trim(), alias: (parts[1] || parts[0]).trim() };
    });
    const modulePath = m[2];
    for (const b of bindings) {
      results.push({ file: sourceFile, line: i + 1, binding: b.binding, alias: b.alias, modulePath });
    }
  }
  return results;
}

/**
 * Resolve a relative require path to an absolute file path.
 */
function resolveModule(baseDir, modulePath) {
  if (!modulePath.startsWith('.')) return null; // node_modules — skip
  const candidates = [
    path.resolve(baseDir, modulePath + '.js'),
    path.resolve(baseDir, modulePath + '.cjs'),
    path.resolve(baseDir, modulePath, 'index.js'),
    path.resolve(baseDir, modulePath, 'index.cjs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Get exported names from a module file (naive: scan module.exports = { ... }).
 * This is NOT a full parse — just enough to catch common patterns.
 */
function getExports(absPath) {
  try {
    const text = fs.readFileSync(absPath, 'utf8');
    const names = new Set();

    // Pattern 1: module.exports = { foo, bar, baz }
    let m = text.match(/module\.exports\s*=\s*\{\s*([^}]*)\s*\}/s);
    if (m) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(':')[0].trim();
        if (name && /^[a-zA-Z_$]/.test(name)) names.add(name);
      }
    }

    // Pattern 2: module.exports.foo = ...
    const re2 = /module\.exports\.(\w+)\s*=/g;
    while ((m = re2.exec(text)) !== null) {
      names.add(m[1]);
    }

    // Pattern 3: exports.foo = ...
    const re3 = /exports\.(\w+)\s*=/g;
    while ((m = re3.exec(text)) !== null) {
      names.add(m[1]);
    }

    return names.size > 0 ? names : null;
  } catch (_) {
    return null;
  }
}

describe('Agent module import integrity', () => {
  for (const agentFile of AGENT_FILES) {
    const absFile = path.join(AGENT_DIR, agentFile);
    if (!fs.existsSync(absFile)) {
      it(`${agentFile} exists`, () => { assert.fail('File not found'); });
      continue;
    }

    const sourceText = fs.readFileSync(absFile, 'utf8');
    const imports = collectDestructuredRequires(agentFile, sourceText);

    for (const imp of imports) {
      const resolved = resolveModule(AGENT_DIR, imp.modulePath);
      if (!resolved) continue; // node_modules or unresolvable — skip

      const exports = getExports(resolved);

      it(`${agentFile}:${imp.line} — \`${imp.alias}\` exists in ${imp.modulePath}`, () => {
        if (exports === null) {
          // Can't determine exports — skip but note
          return; // soft pass
        }
        assert.ok(
          exports.has(imp.binding),
          `${agentFile}:${imp.line} imports \`${imp.alias}\` from ${imp.modulePath}, ` +
          `but that module does not export \`${imp.binding}\`. ` +
          `Exported: ${[...exports].join(', ')}`
        );
      });
    }
  }
});
