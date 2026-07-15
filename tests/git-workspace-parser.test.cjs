'use strict';

/**
 * Contract tests for gitWorkspaceParser — porcelain -z / numstat -z parsing.
 *
 * Covers:
 *   - Normal modify/add/delete
 *   - Rename and copy
 *   - Conflict (U) markers
 *   - Staged + unstaged same file
 *   - Filenames with spaces, CJK, quotes, newlines
 *   - Empty input, garbage input
 *   - Numstat binary, normal, rename
 *   - mergeNumstats entry matching
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  parsePorcelainZ,
  parseNumstatZ,
  mergeNumstats,
} = require('../packages/agent/electron/gitWorkspace/gitWorkspaceParser');

// ── Helpers ──

function makePorcelainBuffer(lines) {
  // lines: array of [xy, path] or [xy, newPath, oldPath] for renames
  // porcelain=v1 -z format: "XY newPath\0oldPath\0" (NEW first, OLD second)
  const parts = [];
  for (const line of lines) {
    parts.push(line[0]);
    parts.push(' ');
    parts.push(line[1] || '');
    parts.push('\0');
    if (line.length > 2) {
      parts.push(line[2] || '');
      parts.push('\0');
    }
  }
  return parts.join('');
}

function makeNumstatBuffer(entries) {
  // entries: [additions, deletions, path] or [additions, deletions, oldPath, newPath]
  const parts = [];
  for (const e of entries) {
    parts.push(String(e[0]) + '\t' + String(e[1]) + '\t' + (e[2] || '') + '\0');
    if (e.length > 3) {
      parts.push(e[3] + '\0');
    }
  }
  return parts.join('');
}

// ── Porcelain parsing ──

describe('parsePorcelainZ', () => {
  it('parses empty input', () => {
    assert.deepStrictEqual(parsePorcelainZ(''), []);
    assert.deepStrictEqual(parsePorcelainZ(null), []);
    assert.deepStrictEqual(parsePorcelainZ(undefined), []);
  });

  it('parses a simple modified file (unstaged)', () => {
    const raw = makePorcelainBuffer([[' M', 'src/a.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].changeKind, 'unstaged');
    assert.strictEqual(entries[0].status, 'M');
    assert.strictEqual(entries[0].relativePath, 'src/a.js');
  });

  it('parses a simple modified file (staged)', () => {
    const raw = makePorcelainBuffer([['M ', 'src/a.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].changeKind, 'staged');
    assert.strictEqual(entries[0].status, 'M');
  });

  it('parses staged + unstaged for same file (MM)', () => {
    const raw = makePorcelainBuffer([['MM', 'src/a.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 2);

    const staged = entries.find(e => e.changeKind === 'staged');
    const unstaged = entries.find(e => e.changeKind === 'unstaged');
    assert.ok(staged, 'should have staged entry');
    assert.ok(unstaged, 'should have unstaged entry');
    assert.strictEqual(staged.relativePath, 'src/a.js');
    assert.strictEqual(unstaged.relativePath, 'src/a.js');
  });

  it('parses added file (A)', () => {
    const raw = makePorcelainBuffer([['A ', 'newfile.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].changeKind, 'staged');
    assert.strictEqual(entries[0].status, 'A');
  });

  it('parses deleted file (D)', () => {
    const raw = makePorcelainBuffer([[' D', 'removed.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].changeKind, 'unstaged');
    assert.strictEqual(entries[0].status, 'D');
  });

  it('parses untracked file (??)', () => {
    const raw = makePorcelainBuffer([['??', 'new-untracked.md']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].changeKind, 'untracked');
    assert.strictEqual(entries[0].status, '??');
  });

  it('parses renamed file (R)', () => {
    // Real git format: R  newPath\0oldPath\0 (NEW first)
    const raw = makePorcelainBuffer([['R ', 'new.js', 'old.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].status, 'R');
    assert.strictEqual(entries[0].oldRelativePath, 'old.js');
    assert.strictEqual(entries[0].relativePath, 'new.js');
  });

  it('parses copied file (C)', () => {
    // Real git format: C  newPath\0oldPath\0 (NEW first)
    const raw = makePorcelainBuffer([['C ', 'copy.js', 'orig.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].status, 'C');
    assert.strictEqual(entries[0].oldRelativePath, 'orig.js');
    assert.strictEqual(entries[0].relativePath, 'copy.js');
  });

  it('parses conflict marker (UU)', () => {
    const raw = makePorcelainBuffer([['UU', 'conflict.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].status, 'U');
    assert.strictEqual(entries[0].changeKind, 'unstaged');
  });

  it('parses multiple files mixed', () => {
    const lines = [
      ['M ', 'staged.js'],
      [' M', 'unstaged.js'],
      ['??', 'untracked.txt'],
      ['A ', 'added.js'],
      [' D', 'deleted.js'],
    ];
    const raw = makePorcelainBuffer(lines);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 5);

    const kinds = entries.map(e => e.changeKind);
    assert.ok(kinds.includes('staged'));
    assert.ok(kinds.includes('unstaged'));
    assert.ok(kinds.includes('untracked'));
  });

  it('handles filename with spaces', () => {
    const raw = makePorcelainBuffer([[' M', 'src/my file.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries[0].relativePath, 'src/my file.js');
  });

  it('handles filename with Chinese characters', () => {
    const raw = makePorcelainBuffer([[' M', 'src/中文文件.md']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries[0].relativePath, 'src/中文文件.md');
  });

  it('handles filename with quotes', () => {
    const raw = makePorcelainBuffer([[' M', "src/test's file.js"]]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries[0].relativePath, "src/test's file.js");
  });

  it('handles filename with embedded newline (NUL delimiter)', () => {
    // The path itself contains a literal newline; -z separates entries by NUL,
    // so the newline inside the path must be preserved.
    const pathWithNewline = 'src/file\nline2.js';
    const raw = makePorcelainBuffer([[' M', pathWithNewline]]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries[0].relativePath, pathWithNewline);
  });

  it('skips ignored files (!!)', () => {
    const raw = makePorcelainBuffer([['!!', 'ignored.txt']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries.length, 0);
  });

  it('produces correct id format', () => {
    const raw = makePorcelainBuffer([[' M', 'src/a.js']]);
    const entries = parsePorcelainZ(raw);
    assert.strictEqual(entries[0].id, 'unstaged\0src/a.js');
  });
});

// ── Numstat parsing ──

describe('parseNumstatZ', () => {
  it('parses empty input', () => {
    assert.deepStrictEqual(parseNumstatZ(''), []);
    assert.deepStrictEqual(parseNumstatZ(null), []);
  });

  it('parses normal numstat entry', () => {
    const raw = makeNumstatBuffer([[3, 1, 'src/a.js']]);
    const entries = parseNumstatZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].additions, 3);
    assert.strictEqual(entries[0].deletions, 1);
    assert.strictEqual(entries[0].relativePath, 'src/a.js');
    assert.strictEqual(entries[0].binary, false);
  });

  it('parses binary entry (-\\t-)', () => {
    const raw = makeNumstatBuffer([['-', '-', 'image.png']]);
    const entries = parseNumstatZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].additions, null);
    assert.strictEqual(entries[0].deletions, null);
    assert.strictEqual(entries[0].binary, true);
  });

  it('parses renamed numstat entry', () => {
    const raw = makeNumstatBuffer([[10, 5, 'old.js', 'new.js']]);
    const entries = parseNumstatZ(raw);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].oldRelativePath, 'old.js');
    assert.strictEqual(entries[0].relativePath, 'new.js');
    assert.strictEqual(entries[0].additions, 10);
  });

  it('parses multiple numstat entries', () => {
    const raw = makeNumstatBuffer([
      [3, 1, 'src/a.js'],
      [0, 8, 'src/b.js'],
      [15, 0, 'src/c.js'],
    ]);
    const entries = parseNumstatZ(raw);

    assert.strictEqual(entries.length, 3);
    assert.strictEqual(entries[0].relativePath, 'src/a.js');
    assert.strictEqual(entries[1].additions, 0);
    assert.strictEqual(entries[2].deletions, 0);
  });

  it('parses zero additions/deletions', () => {
    const raw = makeNumstatBuffer([[0, 0, 'empty.txt']]);
    const entries = parseNumstatZ(raw);
    assert.strictEqual(entries[0].additions, 0);
    assert.strictEqual(entries[0].deletions, 0);
  });
});

// ── mergeNumstats ──

describe('mergeNumstats', () => {
  it('merges staged numstats into staged porcelain entries', () => {
    const porcelain = [
      { id: 'staged\0src/a.js', changeKind: 'staged', status: 'M', relativePath: 'src/a.js', oldRelativePath: '', additions: null, deletions: null, binary: false },
    ];
    const stagedNums = [{ relativePath: 'src/a.js', additions: 3, deletions: 1, binary: false }];
    const unstagedNums = [];

    const merged = mergeNumstats(porcelain, stagedNums, unstagedNums);
    assert.strictEqual(merged[0].additions, 3);
    assert.strictEqual(merged[0].deletions, 1);
  });

  it('merges unstaged numstats into unstaged porcelain entries', () => {
    const porcelain = [
      { id: 'unstaged\0src/b.js', changeKind: 'unstaged', status: 'M', relativePath: 'src/b.js', oldRelativePath: '', additions: null, deletions: null, binary: false },
    ];
    const stagedNums = [];
    const unstagedNums = [{ relativePath: 'src/b.js', additions: 0, deletions: 8, binary: false }];

    const merged = mergeNumstats(porcelain, stagedNums, unstagedNums);
    assert.strictEqual(merged[0].additions, 0);
    assert.strictEqual(merged[0].deletions, 8);
  });

  it('handles staged + unstaged for same file with correct numstat matching', () => {
    const porcelain = [
      { id: 'staged\0src/a.js', changeKind: 'staged', status: 'M', relativePath: 'src/a.js', oldRelativePath: '', additions: null, deletions: null, binary: false },
      { id: 'unstaged\0src/a.js', changeKind: 'unstaged', status: 'M', relativePath: 'src/a.js', oldRelativePath: '', additions: null, deletions: null, binary: false },
    ];
    const stagedNums = [{ relativePath: 'src/a.js', additions: 5, deletions: 2, binary: false }];
    const unstagedNums = [{ relativePath: 'src/a.js', additions: 1, deletions: 3, binary: false }];

    const merged = mergeNumstats(porcelain, stagedNums, unstagedNums);

    const stagedEntry = merged.find(e => e.changeKind === 'staged');
    const unstagedEntry = merged.find(e => e.changeKind === 'unstaged');

    assert.strictEqual(stagedEntry.additions, 5);
    assert.strictEqual(stagedEntry.deletions, 2);
    assert.strictEqual(unstagedEntry.additions, 1);
    assert.strictEqual(unstagedEntry.deletions, 3);
  });

  it('leaves untracked entries with null stats', () => {
    const porcelain = [
      { id: 'untracked\0new.md', changeKind: 'untracked', status: '??', relativePath: 'new.md', oldRelativePath: '', additions: null, deletions: null, binary: false },
    ];
    const merged = mergeNumstats(porcelain, [], []);
    assert.strictEqual(merged[0].additions, null);
    assert.strictEqual(merged[0].deletions, null);
  });

  it('handles binary numstat', () => {
    const porcelain = [
      { id: 'unstaged\0img.png', changeKind: 'unstaged', status: 'M', relativePath: 'img.png', oldRelativePath: '', additions: null, deletions: null, binary: false },
    ];
    const unstagedNums = [{ relativePath: 'img.png', additions: null, deletions: null, binary: true }];
    const merged = mergeNumstats(porcelain, [], unstagedNums);
    assert.strictEqual(merged[0].binary, true);
    assert.strictEqual(merged[0].additions, null);
  });
});
