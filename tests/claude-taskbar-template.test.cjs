const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const componentPath = path.resolve(
  __dirname,
  '../packages/agent/src/components/claudeCode/components/taskBar/ClaudeTaskBar.vue',
)

test('ClaudeTaskBar uses a non-interactive header and keeps action buttons isolated', () => {
  const source = fs.readFileSync(componentPath, 'utf8')

  assert.doesNotMatch(
    source,
    /<header[^>]*class="claude-task-bar__header"[^>]*role="button"/,
  )
  assert.match(
    source,
    /<header[^>]*class="claude-task-bar__header"[^>]*>/,
  )
  assert.match(
    source,
    /class="claude-task-bar__summary"[\s\S]*role="button"[\s\S]*@click="\$emit\('toggle-collapsed'\)"[\s\S]*@keydown\.enter\.prevent="\$emit\('toggle-collapsed'\)"[\s\S]*@keydown\.space\.prevent="\$emit\('toggle-collapsed'\)"/,
  )
  assert.match(
    source,
    /class="claude-task-bar__action"[\s\S]*@click\.stop="\$emit\('toggle-collapsed'\)"/,
  )
  assert.match(
    source,
    /class="claude-task-bar__action is-close"[\s\S]*@click\.stop="\$emit\('close'\)"/,
  )
})
