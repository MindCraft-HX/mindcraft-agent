const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const files = [
  'packages/agent/src/components/claudeCode/components/messages/UserMessageBubble.vue',
  'packages/agent/src/components/codeX/components/messages/UserMessageBubble.vue',
]

for (const rel of files) {
  const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
  assert.match(source, /\.code-card\s+:deep\(\.code-block \.hljs\)/, `${rel} should theme extracted code cards with normal hljs text`)
  assert.doesNotMatch(source, /\.user-msg\s+:deep\(\.code-block \.hljs-keyword\)/, `${rel} must not apply user bubble hljs palette to extracted code cards`)
  assert.match(source, /\.user-bubble\s+:deep\(\.code-block \.hljs-keyword\)/, `${rel} should keep user bubble specific hljs palette scoped to bubble`)
}

console.log('user message code highlight template test passed')
