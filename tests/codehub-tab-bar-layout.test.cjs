const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(
  path.join(__dirname, '../packages/agent/src/components/codeHub/index.vue'),
  'utf8'
)

assert.match(source, /class="codehub-tab-track"[\s\S]*v-for="\(tab, idx\) in unifiedTabs"/)
assert.match(source, /class="codehub-tab-add"[\s\S]*class="codehub-window-spacer"/)
assert.doesNotMatch(source, /<div class="drag-spacer"><\/div>/)
assert.match(source, /\.codehub-tab-track\s*\{[\s\S]*overflow-x:\s*auto/)
assert.match(source, /\.codehub-window-spacer\s*\{[\s\S]*flex:\s*0 0 90px/)
assert.match(source, /\.codehub-tab\s*\{[\s\S]*width:\s*220px;\s*min-width:\s*120px;\s*max-width:\s*220px/)
assert.match(source, /\.codehub-tab\s*\{[\s\S]*flex:\s*0 1 220px/)

console.log('codehub tab bar layout test passed')
