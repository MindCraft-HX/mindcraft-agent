'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'src', 'Main.vue'), 'utf8')

test('unfinished Workbench Phase 3 does not replace the stable routed UI', () => {
  assert.match(main, /<router-view v-slot="\{ Component \}">/)
  assert.match(main, /<keep-alive :include="\['codeHub', 'mdViewer', 'chat'\]">/)
  assert.doesNotMatch(main, /<WorkbenchShell/)
  assert.doesNotMatch(main, /isWorkbenchRoute/)
})

test('the incomplete Workbench shell is not shipped as a renderer surface', () => {
  assert.equal(fs.existsSync(path.join(root, 'src', 'components', 'workbench', 'WorkbenchShell.vue')), false)
})
