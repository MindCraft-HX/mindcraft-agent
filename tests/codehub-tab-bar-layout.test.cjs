const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(
  path.join(__dirname, '../packages/agent/src/components/codeHub/index.vue'),
  'utf8'
)

assert.match(source, /class="codehub-tab-track"[\s\S]*v-for="\(tab, idx\) in unifiedTabs"/)
assert.match(source, /class="codehub-tab-strip"[\s\S]*class="codehub-tab-track"[\s\S]*class="codehub-tab-add"[\s\S]*class="codehub-window-spacer"/)
assert.doesNotMatch(source, /<div class="drag-spacer"><\/div>/)
assert.doesNotMatch(source, /grid-template-columns:/)
assert.match(source, /\.codehub-tab-strip\s*\{[\s\S]*flex:\s*0 1 max-content;[\s\S]*max-width:\s*calc\(100% - var\(--mc-window-controls-width, 138px\)\)/)
assert.match(source, /\.codehub-tab-track\s*\{[\s\S]*overflow-x:\s*auto/)
assert.match(source, /\.codehub-tab\s*\{[\s\S]*width:\s*220px;\s*min-width:\s*120px;\s*max-width:\s*220px/)
assert.match(source, /\.codehub-tab\s*\{[\s\S]*flex:\s*0 1 220px/)
assert.match(source, /\.codehub-window-spacer\s*\{[\s\S]*min-width:\s*var\(--mc-window-controls-width, 138px\);[\s\S]*-webkit-app-region:\s*no-drag/)

const mainSource = fs.readFileSync(path.join(__dirname, '../src/Main.vue'), 'utf8')
assert.match(mainSource, /--mc-window-controls-width:\s*138px/)
assert.match(mainSource, /\.wc-btn\s*\{[\s\S]*width:\s*46px;[\s\S]*height:\s*40px/)

const appSource = fs.readFileSync(path.join(__dirname, '../src/App.vue'), 'utf8')
assert.match(appSource, /\.drag-spacer\s*\{[\s\S]*width:\s*var\(--mc-window-controls-width, 138px\)/)

console.log('codehub tab bar layout test passed')
