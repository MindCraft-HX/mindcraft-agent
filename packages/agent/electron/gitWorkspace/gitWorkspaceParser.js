'use strict';

/**
 * Git workspace porcelain -z / numstat -z parser.
 *
 * Parses `git status --porcelain=v1 -z --untracked-files=all` output and
 * `git diff --numstat -z` output reliably, handling:
 *   - spaces, CJK, quotes, newlines in filenames (via NUL delimiter)
 *   - rename (R) and copy (C) with old→new paths
 *   - conflict (U) markers
 *   - binary files (-\t- in numstat)
 *
 * Ownership:
 *   - gitWorkspaceParser — low-level porcelain/numstat deserializer
 *   - No provider dependency.  No side effects.  Pure data transform.
 */

/**
 * @typedef {Object} PorcelainEntry
 * @property {string} id           — "staged\0src/a.js" (changeKind \0 relativePath)
 * @property {'staged'|'unstaged'|'untracked'} changeKind
 * @property {'M'|'A'|'D'|'R'|'C'|'U'|'??'} status
 * @property {string}  relativePath
 * @property {string}  oldRelativePath  — only populated for rename/copy
 */

/**
 * @param {string} xy
 * @param {string} path
 * @returns {PorcelainEntry[]}
 */
function classifyPorcelainEntries(xy, path) {
  const x = xy[0];
  const y = xy[1];

  // untracked
  if (xy === '??') {
    return [{
      id: 'untracked\0' + path,
      changeKind: 'untracked',
      status: '??',
      relativePath: path,
      oldRelativePath: '',
    }];
  }

  // ignored
  if (xy === '!!') return [];

  // conflict / unmerged — treat as single unstaged entry with status U
  if (isConflictXY(x, y)) {
    return [{
      id: 'unstaged\0' + path,
      changeKind: 'unstaged',
      status: 'U',
      relativePath: path,
      oldRelativePath: '',
    }];
  }

  const entries = [];

  // Index (staged) status — x indicates staged change
  if (x !== ' ' && x !== '?' && x !== '!') {
    entries.push({
      id: 'staged\0' + path,
      changeKind: 'staged',
      status: mapStatusCode(x),
      relativePath: path,
      oldRelativePath: '',
    });
  }

  // Worktree (unstaged) status — y indicates unstaged change
  if (y !== ' ' && y !== '?' && y !== '!') {
    entries.push({
      id: 'unstaged\0' + path,
      changeKind: 'unstaged',
      status: mapStatusCode(y),
      relativePath: path,
      oldRelativePath: '',
    });
  }

  return entries;
}

function isConflictXY(x, y) {
  // Unmerged states: DD, AU, UD, UA, DU, AA, UU
  return (x === 'D' && y === 'D') ||
         (x === 'A' && y === 'U') ||
         (x === 'U' && (y === 'D' || y === 'A' || y === 'U')) ||
         (x === 'D' && y === 'U') ||
         (x === 'A' && y === 'A');
}

function mapStatusCode(c) {
  if (c === 'M') return 'M';
  if (c === 'A') return 'A';
  if (c === 'D') return 'D';
  if (c === 'R') return 'R';
  if (c === 'C') return 'C';
  if (c === 'U') return 'U';
  if (c === '?') return '??';
  return 'M'; // fallback
}

// ── Modified parsePorcelainZ using classifyPorcelainEntries ──

/**
 * Parse `git status --porcelain=v1 -z` output.
 *
 * @param {string|null|undefined} raw
 * @returns {PorcelainEntry[]}
 */
function parsePorcelainZ(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const entries = [];
  const buf = Buffer.from(raw, 'utf8');

  let i = 0;
  while (i < buf.length) {
    if (i + 2 > buf.length) break;
    const x = String.fromCharCode(buf[i]);
    const y = String.fromCharCode(buf[i + 1]);
    const xy = x + y;
    i += 2;

    // Skip space between XY and path
    if (i < buf.length && buf[i] === 0x20) i++;

    // Read first path until NUL
    const path1Start = i;
    while (i < buf.length && buf[i] !== 0) i++;
    if (i > buf.length) break;
    const path1 = buf.slice(path1Start, i).toString('utf8');
    i++; // skip NUL

    // Classify
    const classified = classifyPorcelainEntries(xy, path1);

    for (const entry of classified) {
      // For rename/copy, read the second path
      if (entry.status === 'R' || entry.status === 'C') {
        const path2Start = i;
        while (i < buf.length && buf[i] !== 0) i++;
        const path2 = buf.slice(path2Start, i).toString('utf8');
        i++; // skip NUL

        entry.oldRelativePath = entry.relativePath;
        entry.relativePath = path2;
        entry.id = entry.changeKind + '\0' + path2;
      }
      entries.push(entry);
    }
  }

  return entries;
}

