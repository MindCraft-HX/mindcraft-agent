'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { describeDocumentIdentity } = require('../electron/mainModules/documentIdentity')

test('canonical document identity unifies Windows case and symlink aliases', () => {
  const aliases = new Map([
    ['D:\\repo\\docs\\README.md', 'D:\\repo\\docs\\readme.md'],
    ['d:\\REPO\\docs\\readme.md', 'D:\\repo\\docs\\readme.md'],
  ])
  const options = {
    pathImpl: path.win32,
    platform: 'win32',
    realpath(value) { return aliases.get(path.win32.normalize(value)) || 'D:\\repo\\docs\\readme.md' },
    stat() { return { isFile: () => true, size: 12, mtimeMs: 99, ino: 7 } },
  }
  const first = describeDocumentIdentity('D:\\repo\\docs\\README.md', options)
  const second = describeDocumentIdentity('d:\\REPO\\docs\\readme.md', options)

  assert.equal(first.ok, true)
  assert.equal(first.canonicalDocumentKey, second.canonicalDocumentKey)
  assert.equal(first.lexicalDocumentKey, second.lexicalDocumentKey)
  assert.deepEqual(first.signature, { size: 12, mtimeMs: 99, ino: 7 })
})

test('canonical document identity rejects missing and non-file targets', () => {
  assert.equal(describeDocumentIdentity('D:\\missing.md', {
    pathImpl: path.win32,
    realpath() { throw new Error('missing') },
  }).reason, 'not-found')

  assert.equal(describeDocumentIdentity('D:\\folder', {
    pathImpl: path.win32,
    realpath(value) { return value },
    stat() { return { isFile: () => false } },
  }).reason, 'not-a-file')
})
