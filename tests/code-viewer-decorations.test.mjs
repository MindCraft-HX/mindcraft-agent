import assert from 'node:assert/strict'
import {
  applyCollapsedRanges,
  buildIndentFoldRanges,
  findEnclosingFoldStarts,
  highlightHtmlMatches,
} from '../src/components/mdViewer/codeViewerDecorations.mjs'

const lines = [
  { number: 1, text: 'function demo() {' },
  { number: 2, text: '  const a = 1' },
  { number: 3, text: '  if (a) {' },
  { number: 4, text: '    return a' },
  { number: 5, text: '  }' },
  { number: 6, text: '}' },
]

const ranges = buildIndentFoldRanges(lines)

assert.equal(ranges.length, 2)
assert.equal(ranges[0].startLineNumber, 1)
assert.equal(ranges[0].endLineNumber, 6)
assert.equal(ranges[1].startLineNumber, 3)
assert.equal(ranges[1].endLineNumber, 5)

const decorated = applyCollapsedRanges(lines, ranges, new Set([1]))
assert.equal(decorated.length, 1)
assert.equal(decorated[0].kind, 'fold')
assert.equal(decorated[0].line.number, 1)
assert.equal(decorated[0].hiddenCount, 5)

const partial = applyCollapsedRanges(lines, ranges, new Set([3]))
assert.equal(partial.length, 4)
assert.equal(partial[2].kind, 'fold')
assert.equal(partial[2].hiddenCount, 2)

const enclosing = findEnclosingFoldStarts(ranges, 4)
assert.deepEqual(enclosing, [1, 3])

const highlighted = highlightHtmlMatches(
  '<span class="hljs-keyword">const</span> title = &lt;demo&gt;',
  [{ start: 6, end: 11 }]
)

assert.match(highlighted, /<mark class="code-search-hit">title<\/mark>/)

console.log('code viewer decorations test passed')
