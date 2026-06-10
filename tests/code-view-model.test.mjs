import assert from 'node:assert/strict'
import {
  buildCodeViewModel,
  shouldDeferCodeHighlight,
} from '../src/components/mdViewer/codeViewModel.mjs'

assert.equal(shouldDeferCodeHighlight('a'.repeat(4000)), false)
assert.equal(shouldDeferCodeHighlight('a'.repeat(20000)), true)

const model = buildCodeViewModel({
  text: 'const a = 1;\nconst b = 2;\n',
  filePath: 'D:/repo/demo.ts',
  ext: 'ts',
})

assert.equal(model.extLabel, 'TS')
assert.equal(model.lineCount, 2)
assert.equal(model.charCount, 25)
assert.equal(model.lines.length, 2)
assert.equal(model.lines[0].number, 1)
assert.match(model.lines[0].html, /const/)
assert.equal(model.lines[1].numberText, '2')

const largeModel = buildCodeViewModel({
  text: `${'line\n'.repeat(6000)}`,
  filePath: 'D:/repo/huge.log',
  ext: 'log',
})

assert.equal(largeModel.isLargeFile, true)
assert.equal(largeModel.shouldDeferHighlight, true)
assert.equal(largeModel.lines.length, 6000)

console.log('code view model test passed')
