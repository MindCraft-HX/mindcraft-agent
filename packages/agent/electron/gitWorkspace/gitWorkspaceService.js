'use strict';

/**
 * Git workspace service — executes git commands and returns structured data.
 *
 * Responsibilities:
 *   - Validate repository
 *   - Run git status --porcelain=v1 -z
 *   - Run git diff --numstat -z (staged + unstaged)
 *   - Run single-file git diff
 *   - Path safety validation
 *   - Output truncation before IPC return
 *
 * Ownership:
 *   - gitWorkspaceService — business logic layer over raw git commands
 *   - No provider dependency (ClaudeCode/CodeX agnostic)
 *   - No filesystem side effects (pure read operations)
 */

const path = require('path');
const { execFile } = require('child_process');
const { parsePorcelainZ, parseNumstatZ, mergeNumstats } = require('./gitWorkspaceParser');

// ── Constants ──

const GIT_EXECUTABLE = 'git';
const DEFAULT_TIMEOUT = 15000;
const DIFF_MAX_LINES = 5000;
const DIFF_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// ── Helpers ──

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function nullDevice() {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}

// ── Error codes ──

const ERROR_CODES = {
  NO_CWD: 'NO_CWD',
  NOT_GIT_REPO: 'NOT_GIT_REPO',
  GIT_NOT_FOUND: 'GIT_NOT_FOUND',
  INVALID_PATH: 'INVALID_PATH',
  TIMEOUT: 'TIMEOUT',
  OUTPUT_TOO_LARGE: 'OUTPUT_TOO_LARGE',
  GIT_COMMAND_FAILED: 'GIT_COMMAND_FAILED',
};

// ── Public API ──

/**
 * Validate CWD is a git repository and return repo metadata.
 *
 * @param {string} cwd
 * @returns {Promise<{isGitRepo: boolean, repoRoot: string, branch: string, errorCode: string}>}
 */
