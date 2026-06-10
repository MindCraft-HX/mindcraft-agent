const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

const nestedWindowFiles = [
  'electron/codeWindow/index.js',
  'electron/floatWindow/sideFloatWin.js',
  'electron/openDrawWin/index.js',
]

for (const relativePath of nestedWindowFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  assert.match(
    source,
    /path\.join\(__dirname,\s*['"]\.\.\/\.\.\/dist\/logo-html\.png['"]\)/,
    `${relativePath} should resolve logo-html.png from repo dist/`
  )
  assert.doesNotMatch(
    source,
    /path\.join\(__dirname,\s*['"]\.\.\/dist\/logo-html\.png['"]\)/,
    `${relativePath} must not resolve logo-html.png via electron/dist/`
  )
}

console.log('electron window icon path tests passed')
