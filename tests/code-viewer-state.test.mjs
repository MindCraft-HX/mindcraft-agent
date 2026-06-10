import assert from 'node:assert/strict'
import {
  clampLineNumber,
  findCodeMatches,
  getInitialViewport,
  getVisibleWindow,
} from '../src/components/mdViewer/codeViewerState.mjs'

assert.equal(clampLineNumber(0, 10), 1)
assert.equal(clampLineNumber(5, 10), 5)
assert.equal(clampLineNumber(99, 10), 10)

const matches = findCodeMatches([
  { number: 1, text: 'const total = 1;' },
  { number: 2, text: 'const title = "demo";' },
  { number: 3, text: 'return total + 1;' },
], 'total')

assert.equal(matches.length, 2)
assert.equal(matches[0].lineNumber, 1)
assert.equal(matches[0].start, 6)
assert.equal(matches[1].lineNumber, 3)

assert.equal(findCodeMatches([{ number: 1, text: 'abc' }], '').length, 0)

const viewport = getInitialViewport({
  lineCount: 2000,
  rowHeight: 22,
  viewportHeight: 440,
})

assert.equal(viewport.visibleCount, 20)
assert.equal(viewport.overscan, 8)

const visible = getVisibleWindow({
  lines: Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    text: `line-${index + 1}`,
  })),
  scrollTop: 220,
  rowHeight: 22,
  viewportHeight: 220,
  overscan: 4,
})

assert.equal(visible.startIndex, 6)
assert.equal(visible.endIndex, 24)
assert.equal(visible.items[0].number, 7)
assert.equal(visible.items.at(-1).number, 25)
assert.equal(visible.offsetTop, 132)

console.log('code viewer state test passed')
