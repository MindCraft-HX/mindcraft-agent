'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const codeHub = fs.readFileSync(path.join(root, 'packages', 'agent', 'src', 'components', 'codeHub', 'index.vue'), 'utf8')
const chatView = fs.readFileSync(path.join(root, 'packages', 'agent', 'src', 'views', 'ChatView.vue'), 'utf8')

assert.match(codeHub, /defineExpose\(\{ createWorkbenchAdapter \}\)/)
assert.match(codeHub, /tabPresentation === 'internal'/)
assert.match(codeHub, /default: 'internal'/)
assert.match(codeHub, /workbenchAdapter\?\.dispose\?\.\(\)/)
assert.match(chatView, /defineExpose\(\{ createWorkbenchAdapter \}\)/)
assert.equal(codeHub.includes("src/workbench"), false)
assert.equal(chatView.includes("src/workbench"), false)
console.log('agent workbench surface tests passed')
