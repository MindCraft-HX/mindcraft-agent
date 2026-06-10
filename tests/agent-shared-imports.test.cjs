const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const agentSrc = path.join(root, 'packages', 'agent', 'src')

const forbiddenPatterns = [
  /@\/components\/(?:claudeCode|codeX|codeHub|agentCommon)/,
  /@\/stores\/(?:claudeTheme|codexConfig)/,
]

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(fullPath)
    if (/\.(vue|js|mjs)$/.test(entry.name)) return [fullPath]
    return []
  })
}

for (const file of collectFiles(agentSrc)) {
  const content = fs.readFileSync(file, 'utf8')
  for (const pattern of forbiddenPatterns) {
    assert.ok(!pattern.test(content), `${path.relative(root, file)} should not import host agent modules with @ alias`)
  }
}

console.log('agent shared import tests passed')
