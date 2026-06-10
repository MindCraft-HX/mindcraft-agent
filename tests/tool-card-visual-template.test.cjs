const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

const toolCardFiles = [
  path.join(repoRoot, 'packages/agent/src/components/claudeCode/components/messages/ToolMessageCard.vue'),
  path.join(repoRoot, 'packages/agent/src/components/codeX/components/messages/ToolMessageCard.vue'),
]

const themeFiles = [
  path.join(repoRoot, 'src/styles/cc-theme-light.css'),
  path.join(repoRoot, 'src/styles/cc-theme-dark.css'),
  path.join(repoRoot, 'src/styles/cc-theme-blue.css'),
]

test('tool cards use a panel width and stronger header hierarchy', () => {
  for (const file of toolCardFiles) {
    const source = fs.readFileSync(file, 'utf8')

    assert.match(
      source,
      /width:\s*min\(calc\(100%\s*-\s*92px\),\s*980px\);/,
    )
    assert.doesNotMatch(
      source,
      /width:\s*calc\(78%\s*-\s*35px\)/,
    )
    assert.match(
      source,
      /\.tool-name\s*\{[^}]*font-weight:\s*600;/,
    )
    assert.match(
      source,
      /\.tool-status-badge\s*\{[^}]*opacity:\s*0\.86;/,
    )
  }
})

test('tool category stripe colors are grouped into a small semantic palette', () => {
  for (const file of themeFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const matches = [...source.matchAll(/--cc-tool-color-[\w-]+:\s*(#[0-9a-fA-F]{3,8}|var\([^;]+\));/g)]
    const colors = new Set(matches.map(match => match[1].toLowerCase()))

    assert.ok(matches.length >= 12, `${path.basename(file)} should define all tool color tokens`)
    assert.ok(colors.size <= 6, `${path.basename(file)} has too many distinct tool stripe colors: ${colors.size}`)
  }
})
