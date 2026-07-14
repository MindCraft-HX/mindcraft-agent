const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const mainPath = path.join(repoRoot, 'electron', 'main.js')
const preloadPath = path.join(repoRoot, 'electron', 'preload.js')
const editorPath = path.join(repoRoot, 'src', 'components', 'mdViewer', 'editors', 'CodeMirrorEditor.vue')
const legacySearchViewDir = path.join(repoRoot, 'electron', 'searchView')

test('editor search shortcut uses IPC instead of reinjecting a keyboard event', () => {
  const mainSource = fs.readFileSync(mainPath, 'utf8')
  const preloadSource = fs.readFileSync(preloadPath, 'utf8')
  const editorSource = fs.readFileSync(editorPath, 'utf8')

  assert.match(mainSource, /win\._editorSearchEnabled\s*&&\s*\(key === 'F' \|\| key === 'H'\)/)
  assert.match(mainSource, /ipcMain\.on\(CORE_CHANNELS\.EDITOR_SEARCH_ENABLED/)
  assert.match(mainSource, /webContents\.send\(CORE_CHANNELS\.EDITOR_OPEN_SEARCH/)
  assert.doesNotMatch(mainSource, /sendInputEvent\(/)
  assert.doesNotMatch(mainSource, /_searchForwardGuard/)
  assert.match(preloadSource, /onEditorOpenSearch:\s*\(callback\)/)
  assert.match(preloadSource, /setEditorSearchEnabled:\s*\(enabled\)/)
  assert.match(editorSource, /search\(\{ top: true \}\)/)
  assert.match(editorSource, /onEditorOpenSearch\?\.\(\(\)\s*=>\s*\{[\s\S]*if \(editorView\) openSearchPanel\(editorView\)/)
  assert.doesNotMatch(editorSource, /editorView\?\.hasFocus/)
  assert.match(editorSource, /onMounted\(\(\)\s*=>\s*\{[\s\S]*setEditorSearchEnabled\?\.\(true\)/)
  assert.match(editorSource, /onActivated\(\(\)\s*=>\s*\{[\s\S]*setEditorSearchEnabled\?\.\(true\)/)
  assert.match(editorSource, /onDeactivated\(\(\)\s*=>\s*\{[\s\S]*setEditorSearchEnabled\?\.\(false\)/)
  assert.match(editorSource, /onBeforeUnmount\(\(\)\s*=>\s*\{[\s\S]*setEditorSearchEnabled\?\.\(false\)/)
})

test('legacy BrowserView search is fully removed', () => {
  const mainSource = fs.readFileSync(mainPath, 'utf8')
  const preloadSource = fs.readFileSync(preloadPath, 'utf8')

  assert.equal(fs.existsSync(legacySearchViewDir), false)
  assert.doesNotMatch(mainSource, /searchView/)
  assert.doesNotMatch(preloadSource, /sendSearchPage:/)
  assert.doesNotMatch(preloadSource, /closeSearchPage:/)
})

test('fold gutter uses CodeMirror marker text instead of custom DOM and pseudo-element overrides', () => {
  const editorSource = fs.readFileSync(editorPath, 'utf8')

  assert.match(editorSource, /foldGutter\(\{ openText: '▾', closedText: '▸' \}\)/)
  assert.doesNotMatch(editorSource, /markerDOM:/)
  assert.doesNotMatch(editorSource, /cm-fold-icon/)
  assert.doesNotMatch(editorSource, /cm-gutterElement::before/)
})
