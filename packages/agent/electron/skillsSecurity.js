const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const GIT_CLONE_TIMEOUT_MS = 120000

function assertSafeSkillName(skillName) {
  const name = String(skillName || '').trim()
  if (!name) throw new Error('Invalid skill name')
  if (name === '.' || name === '..') throw new Error('Invalid skill name')
  if (name.length > 128) throw new Error('Invalid skill name')
  if (/[\0\r\n]/.test(name)) throw new Error('Invalid skill name')
  if (/[\\/]/.test(name) || path.isAbsolute(name)) throw new Error('Invalid skill name')
  if (process.platform === 'win32' && /[:*?"<>|]/.test(name)) throw new Error('Invalid skill name')
  return name
}

function normalizeScope(scope) {
  return scope === 'project' ? 'project' : 'system'
}

function resolveSkillsRoot({ agentName, scope, cwd }) {
  const safeScope = normalizeScope(scope)
  const dotDir = agentName === 'codex' ? '.codex' : '.claude'
  if (safeScope === 'system') return path.join(os.homedir(), dotDir, 'skills')

  const projectCwd = String(cwd || '').trim()
  if (!projectCwd) throw new Error('Project cwd is required for project-scope skills')
  return path.join(path.resolve(projectCwd), dotDir, 'skills')
}

function isPathInside(parent, child) {
  const parentResolved = path.resolve(parent)
  const childResolved = path.resolve(child)
  const rel = path.relative(parentResolved, childResolved)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function realpathIfExists(filePath) {
  try {
    return fs.realpathSync.native(filePath)
  } catch (_) {
    return ''
  }
}

function isRealPathInside(parent, child) {
  const parentReal = realpathIfExists(parent)
  const childReal = realpathIfExists(child)
  if (!parentReal || !childReal) return false
  return isPathInside(parentReal, childReal)
}

function resolveSkillTargetDir({ agentName, scope, cwd, skillName }) {
  const root = resolveSkillsRoot({ agentName, scope, cwd })
  const name = assertSafeSkillName(skillName)
  const targetDir = path.resolve(root, name)
  if (!isPathInside(root, targetDir)) throw new Error('Skill target path escapes skills directory')
  return { root, targetDir, skillName: name, scope: normalizeScope(scope) }
}

function resolveRelativeSourceDir(rootDir, subPath = '') {
  const rel = String(subPath || '').trim()
  if (!rel) return path.resolve(rootDir)
  if (/[\0\r\n]/.test(rel) || path.isAbsolute(rel)) throw new Error('Invalid skill subPath')
  const sourceDir = path.resolve(rootDir, rel)
  if (!isPathInside(rootDir, sourceDir)) throw new Error('Skill subPath escapes cloned repository')
  if (fs.existsSync(sourceDir) && !isRealPathInside(rootDir, sourceDir)) {
    throw new Error('Skill subPath resolves outside cloned repository')
  }
  return sourceDir
}

function assertNoSymlinks(dir) {
  const root = path.resolve(dir)
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Skill package contains unsupported symlink')
      if (entry.isDirectory()) walk(entryPath)
    }
  }
  walk(root)
}

function copySkillDirAtomic(sourceDir, targetDir, skillName) {
  if (!fs.existsSync(sourceDir)) throw new Error('Skill source directory does not exist')
  assertNoSymlinks(sourceDir)

  const parentDir = path.dirname(targetDir)
  fs.mkdirSync(parentDir, { recursive: true })
  const safeName = assertSafeSkillName(skillName || path.basename(targetDir))
  const tempPrefix = path.join(parentDir, `.${safeName}.install-`)
  const stagingDir = fs.mkdtempSync(tempPrefix)
  const backupDir = fs.existsSync(targetDir) ? fs.mkdtempSync(path.join(parentDir, `.${safeName}.backup-`)) : ''
  let movedExisting = false
  try {
    fs.cpSync(sourceDir, stagingDir, { recursive: true, dereference: false })
    if (backupDir) {
      fs.renameSync(targetDir, backupDir)
      movedExisting = true
    }
    fs.renameSync(stagingDir, targetDir)
    if (backupDir) fs.rmSync(backupDir, { recursive: true, force: true })
  } catch (error) {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch (_) {}
    if (movedExisting && backupDir && !fs.existsSync(targetDir)) {
      try { fs.renameSync(backupDir, targetDir) } catch (_) {}
    }
    throw error
  } finally {
    if (backupDir) {
      try { fs.rmSync(backupDir, { recursive: true, force: true }) } catch (_) {}
    }
  }
}

function validateGithubUrl(gitUrl) {
  const raw = String(gitUrl || '').trim()
  if (!raw || /[\0\r\n]/.test(raw)) throw new Error('Invalid GitHub URL')
  let parsed
  try {
    parsed = new URL(raw)
  } catch (_) {
    throw new Error('Invalid GitHub URL')
  }
  const host = parsed.hostname.toLowerCase()
  if (parsed.protocol !== 'https:' || (host !== 'github.com' && host !== 'www.github.com')) {
    throw new Error('Only https://github.com skill sources are allowed')
  }
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('Invalid GitHub repository URL')
  return raw
}

function normalizeGithubSkillSource(gitUrl, subPath = '') {
  const raw = validateGithubUrl(gitUrl)
  const parsed = new URL(raw)
  const parts = parsed.pathname.split('/').filter(Boolean)
  const owner = parts[0]
  let repo = parts[1] || ''
  if (!owner || !repo) throw new Error('Invalid GitHub repository URL')
  repo = repo.replace(/\.git$/i, '')

  let sourceSubPath = String(subPath || '').trim().replace(/^\/+|\/+$/g, '')
  const markerIndex = parts.findIndex((part, idx) => idx >= 2 && part === 'tree')
  if (markerIndex >= 0) {
    const urlSubPath = parts.slice(markerIndex + 2).join('/')
    if (urlSubPath && !sourceSubPath) sourceSubPath = urlSubPath
  }

  return {
    gitUrl: `https://github.com/${owner}/${repo}`,
    subPath: sourceSubPath,
  }
}

function applyGitMirror(originalUrl, mirrorUrl = '') {
  const mirror = String(mirrorUrl || '').trim()
  if (!mirror) return originalUrl
  try {
    const parsed = new URL(mirror)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return originalUrl
  } catch (_) {
    return originalUrl
  }
  return mirror.replace(/\/+$/, '') + '/' + originalUrl
}

function sendCloneProgress(sender, data) {
  try {
    if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
      sender.send('skills-install-progress', data)
    }
  } catch (_) {}
}

