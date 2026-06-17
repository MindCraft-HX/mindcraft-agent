const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

function getMindCraftUserDataDir() {
  try {
    if (app && typeof app.getPath === 'function') return app.getPath('userData')
  } catch (_) {}
  return path.join(os.tmpdir(), 'mindcraft-agent-userData')
}

function defaultCacheFile(agentName = 'skills') {
  const safeName = String(agentName || 'skills').replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(getMindCraftUserDataDir(), 'skills-cache', `${safeName}-skills-catalog-cache.json`)
}

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeSkillRecord(skill) {
  if (!skill || typeof skill !== 'object') return null
  const name = normalizeString(skill.name).trim()
  if (!name) return null
  return {
    name,
    displayName: normalizeString(skill.displayName) || name,
    description: normalizeString(skill.description),
    author: normalizeString(skill.author),
    category: normalizeString(skill.category),
    tags: Array.isArray(skill.tags) ? skill.tags.map(String).filter(Boolean) : [],
    sourceUrl: normalizeString(skill.sourceUrl),
    gitUrl: normalizeString(skill.gitUrl),
    subPath: normalizeString(skill.subPath),
    installs: Number.isFinite(Number(skill.installs)) ? Number(skill.installs) : 0,
  }
}

function normalizeSkillsCatalog(catalog = {}) {
  const skills = (Array.isArray(catalog.skills) ? catalog.skills : [])
    .map(normalizeSkillRecord)
    .filter(Boolean)
  return {
    version: normalizeString(catalog.version) || '1',
    cachedAt: normalizeString(catalog.cachedAt) || new Date().toISOString(),
    skills,
  }
}

function writeSkillsCatalogCache(agentName, catalog, { cacheFile } = {}) {
  const normalized = normalizeSkillsCatalog(catalog)
  if (!normalized.skills.length) return false
  const filePath = cacheFile || defaultCacheFile(agentName)
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf8')
    try {
      fs.renameSync(tmp, filePath)
    } catch (_) {
      fs.copyFileSync(tmp, filePath)
      try { fs.unlinkSync(tmp) } catch (_) {}
    }
    return true
  } catch (_) {
    return false
  }
}

function readSkillsCatalogCache(agentName, { cacheFile } = {}) {
  const filePath = cacheFile || defaultCacheFile(agentName)
  try {
    if (!fs.existsSync(filePath)) return { version: '0', skills: [] }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const normalized = normalizeSkillsCatalog(raw)
    if (!normalized.skills.length) return { version: '0', skills: [] }
    return {
      ...normalized,
      version: normalized.version || 'cache',
      fromCache: true,
    }
  } catch (_) {
    return { version: '0', skills: [] }
  }
}

function filterSkillsCatalog(catalog = {}, opts = {}) {
  const normalized = normalizeSkillsCatalog(catalog)
  const q = normalizeString(opts.search).trim().toLowerCase()
  const limit = Math.max(1, Math.min(Number(opts.limit) || normalized.skills.length || 100, 500))
  const page = Math.max(1, Number(opts.page) || 1)
  let skills = normalized.skills
  if (q) {
    skills = skills.filter((skill) => {
      const haystack = [
        skill.name,
        skill.displayName,
        skill.description,
        skill.author,
        skill.category,
        ...(skill.tags || []),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }
  const total = skills.length
  if (opts.page) {
    skills = skills.slice((page - 1) * limit, page * limit)
  } else {
    skills = skills.slice(0, limit)
  }
  return {
    ...normalized,
    skills,
    total,
    fromCache: Boolean(catalog.fromCache),
  }
}

module.exports = {
  defaultCacheFile,
  normalizeSkillRecord,
  normalizeSkillsCatalog,
  writeSkillsCatalogCache,
  readSkillsCatalogCache,
  filterSkillsCatalog,
}
