const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)
const { CORE_CHANNELS } = require('../shared/ipcChannels')

const RG_VERSION_ARGS = ['--version']
const DEFAULT_MAX_RESULTS = 200
const DEFAULT_FILE_ENUM_LIMIT = 5000

let cachedCapability = null

function getBundledRgPath() {
  if (process.platform !== 'win32') return ''
  const appRoot = path.resolve(__dirname, '..', '..', '..')
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'tools', 'rg', 'win-x64', 'rg.exe') : '',
    path.join(appRoot, 'tools', 'rg', 'win-x64', 'rg.exe'),
  ]
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) || ''
}

async function readExecutableVersion(executablePath, args = RG_VERSION_ARGS) {
  if (!executablePath || !fs.existsSync(executablePath)) return ''
  try {
    const { stdout } = await execFileAsync(executablePath, args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const output = stdout.trim()
    const match = output.match(/ripgrep\s+([^\s]+)/i)
    return match ? match[1] : output
  } catch (_) {
    return ''
  }
}

async function probeBundledRg() {
  const executablePath = getBundledRgPath()
  const version = await readExecutableVersion(executablePath)
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

async function getSystemRgPath() {
  try {
    const { cmd, args } = resolveWhereCommand('rg')
    const { stdout } = await execFileAsync(cmd, args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const line = stdout.trim().split(/\r?\n/).map(item => item.trim()).find(Boolean)
    return line || ''
  } catch (_) {
    return ''
  }
}

async function probeSystemRg() {
  const executablePath = await getSystemRgPath()
  const version = await readExecutableVersion(executablePath)
  return {
    available: Boolean(executablePath && version),
    path: executablePath,
    version,
  }
}

async function probePowerShell() {
  if (process.platform !== 'win32') return { available: false, source: '' }
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
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

function pickSearchBackend(state) {
  if (state?.bundled?.available) {
    return {
      available: true,
      backend: 'bundled-rg',
      version: state.bundled.version || '',
      source: state.bundled.path || '',
      fallbackAvailable: Boolean(state?.powershell?.available),
    }
  }
  if (state?.system?.available) {
    return {
      available: true,
      backend: 'system-rg',
      version: state.system.version || '',
      source: state.system.path || '',
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

async function detectLocalSearchBackend() {
  const state = {
    bundled: await probeBundledRg(),
    system: await probeSystemRg(),
    powershell: await probePowerShell(),
  }
  return pickSearchBackend(state)
}

async function getLocalSearchCapability(forceRefresh = false) {
  if (!forceRefresh && cachedCapability) return cachedCapability
  cachedCapability = await detectLocalSearchBackend()
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

async function runRgTextSearch(executablePath, options = {}) {
  const args = buildRgArgs(options)
  const { stdout: output } = await execFileAsync(executablePath, args, {
    cwd: path.resolve(options.cwd || process.cwd()),
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return normalizeRgLines(parseRgJsonOutput(output), options.maxResults)
}

async function runPowerShellTextSearch(options = {}) {
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
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    cwd: resolvedCwd,
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = stdout.trim()

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

async function searchText(options = {}) {
  const capability = await getLocalSearchCapability()
  try {
    if (capability.backend === 'bundled-rg' || capability.backend === 'system-rg') {
      const { results, truncated } = await runRgTextSearch(capability.source, options)
      return {
        ok: true,
        backend: capability.backend,
        fallbackUsed: false,
        results,
        truncated,
        error: null,
      }
    }
    const { results, truncated } = await runPowerShellTextSearch(options)
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
    return buildSearchError('search failed', capability.backend, command, error, capability.backend === 'powershell')
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

async function runRgFiles(executablePath, options = {}) {
  const { stdout: output } = await execFileAsync(executablePath, buildRgFilesArgs(options), {
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

async function runPowerShellFiles(options = {}) {
  const resolvedCwd = path.resolve(options.cwd || process.cwd())
  const limit = Number.isFinite(options.maxResults) ? Number(options.maxResults) : DEFAULT_MAX_RESULTS
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `$root = ${JSON.stringify(resolvedCwd)}`,
    `$limit = ${limit}`,
    `Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First $limit -ExpandProperty FullName | ConvertTo-Json -Compress`,
  ].join('; ')
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    cwd: resolvedCwd,
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = stdout.trim()
  if (!output) return { files: [], truncated: false }
  const parsed = JSON.parse(output)
  const files = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean)
  return {
    files,
    truncated: files.length >= limit,
  }
}

async function listFiles(options = {}) {
  const capability = await getLocalSearchCapability()
  const enumLimit = resolveFileEnumLimit(options)
  const fileOptions = {
    ...options,
    maxResults: enumLimit,
  }
  const suggestionLimit = Number.isFinite(options.maxResults) && options.maxResults > 0
    ? Number(options.maxResults)
    : 10
  try {
    if (capability.backend === 'bundled-rg' || capability.backend === 'system-rg') {
      const { files, truncated } = await runRgFiles(capability.source, fileOptions)
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
    const { files, truncated } = await runPowerShellFiles(fileOptions)
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
      fallbackUsed: capability.backend === 'powershell',
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

function registerLocalSearchIpc(ipcMain) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') return
  // P1-4：所有 handler 改为 async，匹配异步化的底层函数
  ipcMain.handle(CORE_CHANNELS.LOCAL_SEARCH_CAPABILITY, async () => getLocalSearchCapability(true))
  ipcMain.handle(CORE_CHANNELS.LOCAL_SEARCH_TEXT, async (_, payload = {}) => searchText(payload))
  ipcMain.handle(CORE_CHANNELS.LOCAL_SEARCH_FILES, async (_, payload = {}) => listFiles(payload))
  ipcMain.handle(CORE_CHANNELS.LOCAL_SEARCH_DIAGNOSE, async () => ({
    platform: process.platform,
    capability: await getLocalSearchCapability(true),
    bundledPath: getBundledRgPath(),
    systemPath: await getSystemRgPath(),
    powershell: await probePowerShell(),
  }))
}

module.exports = {
  getBundledRgPath,
  getSystemRgPath,
  detectLocalSearchBackend,
  getLocalSearchCapability,
  augmentEnvWithBundledRg,
  searchText,
  listFiles,
  registerLocalSearchIpc,
  __test__: {
    pickSearchBackend,
    prependToolDirToEnvPath,
    normalizeRgLines,
    suggestFilePaths,
  },
}
