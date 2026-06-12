/**
 * 构建时从 agent-skills-cli API 生成 skills catalog 文件。
 * 网络失败静默跳过，不阻塞构建。
 *
 * 用法: node build/generate-skills-catalog.js
 */
const path = require('path')
const fs = require('fs')

async function generateCatalog() {
  try {
    const { fetchSkillsForCLI } = await import('agent-skills-cli')

    // 获取 Top 100 skills（按 stars 排序）
    console.log('[catalog] Fetching top skills from API...')
    const result = await fetchSkillsForCLI({ page: 1, limit: 100, sortBy: 'stars' })

    const mapSkill = (s) => ({
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
    })

    const skills = (result.skills || []).map(mapSkill)
    const catalog = {
      version: '1',
      generatedAt: new Date().toISOString(),
      skills,
    }

    const dataDir = path.resolve(__dirname, '..', 'packages', 'agent', 'data')
    fs.mkdirSync(dataDir, { recursive: true })

    // Claude 和 CodeX 共用同一份 catalog 内容
    const catalogPath = path.join(dataDir, 'skills-catalog.json')
    const codexCatalogPath = path.join(dataDir, 'codex-skills-catalog.json')

    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2))
    fs.writeFileSync(codexCatalogPath, JSON.stringify(catalog, null, 2))

    console.log(`[catalog] Generated ${skills.length} skills → ${catalogPath}`)
  } catch (e) {
    console.warn(`[catalog] Skipped catalog generation: ${e.message}`)
  }
}

generateCatalog().then(() => process.exit(0))
