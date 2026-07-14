const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { findAssociatedMarkdownPath } = require('../electron/fileAssociation')

test('findAssociatedMarkdownPath extracts an existing markdown argument', () => {
  const filePath = path.resolve('C:/docs/README.md')
  const result = findAssociatedMarkdownPath([
    'C:/Program Files/MindCraft-Agent/MindCraft-Agent.exe',
    '--original-process-start-time=123',
    filePath,
  ], { existsSync: candidate => candidate === filePath })

  assert.equal(result, filePath)
})

test('findAssociatedMarkdownPath ignores flags, unsupported extensions, and missing files', () => {
  const result = findAssociatedMarkdownPath([
    '--inspect',
    'C:/docs/readme.txt',
    'C:/docs/missing.markdown',
  ], { existsSync: () => false })

  assert.equal(result, null)
})
