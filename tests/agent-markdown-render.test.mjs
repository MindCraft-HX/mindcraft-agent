import assert from 'node:assert/strict'
import { renderContent } from '../packages/agent/src/components/agentCommon/render.js'

const orderedListWithContinuation = `1. First item
   Explanation A

2. Second item
   Explanation B`

const continuationHtml = renderContent(orderedListWithContinuation)

assert.equal((continuationHtml.match(/<ol class="md-ol">/g) || []).length, 1, 'list items with continuation paragraphs should stay in one ol')
assert.ok(continuationHtml.includes('<li>First item<p class="md-p">Explanation A</p></li>'), 'first continuation paragraph should stay inside the first li')
assert.ok(continuationHtml.includes('<li>Second item<p class="md-p">Explanation B</p></li>'), 'second continuation paragraph should stay inside the second li')
assert.ok(!continuationHtml.includes('</ol><p class="md-p">'), 'continuation paragraphs should not be split outside the list')

const splitOrderedList = `1. First item
2. Second item
3. Third item

Supporting note between the two ordered lists.

4. Fourth item
5. Fifth item`

const splitHtml = renderContent(splitOrderedList)

assert.equal((splitHtml.match(/<ol class="md-ol"(?: start="\d+")?>/g) || []).length, 2, 'separated ordered lists should remain two ol blocks')
assert.ok(splitHtml.includes('<ol class="md-ol"><li>First item</li><li>Second item</li><li>Third item</li></ol>'), 'the first ordered list should keep items 1-3')
assert.ok(splitHtml.includes('<ol class="md-ol" start="4"><li>Fourth item</li><li>Fifth item</li></ol>'), 'the second ordered list should preserve start=4')

const looseOrderedList = `1. First conclusion

Supporting detail for the first conclusion.

1. Second conclusion

Supporting detail for the second conclusion.

1. Third conclusion`

const looseHtml = renderContent(looseOrderedList)

assert.equal((looseHtml.match(/<ol class="md-ol"(?: start="\d+")?>/g) || []).length, 1, 'AI-style loose ordered lists should render as one ol')
assert.ok(looseHtml.includes('<li>First conclusion<p class="md-p">Supporting detail for the first conclusion.</p></li>'), 'the first loose item should keep its supporting paragraph')
assert.ok(looseHtml.includes('<li>Second conclusion<p class="md-p">Supporting detail for the second conclusion.</p></li>'), 'the second loose item should keep its supporting paragraph')
assert.ok(looseHtml.includes('<li>Third conclusion</li>'), 'the third loose item should remain in the same ordered list')

const restartedOrderedList = `4. Define the agent boundary

Render components, stores, preload bridge, and mainModules should be split by responsibility.

2. Refactor the in-repo shared module

Serve mindcraft-electron and mindcraft-lite first, without forcing npm packaging.

3. Build the Lite shell`

const restartedHtml = renderContent(restartedOrderedList)

assert.equal((restartedHtml.match(/<ol class="md-ol"(?: start="\d+")?>/g) || []).length, 3, 'separate ordered sections with restarted numbering should stay as separate ol blocks')
assert.ok(restartedHtml.includes('<ol class="md-ol" start="4"><li>Define the agent boundary</li></ol>'), 'the first list should preserve start=4')
assert.ok(restartedHtml.includes('<p class="md-p">Render components, stores, preload bridge, and mainModules should be split by responsibility.</p>'), 'the explanation between restarted lists should remain a paragraph')
assert.ok(restartedHtml.includes('<ol class="md-ol" start="2"><li>Refactor the in-repo shared module</li></ol>'), 'the second list should restart at 2 instead of being merged into the previous item')
assert.ok(restartedHtml.includes('<p class="md-p">Serve mindcraft-electron and mindcraft-lite first, without forcing npm packaging.</p>'), 'the second explanatory paragraph should remain outside the list')
assert.ok(restartedHtml.includes('<ol class="md-ol" start="3"><li>Build the Lite shell</li></ol>'), 'the third list should remain independent')

const localPathMarkdown = `请查看 docs/TODO.md

[打开主进程](electron/main.js)

绝对路径 D:\\repo\\src\\main.js 也应该可点击`

const localPathHtml = renderContent(localPathMarkdown)

assert.ok(localPathHtml.includes('data-path-candidate="docs/TODO.md"'), 'project-relative paths should become clickable candidates')
assert.ok(localPathHtml.includes('title="打开 docs/TODO.md"'), 'local path candidates should expose a clickable title')
assert.ok(localPathHtml.includes('data-path-candidate="electron/main.js"'), 'markdown local links should use the unified path candidate attribute')
assert.ok(localPathHtml.includes('data-path-candidate="D:\\repo\\src\\main.js"'), 'absolute windows paths should become clickable candidates')
assert.ok(!localPathHtml.includes('data-local-file-path='), 'legacy local-file-path attribute should no longer be emitted')

const fencedPathMarkdown = `\`\`\`md
docs/TODO.md
src/main.js
[打开 TODO](docs/TODO.md)
\`\`\``

const fencedPathHtml = renderContent(fencedPathMarkdown)

assert.ok(fencedPathHtml.includes('data-path-candidate="docs/TODO.md"'), 'strong local paths inside fenced blocks should become clickable candidates')
assert.ok(fencedPathHtml.includes('data-path-candidate="src/main.js"'), 'multiple strong local paths inside fenced blocks should become clickable candidates')

const packagesPathHtml = renderContent('packages/agent/electron/codexAgent.js')

assert.ok(
  packagesPathHtml.includes('data-path-candidate="packages/agent/electron/codexAgent.js"'),
  'packages/agent source paths should become clickable candidates'
)

const absoluteMarkdownLinkHtml = renderContent(
  '[documentLocator.js](/D:/repo/electron/mainModules/documentLocator.js)'
)

assert.ok(
  absoluteMarkdownLinkHtml.includes('data-path-candidate="D:/repo/electron/mainModules/documentLocator.js"'),
  'absolute local markdown links should route through path candidates instead of plain href links'
)
assert.ok(
  !absoluteMarkdownLinkHtml.includes('href="/D:/repo/electron/mainModules/documentLocator.js"'),
  'absolute local markdown links should not fall back to raw href navigation'
)

console.log('agent markdown render test passed')
