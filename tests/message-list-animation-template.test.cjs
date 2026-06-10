const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const files = [
  path.resolve(
    __dirname,
    '../packages/agent/src/components/claudeCode/components/messages/MessageList.vue',
  ),
  path.resolve(
    __dirname,
    '../packages/agent/src/components/codeX/components/messages/MessageList.vue',
  ),
]

test('message lists keep hover feedback but do not animate every msg-row on render', () => {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')

    assert.match(
      source,
      /\.msg-row\s*\{[\s\S]*padding:\s*5px 14px;[\s\S]*scroll-margin-top:\s*31px;/,
    )
    assert.doesNotMatch(
      source,
      /\.msg-row\s*\{[\s\S]*animation:\s*msg-fade-in/,
    )
    assert.doesNotMatch(
      source,
      /@keyframes\s+msg-fade-in/,
    )
    assert.match(
      source,
      /\.msg-row:hover\s*\{\s*background:\s*color-mix\(in srgb, var\(--cc-bg-hover\) 35%, transparent\);\s*\}/,
    )
  }
})
