const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  filterSkillsCatalog,
  readSkillsCatalogCache,
  writeSkillsCatalogCache,
} = require('./skillsCatalogCache')

test('writes and reads normalized skills catalog cache', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-cache-'))
  const cacheFile = path.join(dir, 'catalog.json')

  assert.equal(writeSkillsCatalogCache('claude', {
    version: '1',
    skills: [
      { name: 'demo', description: 'Demo skill', installs: '12', tags: ['test'] },
      { description: 'missing name' },
    ],
  }, { cacheFile }), true)

  const cached = readSkillsCatalogCache('claude', { cacheFile })
  assert.equal(cached.fromCache, true)
  assert.equal(cached.skills.length, 1)
  assert.equal(cached.skills[0].name, 'demo')
  assert.equal(cached.skills[0].installs, 12)
})

test('filters cached catalog by search and page', () => {
  const catalog = {
    version: '1',
    skills: [
      { name: 'alpha', description: 'React helper' },
      { name: 'beta', description: 'Python helper' },
      { name: 'gamma', description: 'React docs' },
    ],
  }

  const searched = filterSkillsCatalog(catalog, { search: 'react', limit: 10 })
  assert.deepEqual(searched.skills.map(s => s.name), ['alpha', 'gamma'])
  assert.equal(searched.total, 2)

  const paged = filterSkillsCatalog(catalog, { page: 2, limit: 1 })
  assert.deepEqual(paged.skills.map(s => s.name), ['beta'])
  assert.equal(paged.total, 3)
})
