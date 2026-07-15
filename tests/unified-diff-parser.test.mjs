'use strict';

/**
 * Contract tests for unified diff parser.
 *
 * Covers:
 *   - Single file modify diff
 *   - New file (add)
 *   - Deleted file
 *   - Multiple files
 *   - Binary file
 *   - Rename
 *   - No-newline marker
 *   - Empty input
 *   - Hunk header with context text
 *   - countDiffStats / annotateHunkLines
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Top-level dynamic import ──

const modPath = '../packages/agent/src/components/agentCommon/utils/unifiedDiff.js';
const mod = await import(modPath);
const { parseUnifiedDiff, parseSingleFileDiff, countDiffStats, annotateHunkLines } = mod;

// ── Helpers ──

function makeModifyDiff(filePath, hunks) {
  // hunks: [{ oldStart, oldCount, newStart, newCount, header?, lines }]
  // lines: [' context', '+added', '-removed']
  let out = `diff --git a/${filePath} b/${filePath}\nindex abc1234..def5678 100644\n--- a/${filePath}\n+++ b/${filePath}\n`;
  for (const h of hunks) {
    const header = h.header || `@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@`;
    out += header + '\n';
    for (const line of h.lines) {
      out += line + '\n';
    }
  }
  return out;
}

// ── Tests ──

describe('parseUnifiedDiff', () => {
  it('returns empty for null/undefined/empty', () => {
    assert.deepStrictEqual(parseUnifiedDiff(''), []);
    assert.deepStrictEqual(parseUnifiedDiff(null), []);
    assert.deepStrictEqual(parseUnifiedDiff(undefined), []);
    assert.deepStrictEqual(parseUnifiedDiff('   \n  \n'), []);
  });

  it('parses a simple modify diff with one hunk', () => {
    const diff = makeModifyDiff('src/a.js', [
      {
        oldStart: 1, oldCount: 5, newStart: 1, newCount: 6,
        lines: [
          ' unchanged line 1',
          '+added line',
          '-removed line',
          ' unchanged line 2',
        ],
      },
    ]);

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].filePath, 'src/a.js');
    assert.strictEqual(files[0].changeType, 'modify');
    assert.strictEqual(files[0].binary, false);
    assert.strictEqual(files[0].hunks.length, 1);

    const hunk = files[0].hunks[0];
    assert.ok(hunk.header.startsWith('@@'));
    assert.strictEqual(hunk.lines.length, 4);
    assert.strictEqual(hunk.lines[0].type, 'ctx');
    assert.strictEqual(hunk.lines[0].text, 'unchanged line 1');
    assert.strictEqual(hunk.lines[1].type, 'add');
    assert.strictEqual(hunk.lines[1].text, 'added line');
    assert.strictEqual(hunk.lines[2].type, 'del');
    assert.strictEqual(hunk.lines[2].text, 'removed line');
    assert.strictEqual(hunk.lines[3].type, 'ctx');
    assert.strictEqual(hunk.lines[3].text, 'unchanged line 2');
  });

  it('parses new file diff', () => {
    const diff = `diff --git a/new.js b/new.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/new.js
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`;

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].filePath, 'new.js');
    assert.strictEqual(files[0].isNewFile, true);
    assert.strictEqual(files[0].changeType, 'add');
    assert.strictEqual(files[0].hunks[0].lines.length, 3);
    assert.strictEqual(files[0].hunks[0].lines[0].type, 'add');
  });

  it('parses deleted file diff', () => {
    const diff = `diff --git a/old.js b/old.js
deleted file mode 100644
index abc1234..0000000
--- a/old.js
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3
`;

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].filePath, 'old.js');
    assert.strictEqual(files[0].isDeletedFile, true);
    assert.strictEqual(files[0].changeType, 'delete');
    assert.strictEqual(files[0].hunks[0].lines[0].type, 'del');
  });

  it('handles binary file marker', () => {
    const diff = 'diff --git a/image.png b/image.png\nindex abc..def 100644\nBinary files a/image.png and b/image.png differ\n';

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].binary, true);
    assert.strictEqual(files[0].changeType, 'binary');
    assert.strictEqual(files[0].hunks.length, 0);
  });

  it('parses multiple files', () => {
    const diff = makeModifyDiff('a.js', [
      { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines: ['+a'] },
    ]) + '\n' + makeModifyDiff('b.js', [
      { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines: ['-b'] },
    ]);

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 2);
    assert.strictEqual(files[0].filePath, 'a.js');
    assert.strictEqual(files[1].filePath, 'b.js');
  });

  it('handles hunk header with context text', () => {
    const diff = makeModifyDiff('src/fn.js', [
      {
        header: '@@ -10,7 +10,8 @@ function calculateTotal(items) {',
        lines: [' unchanged', '+added'],
      },
    ]);

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files[0].hunks[0].header, '@@ -10,7 +10,8 @@ function calculateTotal(items) {');
    assert.strictEqual(files[0].hunks[0].lines.length, 2);
  });

  it('ignores \\ No newline at end of file marker', () => {
    const diff = makeModifyDiff('a.js', [
      {
        oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
        lines: [' unchanged'],
      },
    ]) + '\\ No newline at end of file\n';

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].hunks[0].lines.length, 1);
  });

  it('handles filename with spaces', () => {
    const diff = `diff --git "a/my file.js" "b/my file.js"
index abc..def 100644
--- "a/my file.js"
+++ "b/my file.js"
@@ -1,1 +1,1 @@
 unchanged
`;

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
  });

  it('parses rename from/to markers', () => {
    const diff = `diff --git a/old.js b/new.js
rename from old.js
rename to new.js
index abc1234..def5678 100644
--- a/old.js
+++ b/new.js
@@ -1,1 +1,1 @@
 unchanged
`;

    const files = parseUnifiedDiff(diff);
    assert.strictEqual(files.length, 1);
    assert.strictEqual(files[0].filePath, 'new.js');
    assert.strictEqual(files[0].changeType, 'rename');
    assert.strictEqual(files[0].hunks.length, 1);
  });
});

describe('parseSingleFileDiff', () => {
  it('returns first file from single-file diff', () => {
    const diff = makeModifyDiff('a.js', [
      { oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines: ['+a'] },
    ]);
    const file = parseSingleFileDiff(diff);
    assert.ok(file);
    assert.strictEqual(file.filePath, 'a.js');
  });

  it('returns null for empty input', () => {
    assert.strictEqual(parseSingleFileDiff(''), null);
  });
});

describe('countDiffStats', () => {
  it('counts additions and deletions across files', () => {
    const diff = makeModifyDiff('a.js', [
      { oldStart: 1, oldCount: 3, newStart: 1, newCount: 5, lines: ['+a1', '+a2', '-d1', ' ctx1'] },
    ]) + '\n' + makeModifyDiff('b.js', [
      { oldStart: 1, oldCount: 2, newStart: 1, newCount: 2, lines: ['+b1', '-d2'] },
    ]);

    const files = parseUnifiedDiff(diff);
    const stats = countDiffStats(files);
    assert.strictEqual(stats.additions, 3); // +a1, +a2, +b1
    assert.strictEqual(stats.deletions, 2); // -d1, -d2
  });

  it('returns zeros for empty files', () => {
    const stats = countDiffStats([]);
    assert.strictEqual(stats.additions, 0);
    assert.strictEqual(stats.deletions, 0);
  });

  it('handles binary files (no lines to count)', () => {
    const diff = 'diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n';
    const files = parseUnifiedDiff(diff);
    const stats = countDiffStats(files);
    assert.strictEqual(stats.additions, 0);
    assert.strictEqual(stats.deletions, 0);
  });
});

describe('annotateHunkLines', () => {
  it('annotates add/del/ctx lines with correct line numbers', () => {
    const diff = makeModifyDiff('a.js', [
      {
        oldStart: 10, oldCount: 4, newStart: 10, newCount: 5,
        lines: [' ctx1', '+add1', '-del1', ' ctx2', '+add2'],
      },
    ]);

    const files = parseUnifiedDiff(diff);
    const annotated = annotateHunkLines(files[0].hunks[0]);

    // ctx1: old=10, new=10
    assert.strictEqual(annotated[0].oldLine, 10);
    assert.strictEqual(annotated[0].newLine, 10);

    // add1: old=null, new=11
    assert.strictEqual(annotated[1].oldLine, null);
    assert.strictEqual(annotated[1].newLine, 11);

    // del1: old=11, new=null
    assert.strictEqual(annotated[2].oldLine, 11);
    assert.strictEqual(annotated[2].newLine, null);

    // ctx2: old=12, new=12
    assert.strictEqual(annotated[3].oldLine, 12);
    assert.strictEqual(annotated[3].newLine, 12);

    // add2: old=null, new=13
    assert.strictEqual(annotated[4].oldLine, null);
    assert.strictEqual(annotated[4].newLine, 13);
  });
});
