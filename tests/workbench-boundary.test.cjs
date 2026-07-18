'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(full)
    return /\.(?:js|mjs|cjs|vue)$/.test(entry.name) ? [full] : []
  })
}

const workbenchFiles = collectFiles(path.join(root, 'src', 'workbench'))
for (const file of workbenchFiles) {
  const source = fs.readFileSync(file, 'utf8')
  assert.equal(source.includes('packages/agent/src/'), false,
    `${path.relative(root, file)} must not import Agent private renderer modules`)
  assert.equal(source.includes('electronAPI.writeFileSync'), false,
    `${path.relative(root, file)} must not write document content directly`)
}

const agentFiles = collectFiles(path.join(root, 'packages', 'agent'))
for (const file of agentFiles) {
  const source = fs.readFileSync(file, 'utf8')
  assert.equal(/from\s+['"][^'"]*src\/workbench|require\([^)]*src\/workbench/.test(source), false,
    `${path.relative(root, file)} must not depend on host Workbench code`)
}

console.log('workbench boundary tests passed')
