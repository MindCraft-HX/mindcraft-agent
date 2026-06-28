import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const rootDir = process.cwd()
const componentsDir = join(rootDir, 'packages', 'agent', 'src', 'components')
const sharedStatusBarPath = join(componentsDir, 'agentCommon', 'components', 'StatusBarMetrics.vue')

function collectFiles(dir, predicate, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(fullPath, predicate, acc)
      continue
    }
    if (predicate(fullPath)) acc.push(fullPath)
  }
  return acc
}

test('StatusBarMetrics has a single shared implementation', () => {
  const files = collectFiles(componentsDir, (file) => file.endsWith('StatusBarMetrics.vue'))
    .map((file) => relative(rootDir, file).replace(/\\/g, '/'))

  assert.deepEqual(files, [
    'packages/agent/src/components/agentCommon/components/StatusBarMetrics.vue',
  ])
})

test('ClaudeCode and CodeX renderers import the shared StatusBarMetrics component', () => {
  const expectedImport = "import StatusBarMetrics from '../agentCommon/components/StatusBarMetrics.vue'"
  for (const file of [
    join(componentsDir, 'claudeCode', 'index.vue'),
    join(componentsDir, 'codeX', 'index.vue'),
  ]) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /<StatusBarMetrics[\s>]/)
    assert.ok(source.includes(expectedImport), `${relative(rootDir, file)} must import the shared status bar`)
  }
})

test('shared StatusBarMetrics keeps provider differences as props', () => {
  const source = readFileSync(sharedStatusBarPath, 'utf8')

  assert.match(source, /modelDisplay/)
  assert.match(source, /compactHintKey/)
  assert.match(source, /compactingKey/)
  assert.doesNotMatch(source, /codexAutoCompactDesc/)
  assert.doesNotMatch(source, /claudeCode/)
})

console.log('renderer convergence contract test passed')
