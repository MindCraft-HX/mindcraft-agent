const fs = require('fs')
const path = require('path')

const { listFiles } = require('./localSearch')

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.log',
  '.js',
  '.cjs',
  '.mjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.json',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.xml',
  '.yml',
  '.yaml',
  '.py',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.sh',
  '.ps1',
  '.bat',
  '.cmd',
  '.sql',
  '.toml',
  '.ini',
  '.conf',
  '.env',
])

function normalizeCandidate(rawText = '') {
  return String(rawText || '')
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, '')
    .replace(/^file:\/\//i, '')
    .replace(/[)>.,;:]+$/g, '')
}

function isAbsoluteFilePath(value = '') {
  const candidate = String(value || '')
  // Windows 绝对路径 (D:\) / UNC (\\server) / Unix 绝对路径 (/home/...)
  return /^[a-zA-Z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\') || /^\/(?!\/)./.test(candidate)
}

function normalizeForSearch(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

function pickFallbackMatches(files = [], candidate = '') {
  const normalizedCandidate = normalizeForSearch(candidate).toLowerCase()
  if (!normalizedCandidate) return []
  return (Array.isArray(files) ? files : []).filter((file) => {
    const normalizedFile = normalizeForSearch(file).toLowerCase()
    return normalizedFile === normalizedCandidate || normalizedFile.endsWith(`/${normalizedCandidate}`)
  })
}

function toAbsoluteIfExists(candidatePath, pathExists) {
  if (!candidatePath) return ''
  const resolved = path.normalize(candidatePath)
  return pathExists(resolved) ? resolved : ''
}

function isPathInside(parent, child) {
  if (!parent || !child) return false
  const parentResolved = path.resolve(parent)
  const childResolved = path.resolve(child)
  const relative = path.relative(parentResolved, childResolved)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function realpathIfExists(filePath, realpath = fs.realpathSync.native) {
  try {
    return realpath(filePath)
  } catch (_) {
    return ''
  }
}

function isRealPathInside(parent, child, realpath = fs.realpathSync.native) {
  const parentReal = realpathIfExists(parent, realpath)
  const childReal = realpathIfExists(child, realpath)
  if (!parentReal || !childReal) return false
  return isPathInside(parentReal, childReal)
}

function isAgentMessageSource(source = '') {
  return String(source || '') === 'agent-message'
}

function isAgentAbsolutePathAllowed(filePath, workspaceRoot, cwd, realpath = fs.realpathSync.native) {
  return [workspaceRoot, cwd].some(base => base && isRealPathInside(base, filePath, realpath))
}

function joinIfPresent(baseDir, relativePath, pathExists) {
  if (!baseDir || !relativePath) return ''
  return toAbsoluteIfExists(path.resolve(baseDir, relativePath), pathExists)
}

async function resolveCandidatePath({
  rawText,
  workspaceRoot,
  cwd,
  pathExists = fs.existsSync,
  searchFiles = listFiles,
} = {}) {
  const candidate = normalizeCandidate(rawText)
  if (!candidate) {
    return { ok: false, reason: 'empty-candidate', matches: [] }
  }

  const absoluteCandidate = isAbsoluteFilePath(candidate)
    ? toAbsoluteIfExists(candidate, pathExists)
    : ''
  if (absoluteCandidate) {
    return {
      ok: true,
      filePath: absoluteCandidate,
      matchType: 'absolute',
      rawText: candidate,
    }
  }

  const workspaceCandidate = joinIfPresent(workspaceRoot, candidate, pathExists)
  if (workspaceCandidate) {
    return {
      ok: true,
      filePath: workspaceCandidate,
      matchType: 'workspace-relative',
      rawText: candidate,
    }
  }

  const cwdCandidate = joinIfPresent(cwd, candidate, pathExists)
  if (cwdCandidate) {
    return {
      ok: true,
      filePath: cwdCandidate,
      matchType: 'cwd-relative',
      rawText: candidate,
    }
  }

  const searchBase = workspaceRoot || cwd || process.cwd()
  let files = []
  try {
    const searchResult = await searchFiles({
      cwd: searchBase,
      query: normalizeForSearch(candidate),
      maxResults: 20,
    })
    files = pickFallbackMatches(searchResult?.files, candidate)
  } catch (_) {
    files = []
  }

  if (files.length === 1) {
    return {
      ok: true,
      filePath: path.resolve(searchBase, files[0]),
      matchType: 'rg-fallback',
      rawText: candidate,
    }
  }

  if (files.length > 1) {
    return {
      ok: false,
      reason: 'multiple-matches',
      matches: files,
      rawText: candidate,
    }
  }

  return {
    ok: false,
    reason: 'not-found',
    matches: [],
    rawText: candidate,
  }
}

function inferOpenMode(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'mdViewer'
  if (TEXT_EXTENSIONS.has(ext)) return 'textViewer'
  return 'system-default'
}

async function openDocumentCandidate({
  rawText,
  workspaceRoot,
  cwd,
  source = '',
  pathExists = fs.existsSync,
  searchFiles = listFiles,
  openMdPayload,
  openWithDefault,
  realpath = fs.realpathSync.native,
} = {}) {
  const resolved = await resolveCandidatePath({
    rawText,
    workspaceRoot,
    cwd,
    pathExists,
    searchFiles,
  })

  if (!resolved.ok) return resolved
  if (
    isAgentMessageSource(source) &&
    resolved.matchType === 'absolute' &&
    !isAgentAbsolutePathAllowed(resolved.filePath, workspaceRoot, cwd, realpath)
  ) {
    return {
      ok: false,
      reason: 'outside-workspace-absolute-path',
      filePath: resolved.filePath,
      matchType: resolved.matchType,
      rawText: resolved.rawText,
    }
  }

  const openMode = inferOpenMode(resolved.filePath)
  if (openMode === 'mdViewer' || openMode === 'textViewer') {
    if (typeof openMdPayload === 'function') {
      let size = 0
      try {
        const stat = pathExists(resolved.filePath) ? fs.statSync(resolved.filePath) : null
        size = stat?.size || 0
      } catch (_) {}
      await openMdPayload({
        name: path.basename(resolved.filePath),
        filePath: resolved.filePath,
        openMode,
        size,
        source: 'document-candidate',
      })
    }
    return {
      ok: true,
      filePath: resolved.filePath,
      matchType: resolved.matchType,
      openMode,
      rawText: resolved.rawText,
    }
  }

  const shellResult = typeof openWithDefault === 'function'
    ? await openWithDefault(resolved.filePath)
    : ''

  return {
    ok: !shellResult,
    filePath: resolved.filePath,
    matchType: resolved.matchType,
    openMode,
    shellResult: shellResult || '',
    rawText: resolved.rawText,
  }
}

module.exports = {
  resolveCandidatePath,
  inferOpenMode,
  openDocumentCandidate,
  __test__: {
    normalizeCandidate,
    isAbsoluteFilePath,
    isPathInside,
    isRealPathInside,
    isAgentAbsolutePathAllowed,
    resolveCandidatePath,
    inferOpenMode,
    pickFallbackMatches,
  },
}
