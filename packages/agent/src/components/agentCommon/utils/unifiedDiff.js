'use strict';

/**
 * Unified diff parser — parses `git diff --unified=3` output into structured data.
 *
 * Single source of truth for unified diff parsing in the agent frontend.
 * ClaudeCode, CodeX, and the shared GitChangesDrawer all route through this.
 *
 * Format:
 *   diff --git a/path b/path
 *   index ... ...
 *   --- a/path
 *   +++ b/path
 *   @@ -oldStart,oldCount +newStart,newCount @@ context
 *    unchanged
 *   +added
 *   -removed
 *   \ No newline at end of file
 *
 * Returns:
 *   { files: [{ filePath, hunks: [{ header, lines: [{ type, text }] }] }] }
 *
 * Ownership:
 *   - agentCommon/utils/unifiedDiff.js — pure renderer-side parser
 *   - No side effects. No DOM access. No provider dependency.
 */

/**
 * @typedef {Object} DiffLine
 * @property {'ctx'|'add'|'del'} type
 * @property {string} text
 */

/**
 * @typedef {Object} DiffHunk
 * @property {string} header  — "@@ -1,5 +1,6 @@"
 * @property {DiffLine[]} lines
 */

/**
 * @typedef {Object} DiffFile
 * @property {string} filePath
 * @property {'add'|'delete'|'modify'|'rename'|'binary'} changeType
 * @property {DiffHunk[]} hunks
 * @property {boolean} binary
 * @property {boolean} isNewFile
 * @property {boolean} isDeletedFile
 */

/**
 * Parse a unified diff string into structured file-level data.
 *
 * @param {string} raw — raw `git diff --unified=3` output
 * @returns {DiffFile[]}
 */
export function parseUnifiedDiff(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return [];

  const files = [];
  const lines = raw.split('\n');

  let i = 0;
  let currentFile = null;
  let currentHunk = null;

  while (i < lines.length) {
    const line = lines[i];

    // ── File header: "diff --git a/... b/..." ──
    if (line.startsWith('diff --git ')) {
      // Finalize previous file
      if (currentFile) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
          currentHunk = null;
        }
        files.push(currentFile);
      }

      const match = line.match(/^diff --git a\/(.*?) b\/(.*?)$/);
      const filePath = match ? match[2] : '';

      currentFile = {
        filePath,
        changeType: 'modify',
        hunks: [],
        binary: false,
        isNewFile: false,
        isDeletedFile: false,
      };
      i++;
      continue;
    }

    // No current file yet — skip preamble
    if (!currentFile) {
      i++;
      continue;
    }

    // ── Index line: "index abc..def 100644" ──
    if (line.startsWith('index ')) {
      i++;
      continue;
    }

    // ── File type markers ──
    if (line === 'new file mode 100644' || line === 'new file mode 100755') {
      currentFile.isNewFile = true;
      currentFile.changeType = 'add';
      i++;
      continue;
    }
    if (line === 'deleted file mode 100644' || line === 'deleted file mode 100755') {
      currentFile.isDeletedFile = true;
      currentFile.changeType = 'delete';
      i++;
      continue;
    }
    if (line.startsWith('rename from ') || line.startsWith('rename to ') ||
        line.startsWith('copy from ') || line.startsWith('copy to ')) {
      if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
        currentFile.changeType = line.startsWith('rename') ? 'rename' : 'modify';
      }
      i++;
      continue;
    }

    // ── "--- a/path" / "+++ b/path" ──
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      if (line.startsWith('--- /dev/null') || line === '--- /dev/null') {
        currentFile.isNewFile = true;
        currentFile.changeType = 'add';
      }
      if (line.startsWith('+++ /dev/null') || line === '+++ /dev/null') {
        currentFile.isDeletedFile = true;
        currentFile.changeType = 'delete';
      }
      i++;
      continue;
    }

    // ── Binary files ──
    if (line.startsWith('Binary files ') && line.includes(' differ')) {
      currentFile.binary = true;
      currentFile.changeType = 'binary';
      i++;
      continue;
    }

    // ── Hunk header: "@@ -1,5 +1,6 @@" ──
    if (line.startsWith('@@')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        header: line,
        lines: [],
      };
      i++;
      continue;
    }

    // ── Hunk lines: " context" / "+added" / "-removed" ──
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', text: line.slice(1) });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'del', text: line.slice(1) });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'ctx', text: line.slice(1) });
      }
      // Skip: empty strings (trailing newline artifact), "\ No newline at end of file"
      i++;
      continue;
    }

    i++;
  }

  // Finalize last file
  if (currentFile) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Parse a single file's diff (use when you already know it's one file).
 *
 * @param {string} raw — `git diff -- <single-file>` output
 * @returns {DiffFile|null}
 */
export function parseSingleFileDiff(raw) {
  const files = parseUnifiedDiff(raw);
  return files.length > 0 ? files[0] : null;
}

/**
 * Count total additions and deletions across all files.
 *
 * @param {DiffFile[]} files
 * @returns {{ additions: number, deletions: number }}
 */
export function countDiffStats(files) {
  let additions = 0;
  let deletions = 0;

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') additions++;
        else if (line.type === 'del') deletions++;
      }
    }
  }

  return { additions, deletions };
}

/**
 * Get formatted line ranges for a diff file.
 *
 * @param {DiffFile} file
 * @param {number} hunkIndex
 * @returns {{ oldStart: number, newStart: number }}
 */
export function getHunkRanges(file, hunkIndex) {
  const hunk = file.hunks[hunkIndex];
  if (!hunk) return { oldStart: 0, newStart: 0 };

  const match = hunk.header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return { oldStart: 0, newStart: 0 };

  return {
    oldStart: parseInt(match[1], 10),
    newStart: parseInt(match[2], 10),
  };
}

/**
 * Compute line numbers for each line in a hunk.
 * Each hunk has its own numbering starting from the header offsets.
 *
 * @param {DiffHunk} hunk
 * @returns {Array<{ type: string, text: string, oldLine: number|null, newLine: number|null }>}
 */
export function annotateHunkLines(hunk) {
  const ranges = hunk.header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  let oldLine = ranges ? parseInt(ranges[1], 10) : 1;
  let newLine = ranges ? parseInt(ranges[2], 10) : 1;

  return hunk.lines.map(line => {
    const annotated = { ...line, oldLine: null, newLine: null };
    if (line.type === 'ctx') {
      annotated.oldLine = oldLine++;
      annotated.newLine = newLine++;
    } else if (line.type === 'del') {
      annotated.oldLine = oldLine++;
    } else if (line.type === 'add') {
      annotated.newLine = newLine++;
    }
    return annotated;
  });
}
