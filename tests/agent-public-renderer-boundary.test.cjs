const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

const agentPackageJson = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'agent', 'package.json'), 'utf8'))
assert.equal(agentPackageJson.exports['.'], './src/index.js')
assert.equal(agentPackageJson.exports['./render'], './src/components/agentCommon/render.js')

const viteConfig = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
assert.match(viteConfig, /['"]@mindcraft\/agent['"]/)
assert.match(viteConfig, /['"]@mindcraft\/agent\/render['"]/)

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(full)
    if (/\.(vue|js|mjs|cjs)$/.test(entry.name)) return [full]
    return []
  })
}

const hostSourceFiles = collectFiles(path.join(root, 'src'))
const internalAgentImports = []

for (const file of hostSourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes('packages/agent/src')) {
    internalAgentImports.push(path.relative(root, file))
  }
}

assert.deepEqual(internalAgentImports, [], 'host renderer must import agent renderer APIs through public entrypoints')

console.log('agent public renderer boundary tests passed')