// ── Numstat parsing ──

/**
 * @typedef {Object} NumstatEntry
 * @property {string}  relativePath
 * @property {string}  oldRelativePath — only for rename/copy
 * @property {number|null} additions — null for binary
 * @property {number|null} deletions — null for binary
 * @property {boolean} binary
 */

/**
 * Parse `git diff --numstat -z` output.
 *
 * Format (NUL-terminated):
 *   "<add>\t<del>\t<path>\0"             — normal
 *   "<add>\t<del>\t<oldpath>\0<newpath>\0" — rename
 *   "-\t-\t<path>\0"                      — binary
 *
 * @param {string|null|undefined} raw
 * @returns {NumstatEntry[]}
 */
function parseNumstatZ(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const entries = [];
  const buf = Buffer.from(raw, 'utf8');

  let i = 0;
  while (i < buf.length) {
    // Read additions field until TAB
    const addStart = i;
    while (i < buf.length && buf[i] !== 0x09) i++; // 0x09 = TAB
    const addStr = buf.slice(addStart, i).toString('utf8');
    i++; // skip TAB

    // Read deletions field until TAB
    const delStart = i;
    while (i < buf.length && buf[i] !== 0x09) i++;
    const delStr = buf.slice(delStart, i).toString('utf8');
    i++; // skip TAB

    // Read path until NUL
    const pathStart = i;
    while (i < buf.length && buf[i] !== 0) i++;
    const path1 = buf.slice(pathStart, i).toString('utf8');
    i++; // skip NUL

    const isBinary = addStr === '-' && delStr === '-';

    const entry = {
      relativePath: path1,
      oldRelativePath: '',
      additions: isBinary ? null : parseInt(addStr, 10) || 0,
      deletions: isBinary ? null : parseInt(delStr, 10) || 0,
      binary: isBinary,
    };

    // After path1\0, peek to determine if there's a rename second path.
    // Numstat rename format:  add\tdel\toldPath\0newPath\0
    // Normal entry format:    add\tdel\tpath\0
    // Key difference: after path1\0, a new entry starts with <add>\t (digit/- then TAB),
    // while a rename has a second path (no TAB before next NUL).
    if (i < buf.length) {
      let peek = i;
      let foundTab = false;
      let foundNul = false;
      while (peek < buf.length && peek - i < 1024) {
        if (buf[peek] === 0) { foundNul = true; break; }
        if (buf[peek] === 0x09) { foundTab = true; break; }
        peek++;
      }
      if (foundNul && !foundTab) {
        // Second path exists (rename/copy)
        const path2Start = i;
        while (i < buf.length && buf[i] !== 0) i++;
        const path2 = buf.slice(path2Start, i).toString('utf8');
        i++; // skip NUL
        entry.oldRelativePath = entry.relativePath;
        entry.relativePath = path2;
      }
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Merge numstat data into porcelain entries.
 *
 * Matches by relativePath.  When the same file appears in both staged
 * and unstaged, numstat entries are matched to the correct changeKind
 * by checking whether the numstat came from --cached or not.
 *
 * @param {PorcelainEntry[]} porcelainEntries
 * @param {NumstatEntry[]} stagedNumstats    — from git diff --cached --numstat -z
 * @param {NumstatEntry[]} unstagedNumstats  — from git diff --numstat -z
 * @returns {PorcelainEntry[]} entries with additions/deletions/binary populated
 */
function mergeNumstats(porcelainEntries, stagedNumstats, unstagedNumstats) {
  const stagedMap = new Map();
  for (const n of stagedNumstats) stagedMap.set(n.relativePath, n);

  const unstagedMap = new Map();
  for (const n of unstagedNumstats) unstagedMap.set(n.relativePath, n);

  return porcelainEntries.map(entry => {
    const numstat = entry.changeKind === 'staged'
      ? stagedMap.get(entry.relativePath)
      : unstagedMap.get(entry.relativePath);

    if (numstat) {
      return {
        ...entry,
        additions: numstat.additions,
        deletions: numstat.deletions,
        binary: numstat.binary,
      };
    }

    // Untracked files: no numstat available, leave as null
    return {
      ...entry,
      additions: null,
      deletions: null,
      binary: false,
    };
  });
}

module.exports = {
  parsePorcelainZ,
  parseNumstatZ,
  mergeNumstats,
  classifyPorcelainEntries,
  isConflictXY,
  mapStatusCode,
};
