const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

const markdownIt = read('src/utils/MarkdownIt.js')

assert.ok(
  !markdownIt.includes('openPathCandidateFromElement(fileLink'),
  'MarkdownIt should not open path candidates itself; agentCommon/render owns the global click handler'
)
assert.ok(
  !markdownIt.includes("closest?.('a[data-path-candidate]')"),
  'MarkdownIt should not register a duplicate path-candidate click selector'
)

for (const relativePath of [
  'packages/agent/src/components/claudeCode/components/messages/MessageList.vue',
  'packages/agent/src/components/codeX/components/messages/MessageList.vue',
]) {
  const source = read(relativePath)
  assert.ok(source.includes('projectCwd'), `${relativePath} should accept a project cwd fallback`)
  assert.ok(
    source.includes("tab.cwd || projectCwd || ''"),
    `${relativePath} should resolve path context from tab cwd first, then project cwd`
  )
}

for (const relativePath of [
  'packages/agent/src/components/claudeCode/index.vue',
  'packages/agent/src/components/codeX/index.vue',
]) {
  const source = read(relativePath)
  assert.ok(
    /:project-cwd="activeProject\?\.cwd \|\| ''"/.test(source),
    `${relativePath} should pass active project cwd into MessageList`
  )
}

console.log('document link click context tests passed')
