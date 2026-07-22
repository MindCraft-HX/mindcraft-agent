const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const RG_VERSION_ARGS = ['--version']
const DEFAULT_MAX_RESULTS = 200
const DEFAULT_FILE_ENUM_LIMIT = 5000

let cachedCapability = null

function getBundledRgPath() {
  const platformDir = {
    win32: path.join('win-x64', 'rg.exe'),
    darwin: path.join(`darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'rg'),
  }[process.platform]
  if (!platformDir) return ''
  const appRoot = path.resolve(__dirname, '..', '..')
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'tools', 'rg', platformDir) : '',
    path.join(appRoot, 'tools', 'rg', platformDir),
  ]
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || ''
}

function readExecutableVersion(executablePath, args = RG_VERSION_ARGS) {
  if (!executablePath || !fs.existsSync(executablePath)) return ''
  try {
    const output = execFileSync(executablePath, args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    const match = output.match(/ripgrep\s+([^\s]+)/i)
    return match ? match[1] : output
  } catch (_) {
    return ''
  }
}

function probeBundledRg() {
  const executablePath = getBundledRgPath()
  const version = readExecutableVersion(executablePath)
  return {
    available: Boolean(executablePath && version),
    path: executablePath,
    version,
  }
}

function resolveWhereCommand(binaryName) {
  return process.platform === 'win32'
    ? { cmd: 'where.exe', args: [binaryName] }
    : { cmd: 'which', args: [binaryName] }
}

function getSystemRgPath() {
  try {
    const { cmd, args } = resolveWhereCommand('rg')
    const output = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    const line = output.split(/\r?\n/).map(item => item.trim()).find(Boolean)
    return line || ''
  } catch (_) {
    return ''
  }
}

function probeSystemRg() {
  const executablePath = getSystemRgPath()
  const version = readExecutableVersion(executablePath)
  return {
    available: Boolean(executablePath && version),
    path: executablePath,
    version,
  }
}

function probePowerShell() {
  if (process.platform !== 'win32') return { available: false, source: '' }
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { available: true, source: 'powershell.exe' }
  } catch (_) {
    return { available: false, source: '' }
  }
}

/** 探测系统 find+grep（macOS/Linux 后备搜索方案） */
function probeSystemFindGrep() {
  if (process.platform === 'win32') return { available: false, source: '' }
  try {
    const { cmd } = resolveWhereCommand('grep')
    execFileSync(cmd, ['--version'], {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { available: true, source: 'find+grep' }
  } catch (_) {
    return { available: false, source: '' }
  }
}

/** 使用 find+grep 执行文本搜索（macOS/Linux 后备） */
function runFindGrepTextSearch(options = {}) {
  const resolvedCwd = path.resolve(options.cwd || process.cwd())
  const pattern = String(options.query || '')
  const maxResults = Number.isFinite(options.maxResults) ? options.maxResults : DEFAULT_MAX_RESULTS
  const stdout = execFileSync('grep', [
    '-r', '-n', '--ignore-case',
    pattern,
    '.',
  ], {
    cwd: resolvedCwd,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const lines = String(stdout || '').split(/\r?\n/).filter(Boolean)
  const results = lines.slice(0, maxResults).map(line => {
    const firstColon = line.indexOf(':')
    if (firstColon < 0) return null
    const secondColon = line.indexOf(':', firstColon + 1)
    if (secondColon < 0) return null
    return {
      filePath: path.resolve(resolvedCwd, line.slice(0, firstColon)),
      line: parseInt(line.slice(firstColon + 1, secondColon), 10) || 0,
      column: 1,
      text: line.slice(secondColon + 1),
    }
  }).filter(Boolean)
  return { results, truncated: lines.length > maxResults }
}

/** 使用 find 枚举文件（macOS/Linux 后备） */
function runMainFindFiles(options = {}) {
  const resolvedCwd = path.resolve(options.cwd || process.cwd())
  const maxResults = Number.isFinite(options.maxResults) ? options.maxResults : DEFAULT_FILE_ENUM_LIMIT
  const stdout = execFileSync('find', ['.', '-type', 'f'], {
    cwd: resolvedCwd,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const allFiles = String(stdout || '').split(/\r?\n/).map(f => f.trim()).filter(Boolean)
  const files = allFiles.map(f => f.startsWith('./') ? f.slice(2) : f)
  return {
    files: files.slice(0, maxResults),
    truncated: files.length > maxResults,
  }
}

function pickSearchBackend(state) {
  if (state?.bundled?.available) {
    return {
      available: true,
      backend: 'bundled-rg',
      version: state.bundled.version || '',
      source: state.bundled.path || '',
      fallbackAvailable: Boolean(state?.findGrep?.available || state?.powershell?.available),
    }
  }
  if (state?.system?.available) {
    return {
      available: true,
      backend: 'system-rg',
      version: state.system.version || '',
      source: state.system.path || '',
      fallbackAvailable: Boolean(state?.findGrep?.available || state?.powershell?.available),
    }
  }
  if (state?.findGrep?.available) {
    return {
      available: true,
      backend: 'system-find',
      version: '',
      source: 'find+grep',
      fallbackAvailable: Boolean(state?.powershell?.available),
    }
  }
  return {
    available: Boolean(state?.powershell?.available),
    backend: 'powershell',
    version: '',
    source: state?.powershell?.source || 'powershell',
    fallbackAvailable: Boolean(state?.powershell?.available),
  }
}

function detectLocalSearchBackend() {
  const state = {
    bundled: probeBundledRg(),
    system: probeSystemRg(),
    findGrep: probeSystemFindGrep(),
    powershell: probePowerShell(),
  }
  return pickSearchBackend(state)
}

function getLocalSearchCapability(forceRefresh = false) {
  if (!forceRefresh && cachedCapability) return cachedCapability
  cachedCapability = detectLocalSearchBackend()
  return cachedCapability
}

function prependToolDirToEnvPath(env = {}, toolDir = '') {
  const next = { ...env }
  const existingValue = String(next.PATH || next.Path || '')
  const existingItems = existingValue ? existingValue.split(path.delimiter).filter(Boolean) : []
  const normalizedToolDir = String(toolDir || '').trim()
  const filteredItems = normalizedToolDir
    ? existingItems.filter(item => item.toLowerCase() !== normalizedToolDir.toLowerCase())
    : existingItems
  const mergedItems = normalizedToolDir ? [normalizedToolDir, ...filteredItems] : filteredItems
  next.PATH = mergedItems.join(path.delimiter)
  next.Path = next.PATH
  return next
}

function augmentEnvWithBundledRg(env = {}) {
  const bundledPath = getBundledRgPath()
  if (!bundledPath) return { ...env }
  return prependToolDirToEnvPath(env, path.dirname(bundledPath))
}

function normalizeRgLines(results = [], maxResults = DEFAULT_MAX_RESULTS) {
  const normalizedResults = Array.isArray(results) ? results : []
  const limit = Number.isFinite(maxResults) ? maxResults : Infinity
  return {
    results: Number.isFinite(limit) ? normalizedResults.slice(0, limit) : normalizedResults.slice(),
    truncated: Number.isFinite(limit) ? normalizedResults.length > limit : false,
  }
}

function normalizeQueryPath(query = '') {
  return String(query || '').replace(/\\/g, '/')
}

function splitQueryPath(query = '') {
  const normalized = normalizeQueryPath(query)
  if (normalized.endsWith('/')) {
    return {
      baseDir: normalized.slice(0, -1),
      prefix: '',
    }
  }
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) {
    return {
      baseDir: '',
      prefix: normalized,
    }
  }
  return {
    baseDir: normalized.slice(0, idx),
    prefix: normalized.slice(idx + 1),
  }
}

function sortSuggestedPaths(a = '', b = '') {
  const aHidden = path.basename(a).startsWith('.')
  const bHidden = path.basename(b).startsWith('.')
  if (aHidden !== bHidden) return aHidden ? 1 : -1
  const aDir = a.endsWith('/')
  const bDir = b.endsWith('/')
  if (aDir !== bDir) return aDir ? -1 : 1
  return a.localeCompare(b)
}

function suggestFilePaths(files = [], query = '', maxResults = 10) {
  const normalizedFiles = Array.isArray(files)
    ? files.map(item => normalizeQueryPath(item)).filter(Boolean)
    : []
  const { baseDir, prefix } = splitQueryPath(query)
  const lowerPrefix = String(prefix || '').toLowerCase()
  const suggestionSet = new Set()

  for (const filePath of normalizedFiles) {
    const relative = baseDir
      ? (filePath.startsWith(`${baseDir}/`) ? filePath.slice(baseDir.length + 1) : '')
      : filePath
    if (!relative) continue

    const slashIdx = relative.indexOf('/')
    const candidate = slashIdx >= 0
      ? `${baseDir ? `${baseDir}/` : ''}${relative.slice(0, slashIdx)}/`
      : `${baseDir ? `${baseDir}/` : ''}${relative}`
    const candidateName = slashIdx >= 0 ? relative.slice(0, slashIdx) : relative
    if (!candidateName.toLowerCase().startsWith(lowerPrefix)) continue
    suggestionSet.add(candidate)
  }

  const sorted = [...suggestionSet].sort(sortSuggestedPaths)
  const limit = Number.isFinite(maxResults) && maxResults > 0 ? Number(maxResults) : 10
  return sorted.slice(0, limit)
}

function buildRgArgs({ query = '', globs = [], hidden = false, caseSensitive = false, maxResults = DEFAULT_MAX_RESULTS } = {}) {
  const args = ['--json', '--line-number', '--column']
  if (hidden) args.push('--hidden')
  if (caseSensitive) args.push('--case-sensitive')
  for (const glob of Array.isArray(globs) ? globs : []) {
    if (glob) args.push('-g', glob)
  }
  if (Number.isFinite(maxResults) && maxResults > 0) args.push('-m', String(maxResults))
  args.push(query || '')
  args.push('.')
  return args
}

function parseRgJsonOutput(output = '') {
  const results = []
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    if (!rawLine.trim()) continue
    try {
      const row = JSON.parse(rawLine)
      if (row.type !== 'match') continue
      const filePath = row.data?.path?.text || ''
      const line = row.data?.line_number || 0
      const submatch = Array.isArray(row.data?.submatches) ? row.data.submatches[0] : null
      const column = (submatch?.start ?? 0) + 1
      const text = String(row.data?.lines?.text || '').replace(/\r?\n$/, '')
      results.push({ filePath, line, column, text })
    } catch (_) {}
  }
  return results
}

function runRgTextSearch(executablePath, options = {}) {
  const args = buildRgArgs(options)
  const output = execFileSync(executablePath, args, {
    cwd: path.resolve(options.cwd || process.cwd()),
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return normalizeRgLines(parseRgJsonOutput(output), options.maxResults)
}

function runPowerShellTextSearch(options = {}) {
  const resolvedCwd = path.resolve(options.cwd || process.cwd())
  const pattern = String(options.query || '')
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `$root = ${JSON.stringify(resolvedCwd)}`,
    `$pattern = ${JSON.stringify(pattern)}`,
    `$limit = ${Number.isFinite(options.maxResults) ? Number(options.maxResults) : DEFAULT_MAX_RESULTS}`,
    `$items = Select-String -Path (Join-Path $root '*') -Pattern $pattern -SimpleMatch -Recurse -ErrorAction SilentlyContinue | Select-Object -First $limit`,
    `$items | ForEach-Object { [PSCustomObject]@{ filePath = $_.Path; line = $_.LineNumber; column = $_.Matches[0].Index + 1; text = $_.Line } } | ConvertTo-Json -Compress`,
  ].join('; ')
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    cwd: resolvedCwd,
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

  if (!output) return { results: [], truncated: false }
  const parsed = JSON.parse(output)
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return normalizeRgLines(list.map(item => ({
    filePath: item.filePath,
    line: item.line,
    column: item.column,
    text: item.text,
  })), options.maxResults)
}

function buildSearchError(message, backend, command, error, fallbackUsed = false) {
  return {
    ok: false,
    backend,
    fallbackUsed,
    results: [],
    truncated: false,
    error: {
      message,
      command,
      exitCode: typeof error?.status === 'number' ? error.status : null,
      stderr: String(error?.stderr || error?.message || ''),
    },
  }
}

function searchText(options = {}) {
  const capability = getLocalSearchCapability()
  const searchOptions = { ...options, hidden: true }
  try {
    if (capability.backend === 'bundled-rg' || capability.backend === 'system-rg') {
      const { results, truncated } = runRgTextSearch(capability.source, searchOptions)
      return {
        ok: true,
        backend: capability.backend,
        fallbackUsed: false,
        results,
        truncated,
        error: null,
      }
    }
    if (capability.backend === 'system-find') {
      const { results, truncated } = runFindGrepTextSearch(searchOptions)
      return {
        ok: true,
        backend: 'system-find',
        fallbackUsed: true,
        results,
        truncated,
        error: null,
      }
    }
    const { results, truncated } = runPowerShellTextSearch(searchOptions)
    return {
      ok: true,
      backend: 'powershell',
      fallbackUsed: true,
      results,
      truncated,
      error: null,
    }
  } catch (error) {
    const command = capability.backend === 'powershell' ? 'powershell.exe' : capability.source
    return buildSearchError('search failed', capability.backend, command, error, capability.backend !== 'bundled-rg')
  }
}

function buildRgFilesArgs({ globs = [], hidden = false } = {}) {
  const args = ['--files']
  if (hidden) args.push('--hidden')
  for (const glob of Array.isArray(globs) ? globs : []) {
    if (glob) args.push('-g', glob)
  }
  return args
}

function runRgFiles(executablePath, options = {}) {
  const output = execFileSync(executablePath, buildRgFilesArgs(options), {
    cwd: path.resolve(options.cwd || process.cwd()),
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const lines = String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const limit = Number.isFinite(options.maxResults) ? Number(options.maxResults) : DEFAULT_MAX_RESULTS
  return {
    files: Number.isFinite(limit) ? lines.slice(0, limit) : lines,
    truncated: Number.isFinite(limit) ? lines.length > limit : false,
  }
}

function resolveFileEnumLimit(options = {}) {
  const requested = Number(options.fileEnumLimit)
  if (Number.isFinite(requested) && requested > 0) return requested
  return DEFAULT_FILE_ENUM_LIMIT
}

function runPowerShellFiles(options = {}) {
  const resolvedCwd = path.resolve(options.cwd || process.cwd())
  const limit = Number.isFinite(options.maxResults) ? Number(options.maxResults) : DEFAULT_MAX_RESULTS
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `$root = ${JSON.stringify(resolvedCwd)}`,
    `$limit = ${limit}`,
    `Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue | Select-Object -First $limit -ExpandProperty FullName | ConvertTo-Json -Compress`,
  ].join('; ')
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    cwd: resolvedCwd,
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (!output) return { files: [], truncated: false }
  const parsed = JSON.parse(output)
  const files = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean)
  return {
    files,
    truncated: files.length >= limit,
  }
}

function listFiles(options = {}) {
  const capability = getLocalSearchCapability()
  const enumLimit = resolveFileEnumLimit(options)
  const fileOptions = {
    ...options,
    maxResults: enumLimit,
    hidden: true,
  }
  const suggestionLimit = Number.isFinite(options.maxResults) && options.maxResults > 0
    ? Number(options.maxResults)
    : 10
  try {
    if (capability.backend === 'bundled-rg' || capability.backend === 'system-rg') {
      const { files, truncated } = runRgFiles(capability.source, fileOptions)
      const suggestions = suggestFilePaths(files, options.query || '', suggestionLimit)
      return {
        ok: true,
        backend: capability.backend,
        fallbackUsed: false,
        files,
        suggestions,
        truncated,
        error: null,
      }
    }
    if (capability.backend === 'system-find') {
      const { files, truncated } = runMainFindFiles(fileOptions)
      const suggestions = suggestFilePaths(files, options.query || '', suggestionLimit)
      return {
        ok: true,
        backend: 'system-find',
        fallbackUsed: true,
        files,
        suggestions,
        truncated,
        error: null,
      }
    }
    const { files, truncated } = runPowerShellFiles(fileOptions)
    const suggestions = suggestFilePaths(files, options.query || '', suggestionLimit)
    return {
      ok: true,
      backend: 'powershell',
      fallbackUsed: true,
      files,
      suggestions,
      truncated,
      error: null,
    }
  } catch (error) {
    const command = capability.backend === 'powershell' ? 'powershell.exe' : capability.source
    return {
      ok: false,
      backend: capability.backend,
      fallbackUsed: capability.backend !== 'bundled-rg',
      files: [],
      suggestions: [],
      truncated: false,
      error: {
        message: 'list files failed',
        command,
        exitCode: typeof error?.status === 'number' ? error.status : null,
        stderr: String(error?.stderr || error?.message || ''),
      },
    }
  }
}

module.exports = {
  getBundledRgPath,
  getSystemRgPath,
  detectLocalSearchBackend,
  getLocalSearchCapability,
  augmentEnvWithBundledRg,
  searchText,
  listFiles,
  __test__: {
    pickSearchBackend,
    prependToolDirToEnvPath,
    normalizeRgLines,
    suggestFilePaths,
  },
}
