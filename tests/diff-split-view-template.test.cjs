const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(
  path.join(root, 'packages', 'agent', 'src', 'components', 'agentCommon', 'components', 'DiffSplitView.vue'),
  'utf8',
)

assert.doesNotMatch(
  source,
  /<template\s+v-else\s+v-html=/,
  'DiffSplitView must render fallback highlighted diff lines on a real DOM element, not a <template> node',
)

const highlightedSpanMatches = source.match(/<span\s+v-html="highlight\(t, filePath\)"><\/span>/g) || []
assert.equal(
  highlightedSpanMatches.length,
  2,
  'DiffSplitView should render deleted and added diff lines on concrete inline span elements',
)

assert.doesNotMatch(
  source,
  /diff-word-changed|delSegments|addSegments/,
  'DiffSplitView should not render intra-line word diff markup after the shared line-level diff cleanup',
)

assert.match(
  source,
  /\.diff-line \{[\s\S]*width: max-content;[\s\S]*min-width: 100%;/,
  'DiffSplitView rows should expand to long-line width while still filling the viewport for short lines',
)

assert.match(
  source,
  /\.diff-line > span \{[\s\S]*min-width: max-content;/,
  'DiffSplitView fallback content should preserve long-line width inside the row',
)

assert.match(
  source,
  /\.diff-line :deep\(\.hljs\) \{[\s\S]*background: transparent !important;/,
  'DiffSplitView should force highlight.js wrappers to stay transparent so row diff backgrounds remain visible',
)

console.log('diff split view template test passed')
