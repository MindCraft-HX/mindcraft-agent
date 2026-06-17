const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const DEFAULT_MAX_DIFF_LINES = 400
const DEFAULT_MAX_NEW_FILE_BYTES = 256 * 1024

function trimUnifiedDiff(diffText, maxLines = DEFAULT_MAX_DIFF_LINES) {
  const text = String(diffText || '')
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  const head = lines.slice(0, maxLines).join('\n')
  return `${head}\n... (diff truncated, ${lines.length - maxLines} more lines)`
}

function resolveProjectRelativePath(cwd, candidatePath) {
  const raw = String(candidatePath || '').trim()
  if (!raw || !cwd) return ''
  const root = path.resolve(cwd)
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw)
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
  return rel.split(path.sep).join('/')
}

function runGit(cwd, args, { execFileSyncImpl = execFileSync, timeout = 5000 } = {}) {
  return execFileSyncImpl('git', args, {
    cwd: path.resolve(cwd),
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function readGitDiffForPath(cwd, candidatePath, opts = {}) {
  const rel = resolveProjectRelativePath(cwd, candidatePath)
  if (!rel) return ''
  try {
    const unstaged = runGit(cwd, ['diff', '--', rel], opts)
    if (unstaged) return trimUnifiedDiff(unstaged, opts.maxDiffLines)
  } catch (_) {}
  try {
    const staged = runGit(cwd, ['diff', '--cached', '--', rel], opts)
    if (staged) return trimUnifiedDiff(staged, opts.maxDiffLines)
  } catch (_) {}
  return ''
}

function isGitIgnored(cwd, relPath, opts = {}) {
  try {
    runGit(cwd, ['check-ignore', '-q', '--', relPath], opts)
    return true
  } catch (err) {
    return false
  }
}

function isGitTracked(cwd, relPath, opts = {}) {
  try {
    runGit(cwd, ['ls-files', '--error-unmatch', '--', relPath], opts)
    return true
  } catch (_) {
    return false
  }
}

function isTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return false
  if (!buffer.length) return true
  if (buffer.includes(0)) return false
  let suspicious = 0
  for (const byte of buffer) {
    const isControl = byte < 32 && ![9, 10, 13].includes(byte)
    if (isControl) suspicious += 1
  }
  return suspicious / buffer.length < 0.02
}

function buildNewFileUnifiedDiff(relPath, text, maxLines = DEFAULT_MAX_DIFF_LINES) {
  const normalizedRel = String(relPath || '').split(path.sep).join('/')
  const lines = String(text || '').split(/\r?\n/)
  const bodyLineCount = lines.length === 1 && lines[0] === '' ? 0 : lines.length
  const body = bodyLineCount
    ? lines.map(line => `+${line}`).join('\n')
    : ''
  const diff = [
    `diff --git a/${normalizedRel} b/${normalizedRel}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${normalizedRel}`,
    `@@ -0,0 +1,${bodyLineCount} @@`,
    body,
  ].filter(Boolean).join('\n')
  return trimUnifiedDiff(diff, maxLines)
}

function readNewTextFileDiff(cwd, candidatePath, opts = {}) {
  const rel = resolveProjectRelativePath(cwd, candidatePath)
  if (!rel) return { diff: '', reason: 'outside_workspace' }
  if (isGitIgnored(cwd, rel, opts)) return { diff: '', reason: 'ignored_file' }
  if (isGitTracked(cwd, rel, opts)) return { diff: '', reason: 'tracked_without_diff' }

  const abs = path.resolve(cwd, rel)
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (_) {
    return { diff: '', reason: 'file_missing' }
  }
  if (!stat.isFile()) return { diff: '', reason: 'not_file' }

  const maxBytes = opts.maxNewFileBytes || DEFAULT_MAX_NEW_FILE_BYTES
  if (stat.size > maxBytes) return { diff: '', reason: 'file_too_large' }

  let buffer
  try {
    buffer = fs.readFileSync(abs)
  } catch (_) {
    return { diff: '', reason: 'read_failed' }
  }
  if (!isTextBuffer(buffer)) return { diff: '', reason: 'binary_file' }

  return {
    diff: buildNewFileUnifiedDiff(rel, buffer.toString('utf8'), opts.maxDiffLines),
    reason: '',
  }
}

function normalizeFileChangePreview(change, cwd, opts = {}) {
  if (!change || typeof change !== 'object') return change
  if (change.unified_diff) return change

  const gitDiff = readGitDiffForPath(cwd, change.path, opts)
  if (gitDiff) return { ...change, unified_diff: gitDiff, _diffSource: 'git' }

  const { diff, reason } = readNewTextFileDiff(cwd, change.path, opts)
  if (diff) return { ...change, unified_diff: diff, _diffSource: 'new_file' }

  return { ...change, _noDiffReason: reason || 'no_diff_source' }
}

function normalizeFileChangeItemPreviews(item, cwd, opts = {}) {
  if (!item || item.type !== 'file_change' || !Array.isArray(item.changes) || !item.changes.length) return item
  const changes = item.changes.map(change => normalizeFileChangePreview(change, cwd, opts))
  return { ...item, changes }
}

module.exports = {
  DEFAULT_MAX_DIFF_LINES,
  DEFAULT_MAX_NEW_FILE_BYTES,
  trimUnifiedDiff,
  resolveProjectRelativePath,
  readGitDiffForPath,
  readNewTextFileDiff,
  buildNewFileUnifiedDiff,
  normalizeFileChangePreview,
  normalizeFileChangeItemPreviews,
  __test__: {
    isTextBuffer,
    isGitIgnored,
    isGitTracked,
  },
}
