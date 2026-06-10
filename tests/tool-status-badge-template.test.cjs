const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const componentPath = path.resolve(
  __dirname,
  '../packages/agent/src/components/agentCommon/components/ToolStatusBadge.vue',
)

test('ToolStatusBadge keeps pending animation on the icon instead of the whole badge', () => {
  const source = fs.readFileSync(componentPath, 'utf8')

  assert.doesNotMatch(
    source,
    /\.badge-pending\s*\{[^}]*animation:/,
  )
  assert.match(
    source,
    /\.badge-pending\s+\.badge-icon\s*\{[\s\S]*animation:\s*status-breathe/,
  )
  assert.match(
    source,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.badge-icon,[\s\S]*\.badge-dot,[\s\S]*animation:\s*none\s*!important;/,
  )
})
