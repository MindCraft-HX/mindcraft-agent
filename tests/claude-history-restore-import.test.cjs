const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '..', 'packages', 'agent', 'src', 'components', 'claudeCode', 'index.vue')
const source = fs.readFileSync(filePath, 'utf8')

test('claude history restore imports ensureTaskState when makeRestoredChat uses it', () => {
  assert.match(source, /ensureTaskState\s*\(/, 'expected claudeCode restore path to use ensureTaskState')
  assert.match(
    source,
    /import\s*\{[\s\S]*\bensureTaskState\b[\s\S]*\}\s*from\s*['"]\.\/composables\/useClaudeTaskState\.mjs['"]/,
    'expected claudeCode to import ensureTaskState from useClaudeTaskState.mjs',
  )
})
