'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const shell = fs.readFileSync(path.join(root, 'src', 'components', 'workbench', 'WorkbenchShell.vue'), 'utf8')
const main = fs.readFileSync(path.join(root, 'src', 'Main.vue'), 'utf8')

test('main routes the three resident surfaces through one workbench shell', () => {
  assert.match(main, /<WorkbenchShell v-show="isWorkbenchRoute"/)
  assert.match(main, /<router-view v-if="!isWorkbenchRoute"/)
  assert.match(shell, /CodeHub v-if="itemId === 'agent:codehub'"/)
  assert.match(shell, /ChatView v-else-if="itemId === 'chat:simple'"/)
  assert.match(shell, /MdViewer v-else-if="itemId === 'document:home'"/)
})

test('workbench shell renders resident surfaces in the stable single-pane host', () => {
  assert.doesNotMatch(shell, /<Teleport/)
  assert.match(shell, /v-for="itemId in mountedItemIds"/)
  assert.match(shell, /v-show="isActive\(itemId\)"/)
  assert.match(shell, /@dragstart="startDrag\(\$event, itemId\)"/)
  assert.match(shell, /@drop="moveDroppedItem\(\$event, group.id\)"/)
  assert.doesNotMatch(shell, /v-if="groups\.length === 1 && group\.itemIds\.length > 1"/)
})

test('workbench shell keeps mounted singleton surfaces resident after first open', () => {
  assert.match(shell, /const mountedItems = ref\(new Set\(\['agent:codehub'\]\)\)/)
  assert.match(shell, /mountedItems\.value = new Set\(\[\.\.\.mountedItems\.value, itemId\]\)/)
})