async function validateRepo(cwd) {
  if (!cwd || typeof cwd !== 'string') {
    return { isGitRepo: false, repoRoot: '', branch: '', errorCode: ERROR_CODES.NO_CWD };
  }

  const resolvedCwd = path.resolve(cwd);

  // Check if inside a git work tree
  try {
    await execFileAsync(GIT_EXECUTABLE, ['rev-parse', '--is-inside-work-tree'], {
      cwd: resolvedCwd,
      timeout: 5000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { isGitRepo: false, repoRoot: '', branch: '', errorCode: ERROR_CODES.GIT_NOT_FOUND };
    }
    return { isGitRepo: false, repoRoot: '', branch: '', errorCode: ERROR_CODES.NOT_GIT_REPO };
  }

  // Get repo root
  let repoRoot = resolvedCwd;
  try {
    const result = await execFileAsync(GIT_EXECUTABLE, ['rev-parse', '--show-toplevel'], {
      cwd: resolvedCwd,
      timeout: 5000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    repoRoot = (result.stdout || '').trim();
  } catch (_) {}

  // Get branch
  let branch = '';
  try {
    const result = await execFileAsync(GIT_EXECUTABLE, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: resolvedCwd,
      timeout: 5000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    branch = (result.stdout || '').trim();
  } catch (_) {}

  return { isGitRepo: true, repoRoot, branch, errorCode: '' };
}

/**
 * Get workspace changes — lightweight file list from porcelain + numstat.
 *
 * @param {string} cwd
 * @returns {Promise<object>} — { isGitRepo, repoRoot, branch, entries, summary }
 */
async function getWorkspaceChanges(cwd) {
  const repo = await validateRepo(cwd);
  if (!repo.isGitRepo) {
    return {
      isGitRepo: false,
      repoRoot: '',
      branch: '',
      entries: [],
      summary: { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 },
      errorCode: repo.errorCode,
    };
  }

  const resolvedCwd = path.resolve(cwd);

  // Run porcelain -z
  let porcelainRaw = '';
  try {
    const result = await execFileAsync(GIT_EXECUTABLE, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: resolvedCwd,
      timeout: 10000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });
    porcelainRaw = result.stdout || '';
  } catch (e) {
    return {
      isGitRepo: true,
      repoRoot: repo.repoRoot,
      branch: repo.branch,
      entries: [],
      summary: { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 },
      errorCode: ERROR_CODES.GIT_COMMAND_FAILED,
    };
  }

  const entries = parsePorcelainZ(porcelainRaw);

  // Run unstaged numstat
  let unstagedNumstats = [];
  try {
    const result = await execFileAsync(GIT_EXECUTABLE, ['diff', '--numstat', '-z', '--no-ext-diff'], {
      cwd: resolvedCwd,
      timeout: 15000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });
    unstagedNumstats = parseNumstatZ(result.stdout || '');
  } catch (e) {
    // git diff exit 1 = has diffs; capture stdout
    if (e.stdout) {
      unstagedNumstats = parseNumstatZ(typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8'));
    }
  }

  // Run staged numstat
  let stagedNumstats = [];
  try {
    const result = await execFileAsync(GIT_EXECUTABLE, ['diff', '--cached', '--numstat', '-z', '--no-ext-diff'], {
      cwd: resolvedCwd,
      timeout: 15000,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });
    stagedNumstats = parseNumstatZ(result.stdout || '');
  } catch (e) {
    if (e.stdout) {
      stagedNumstats = parseNumstatZ(typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8'));
    }
  }

  // Merge numstats into entries
  const mergedEntries = mergeNumstats(entries, stagedNumstats, unstagedNumstats);

  // Compute summary with path dedup for totalFiles
  const stagedFiles = new Set();
  const unstagedFiles = new Set();
  const untrackedFiles = new Set();
  const allFiles = new Set();

  for (const e of mergedEntries) {
    if (e.changeKind === 'staged') stagedFiles.add(e.relativePath);
    if (e.changeKind === 'unstaged') unstagedFiles.add(e.relativePath);
    if (e.changeKind === 'untracked') untrackedFiles.add(e.relativePath);
    allFiles.add(e.relativePath);
  }

  // Enrich entries with absolutePath + canOpen
  const enrichedEntries = mergedEntries.map(e => ({
    ...e,
    absolutePath: path.join(repo.repoRoot, e.relativePath),
    canOpen: e.status !== 'D', // deleted files can't be opened
  }));

  return {
    isGitRepo: true,
    repoRoot: repo.repoRoot,
    branch: repo.branch,
    entries: enrichedEntries,
    summary: {
      staged: stagedFiles.size,
      unstaged: unstagedFiles.size,
      untracked: untrackedFiles.size,
      totalFiles: allFiles.size,
    },
    errorCode: '',
  };
}

/**
 * Resolve a relative path against repo root and validate it's within the repo.
 *
 * @param {string} repoRoot
 * @param {string} relativePath
 * @returns {{ valid: boolean, absolutePath: string, errorCode: string }}
 */
function resolveAndValidatePath(repoRoot, relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    return { valid: false, absolutePath: '', errorCode: ERROR_CODES.INVALID_PATH };
  }

  // Reject NUL characters
  if (relativePath.includes('\0')) {
    return { valid: false, absolutePath: '', errorCode: ERROR_CODES.INVALID_PATH };
  }

  const resolved = path.resolve(repoRoot, relativePath);

  // Ensure resolved path is within repo root
  const normalizedRepo = path.normalize(repoRoot) + path.sep;
  const normalizedResolved = path.normalize(resolved) + path.sep;

  if (!normalizedResolved.startsWith(normalizedRepo)) {
    return { valid: false, absolutePath: '', errorCode: ERROR_CODES.INVALID_PATH };
  }

  return { valid: true, absolutePath: resolved, errorCode: '' };
}

/**
 * Get diff for a single file.
 *
 * @param {string} cwd
 * @param {string} relativePath
 * @param {'staged'|'unstaged'|'untracked'} changeKind
 * @returns {Promise<object>}
 */
async function getFileDiff(cwd, relativePath, changeKind) {
  const repo = await validateRepo(cwd);
  if (!repo.isGitRepo) {
    return {
      relativePath,
      changeKind,
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      truncatedAtLines: null,
      errorCode: repo.errorCode,
    };
  }

  const resolved = resolveAndValidatePath(repo.repoRoot, relativePath);
  if (!resolved.valid) {
    return {
      relativePath,
      changeKind,
      diff: '',
      additions: 0,
      deletions: 0,
      binary: false,
      truncated: false,
      truncatedAtLines: null,
      errorCode: resolved.errorCode,
    };
  }

  const resolvedCwd = path.resolve(cwd);

  // Build command based on changeKind
  let args;
  if (changeKind === 'staged') {
    args = ['diff', '--cached', '--no-color', '--no-ext-diff', '--unified=3', '--', relativePath];
  } else if (changeKind === 'untracked') {
    args = ['diff', '--no-index', '--no-color', '--unified=3', '--', nullDevice(), resolved.absolutePath];
  } else {
    // unstaged
    args = ['diff', '--no-color', '--no-ext-diff', '--unified=3', '--', relativePath];
  }

  let stdout = '';
  try {
    const result = await execFileAsync(GIT_EXECUTABLE, args, {
      cwd: resolvedCwd,
      timeout: DEFAULT_TIMEOUT,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: DIFF_MAX_BYTES + 1024 * 1024, // allow some headroom
    });
    stdout = result.stdout || '';
  } catch (e) {
    // git diff exit 1 = has differences (normal)
    // git diff --no-index exit 1 = has differences (normal)
    if (e.stdout) {
      stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8');
    } else if (e.code === 'ENOENT') {
      return {
        relativePath,
        changeKind,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        truncatedAtLines: null,
        errorCode: ERROR_CODES.GIT_NOT_FOUND,
      };
    } else {
      return {
        relativePath,
        changeKind,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        truncatedAtLines: null,
        errorCode: ERROR_CODES.GIT_COMMAND_FAILED,
      };
    }
  }

  // Check if binary
  if (stdout.includes('Binary files ') && stdout.includes(' differ')) {
    return {
      relativePath,
      changeKind,
      diff: '',
      additions: null,
      deletions: null,
      binary: true,
      truncated: false,
      truncatedAtLines: null,
      errorCode: '',
    };
  }

  // Truncate if needed
  let truncated = false;
  let truncatedAtLines = null;

  // Check byte limit first
  const byteLen = Buffer.byteLength(stdout, 'utf8');
  if (byteLen > DIFF_MAX_BYTES) {
    // Truncate by bytes
    const buf = Buffer.from(stdout, 'utf8');
    const truncatedBuf = buf.slice(0, DIFF_MAX_BYTES);
    // Find last complete line
    let lastNewline = truncatedBuf.lastIndexOf(0x0a); // \n
    if (lastNewline === -1) lastNewline = truncatedBuf.length;
    stdout = truncatedBuf.slice(0, lastNewline).toString('utf8');
    truncated = true;
  }

  // Check line limit
  if (!truncated) {
    const lines = stdout.split('\n');
    if (lines.length > DIFF_MAX_LINES) {
      stdout = lines.slice(0, DIFF_MAX_LINES).join('\n');
      truncated = true;
      truncatedAtLines = DIFF_MAX_LINES;
    }
  } else {
    truncatedAtLines = stdout.split('\n').length;
  }

  // Count additions/deletions from the (possibly truncated) diff
  const lines = stdout.split('\n');
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  return {
    relativePath,
    changeKind,
    diff: stdout,
    additions,
    deletions,
    binary: false,
    truncated,
    truncatedAtLines,
    errorCode: '',
  };
}

module.exports = {
  validateRepo,
  getWorkspaceChanges,
  getFileDiff,
  resolveAndValidatePath,
  ERROR_CODES,
};