function cloneWithProgress(gitUrl, targetDir, sender) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', '--progress', gitUrl, targetDir], {
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill() } catch (_) {}
      reject(new Error('git clone timed out'))
    }, GIT_CLONE_TIMEOUT_MS)

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/Receiving objects:\s+(\d+)%/)
      const match2 = text.match(/Resolving deltas:\s+(\d+)%/)
      if (match || match2) {
        const pct = match ? Number(match[1]) : Number(match2[1])
        sendCloneProgress(sender, { phase: 'clone', percent: Math.min(pct || 0, 100) })
      }
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) return resolve()
      reject(new Error(stderr.slice(-500) || `git clone exit code ${code}`))
    })
  })
}

async function cloneWithFallback({ originalUrl, targetDir, sender, mirrorUrl }) {
  const source = normalizeGithubSkillSource(originalUrl)
  const cloneUrl = applyGitMirror(source.gitUrl, mirrorUrl)
  try {
    await cloneWithProgress(cloneUrl, targetDir, sender)
  } catch (mirrorErr) {
    if (cloneUrl === source.gitUrl) throw mirrorErr
    try { fs.rmSync(targetDir, { recursive: true, force: true }) } catch (_) {}
    sendCloneProgress(sender, { phase: 'clone', percent: 0, fallback: true })
    try {
      await cloneWithProgress(source.gitUrl, targetDir, sender)
    } catch (directErr) {
      const mirrorMsg = mirrorErr?.message?.replace(/\n/g, ' ').slice(0, 200) || 'unknown error'
      const directMsg = directErr?.message?.replace(/\n/g, ' ').slice(0, 200) || 'unknown error'
      throw new Error(`Mirror and direct clone both failed. Mirror: ${mirrorMsg}; direct: ${directMsg}`)
    }
  }
}

function safeTempDir(prefix, skillName) {
  const safeName = assertSafeSkillName(skillName).replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(os.tmpdir(), `${prefix}-${safeName}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

module.exports = {
  assertSafeSkillName,
  normalizeScope,
  resolveSkillsRoot,
  resolveSkillTargetDir,
  resolveRelativeSourceDir,
  copySkillDirAtomic,
  validateGithubUrl,
  normalizeGithubSkillSource,
  applyGitMirror,
  cloneWithFallback,
  safeTempDir,
  __test__: {
    isPathInside,
    isRealPathInside,
    assertNoSymlinks,
  },
}
