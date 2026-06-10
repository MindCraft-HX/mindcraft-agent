const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

const toolCardFiles = [
  path.join(repoRoot, 'packages/agent/src/components/claudeCode/components/messages/ToolMessageCard.vue'),
  path.join(repoRoot, 'packages/agent/src/components/codeX/components/messages/ToolMessageCard.vue'),
]

const bashFiles = [
  path.join(repoRoot, 'packages/agent/src/components/claudeCode/components/messages/tools/ToolBash.vue'),
  path.join(repoRoot, 'packages/agent/src/components/codeX/components/messages/tools/ToolBash.vue'),
]

const powerShellFile = path.join(
  repoRoot,
  'packages/agent/src/components/claudeCode/components/messages/tools/ToolPowerShell.vue',
)

test('terminal tool cards keep the left accent as a continuous overlay layer', () => {
  for (const file of toolCardFiles) {
    const source = fs.readFileSync(file, 'utf8')

    assert.match(
      source,
      /\.msg-tool\s*\{[\s\S]*position:\s*relative;/,
    )
    assert.match(
      source,
      /\.msg-tool::before\s*\{[\s\S]*top:\s*0;[\s\S]*bottom:\s*0;[\s\S]*width:\s*3px;/,
    )
    assert.doesNotMatch(
      source,
      /box-shadow:\s*inset 3px 0 0/,
    )
    assert.match(
      source,
      /\.tool-kind-terminal\s+\.tool-detail\s*\{[\s\S]*border-top:\s*1px solid var\(--cc-border\);[\s\S]*background:\s*var\(--cc-bg-code-deep\);/,
    )
  }
})

test('bash tool panels render as a single continuous section without summary gaps', () => {
  for (const file of bashFiles) {
    const source = fs.readFileSync(file, 'utf8')

    assert.match(source, /<div class="bash-panel">/)
    assert.match(
      source,
      /\.bash-panel\s*\{[\s\S]*background:\s*var\(--cc-bg-code-deep\);/,
    )
    assert.match(
      source,
      /\.bash-output-details\s*\{[^}]*margin:\s*0;/,
    )
    assert.match(
      source,
      /\.bash-output-details\s*>\s*summary\s*\{[\s\S]*display:\s*block;/,
    )
  }
})

test('powershell tool panel removes stacked spacing between sections', () => {
  const source = fs.readFileSync(powerShellFile, 'utf8')

  assert.match(
    source,
    /\.ps-panel\s*\{[\s\S]*padding:\s*0;/,
  )
  assert.match(
    source,
    /\.ps-panel\s*>\s*\*\s*\+\s*\*\s*\{[\s\S]*border-top:\s*1px solid/,
  )
  assert.match(
    source,
    /\.ps-output\s*\{[^}]*margin:\s*0;/,
  )
  assert.doesNotMatch(
    source,
    /margin-top:\s*2px/,
  )
})
