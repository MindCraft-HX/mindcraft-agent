'use strict';

/**
 * Skills marketplace API client (shared between ClaudeCode & CodeX).
 *
 * Extracted from duplicated code in claudeAgent.js / codexAgent.js (Batch 4).
 * Both agents called the same agentskills.in API with the same logic;
 * only the agent-name parameter differed ('claude' vs 'codex').
 *
 * Responsibilities:
 *   - mapMarketplaceSkill — normalise API skill record to catalog format
 *   - fetchSkillsMarketplace — fetch + cache + fallback to local catalog
 */

const {
  readSkillsCatalogCache,
  writeSkillsCatalogCache,
  filterSkillsCatalog,
} = require('../../skillsCatalogCache')

const SKILLS_API = 'https://www.agentskills.in/api/skills'

/**
 * Normalise a raw API skill record into the catalog format.
 *
 * @param {object} s — raw API skill object
 * @returns {{name:string, displayName:string, description:string, author:string, category:string, tags:string[], sourceUrl:string, gitUrl:string, subPath:string, installs:number}}
 */
function mapMarketplaceSkill(s) {
  return {
    name: s.name,
    displayName: s.name,
    description: s.description || '',
    author: s.author || '',
    category: '',
    tags: [],
    sourceUrl: `https://skills.sh?q=${encodeURIComponent(s.name)}`,
    gitUrl: s.githubUrl || '',
    subPath: s.path ? s.path.replace(/\/SKILL\.md$/i, '') : '',
    installs: s.stars || 0,
  }
}

/**
 * Fetch skills from the marketplace API.
 *
 * Caches the default (page-0, no-search) result in a per-agent in-memory
 * cache and persists it via skillsCatalogCache.  On network failure falls
 * back to the local catalog cache.
 *
 * @param {string} agentName — 'claude' | 'codex'
 * @param {object} [opts]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.page]
 * @param {string} [opts.search]
 * @returns {Promise<{version:string, skills:object[]}>}
 */
function createSkillsMarketplaceClient(agentName) {
  let _fetchCache = null

  async function fetchSkillsMarketplace(opts = {}) {
    const isDefaultCatalog = !opts.page && !opts.search
    if (isDefaultCatalog && _fetchCache) return _fetchCache

    try {
      const params = new URLSearchParams({ limit: String(opts.limit || 100), sortBy: 'stars' })
      if (opts.page) params.set('page', String(opts.page))
      if (opts.search) params.set('search', String(opts.search))

      const resp = await fetch(`${SKILLS_API}?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const data = await resp.json()
      const catalog = {
        version: '1',
        skills: (data.skills || []).map(mapMarketplaceSkill),
      }

      if (isDefaultCatalog) {
        _fetchCache = catalog
        writeSkillsCatalogCache(agentName, catalog)
      }

      return catalog
    } catch (_) {
      const cachedCatalog = readSkillsCatalogCache(agentName)
      const fallback = filterSkillsCatalog(cachedCatalog, opts)
      if (fallback.skills.length) return fallback
      return { version: '0', skills: [] }
    }
  }

  function resetCache() {
    _fetchCache = null
  }

  return { fetchSkillsMarketplace, mapMarketplaceSkill, resetCache }
}

module.exports = { createSkillsMarketplaceClient, mapMarketplaceSkill }
