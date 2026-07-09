const fs = require('fs')
const path = require('path')
const { execFileSync, execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const DEFAULT_MAX_DIFF_LINES = 400
const DEFAULT_MAX_NEW_FILE_BYTES = 256 * 1024
const DEFAULT_GIT_TIMEOUT_MS = 1000
const DEFAULT_MAX_PREVIEW_CHANGES = 8

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

function runGit(cwd, args, { execFileSyncImpl = execFileSync, timeout = DEFAULT_GIT_TIMEOUT_MS } = {}) {
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
  const maxPreviewChanges = Number.isFinite(Number(opts.maxPreviewChanges))
    ? Math.max(0, Number(opts.maxPreviewChanges))
    : DEFAULT_MAX_PREVIEW_CHANGES
  const changes = item.changes.map((change, index) => {
    if (index >= maxPreviewChanges && !change?.unified_diff) {
      return { ...change, _noDiffReason: 'preview_limit' }
    }
    return normalizeFileChangePreview(change, cwd, opts)
  })
  return { ...item, changes }
}

// ── P0: 异步 preview（非阻塞，用于 streaming 热路径） ──

async function runGitAsync(cwd, args, timeout = DEFAULT_GIT_TIMEOUT_MS) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: path.resolve(cwd),
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return stdout
  } catch (_) {
    return null
  }
}

async function generateSinglePreviewAsync(change, cwd, timeout) {
  if (change.unified_diff) return change
  if (change._noDiffReason) return change

  const rel = resolveProjectRelativePath(cwd, change.path)
  if (!rel) return { ...change, _noDiffReason: 'outside_workspace' }

  // Try unstaged diff
  const unstaged = await runGitAsync(cwd, ['diff', '--', rel], timeout)
  if (unstaged) return { ...change, unified_diff: trimUnifiedDiff(unstaged), _diffSource: 'git' }

  // Try staged diff
  const staged = await runGitAsync(cwd, ['diff', '--cached', '--', rel], timeout)
  if (staged) return { ...change, unified_diff: trimUnifiedDiff(staged), _diffSource: 'git' }

  // Check if git-ignored
  const ignored = await runGitAsync(cwd, ['check-ignore', '-q', '--', rel], timeout)
  if (ignored !== null) return { ...change, _noDiffReason: 'ignored_file' }

  // Check if tracked (tracked but no diff → no changes)
  const tracked = await runGitAsync(cwd, ['ls-files', '--error-unmatch', '--', rel], timeout)
  if (tracked !== null) return { ...change, _noDiffReason: 'tracked_without_diff' }

  // New untracked file
  const abs = path.resolve(cwd, rel)
  try {
    const stat = fs.statSync(abs)
    if (!stat.isFile()) return { ...change, _noDiffReason: 'not_file' }
    if (stat.size > DEFAULT_MAX_NEW_FILE_BYTES) return { ...change, _noDiffReason: 'file_too_large' }

    const buffer = fs.readFileSync(abs)
    if (!isTextBuffer(buffer)) return { ...change, _noDiffReason: 'binary_file' }

    const diff = buildNewFileUnifiedDiff(rel, buffer.toString('utf8'))
    return { ...change, unified_diff: diff, _diffSource: 'new_file' }
  } catch (_) {
    return { ...change, _noDiffReason: 'file_missing' }
  }
}

/**
 * P0: 异步生成 file_change 的 diff preview，不阻塞主进程 event loop。
 *
 * - 最多 maxConcurrent 个文件并发
 * - 单文件 perFileTimeout ms 超时 → _noDiffReason: 'preview_timeout'
 * - 已有 unified_diff 或 _noDiffReason 的 change 跳过
 *
 * @param {Array} changes file_change item 的 changes 数组
 * @param {string} cwd
 * @param {{ maxConcurrent?: number, perFileTimeout?: number }} [opts]
 * @returns {Promise<Array>} 富化后的 changes（保留原始 change 的所有字段）
 */
async function generateFileChangePreviewsAsync(changes, cwd, opts = {}) {
  if (!Array.isArray(changes) || !changes.length) return changes

  const maxConcurrent = opts.maxConcurrent || 2
  const perFileTimeout = opts.perFileTimeout || 500

  const enriched = [...changes]
  const pending = []
  for (let i = 0; i < changes.length; i++) {
    if (!changes[i].unified_diff && !changes[i]._noDiffReason) {
      pending.push(i)
    }
  }

  if (!pending.length) return enriched

  for (let b = 0; b < pending.length; b += maxConcurrent) {
    const batch = pending.slice(b, b + maxConcurrent)
    const tasks = batch.map(i => {
      const p = generateSinglePreviewAsync(changes[i], cwd, perFileTimeout)
      const timeoutP = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('preview_timeout')), perFileTimeout + 100)
      )
      return Promise.race([p, timeoutP]).catch(() => ({
        ...changes[i],
        _noDiffReason: 'preview_timeout',
      }))
    })
    const results = await Promise.all(tasks)
    for (let j = 0; j < batch.length; j++) {
      enriched[batch[j]] = results[j]
    }
  }

  return enriched
}

module.exports = {
  DEFAULT_GIT_TIMEOUT_MS,
  DEFAULT_MAX_DIFF_LINES,
  DEFAULT_MAX_NEW_FILE_BYTES,
  DEFAULT_MAX_PREVIEW_CHANGES,
  trimUnifiedDiff,
  resolveProjectRelativePath,
  readGitDiffForPath,
  readNewTextFileDiff,
  buildNewFileUnifiedDiff,
  normalizeFileChangePreview,
  normalizeFileChangeItemPreviews,
  generateFileChangePreviewsAsync,
  __test__: {
    isTextBuffer,
    isGitIgnored,
    isGitTracked,
  },
}
