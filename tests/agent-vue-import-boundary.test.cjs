const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const agentSrc = path.join(root, 'packages', 'agent', 'src')
const vueApis = ['computed', 'ref', 'reactive', 'watch', 'watchEffect', 'onMounted', 'onBeforeUnmount', 'nextTick', 'provide', 'inject']

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(full)
    if (/\.(vue|js|mjs)$/.test(entry.name)) return [full]
    return []
  })
}

function importedVueApis(source) {
  const imports = new Set()
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*['"]vue['"]/g
  for (const match of source.matchAll(importPattern)) {
    for (const rawName of match[1].split(',')) {
      const name = rawName.trim().split(/\s+as\s+/)[0]?.trim()
      if (name) imports.add(name)
    }
  }
  return imports
}

function stripImportsAndComments(source) {
  return source
    .replace(/import\s+[\s\S]*?from\s*['"][^'"]+['"];?/g, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const failures = []
for (const file of collectFiles(agentSrc)) {
  const source = fs.readFileSync(file, 'utf8')
  const body = stripImportsAndComments(source)
  const imports = importedVueApis(source)
  for (const api of vueApis) {
    const used = new RegExp(`\\b${api}\\s*\\(`).test(body)
    if (used && !imports.has(api)) {
      failures.push(`${path.relative(root, file)} uses ${api}() without importing it from vue`)
    }
  }
}

if (failures.length) {
  throw new Error(`Missing Vue imports:\n${failures.join('\n')}`)
}

console.log('agent vue import boundary tests passed')
