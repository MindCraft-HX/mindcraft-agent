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

const inlineCodeWithUnderscoreHtml = renderContent(
  'Run `wasm_gtslidersettagrawdata` before `gt_slidersettagrawdata`.'
)

assert.ok(
  inlineCodeWithUnderscoreHtml.includes('<code class="inline-code">wasm_gtslidersettagrawdata</code>'),
  'inline code should preserve underscores in the first code span'
)
assert.ok(
  inlineCodeWithUnderscoreHtml.includes('<code class="inline-code">gt_slidersettagrawdata</code>'),
  'inline code should preserve underscores in the second code span'
)
assert.ok(
  !inlineCodeWithUnderscoreHtml.includes('<em>'),
  'underscore emphasis should not be parsed across inline code spans'
)

// --- 表格渲染测试 ---

// A1: 全无管道格式（GFM 允许缺首尾管道）
const noPipesTable = `Col1 | Col2\n---|---\na | b`
const noPipesHtml = renderContent(noPipesTable)
assert.ok(noPipesHtml.includes('<table class="md-table">'), 'A1: no-pipe table should render as table')
assert.ok(noPipesHtml.includes('<td>a</td>') && noPipesHtml.includes('<td>b</td>'), 'A1: data cells should be present')

// A2: 仅前导管道
const leadingPipe = `| Col1 | Col2\n|---|---|\n| a | b |`
const leadingPipeHtml = renderContent(leadingPipe)
assert.ok(leadingPipeHtml.includes('<table'), 'A2: leading-pipe-only table should render')

// A3: 仅尾部管道（缺前导管道）
const trailingPipe = `Col1 | Col2 |\n---|--- |\na | b |`
const trailingPipeHtml = renderContent(trailingPipe)
assert.ok(trailingPipeHtml.includes('<table'), 'A3: trailing-pipe-only table should render')

// A4: 2 连字符分隔行
const twoHyphen = `Col1 | Col2\n:--|:--:\na | b`
const twoHyphenHtml = renderContent(twoHyphen)
assert.ok(twoHyphenHtml.includes('<table'), 'A4: 2-hyphen separator should render as table')
assert.ok(twoHyphenHtml.includes('text-align:left') && twoHyphenHtml.includes('text-align:center'), 'A4: alignment should be preserved')

// A5: 1 连字符分隔行（GFM 最小要求）
const oneHyphen = `Col1 | Col2\n:-|:-:\na | b`
const oneHyphenHtml = renderContent(oneHyphen)
assert.ok(oneHyphenHtml.includes('<table'), 'A5: 1-hyphen separator should render as table')

// --- 防误报测试 ---

// B1: shell 管道命令不应渲染为表格
const shellPipe = `ls -la | grep foo\nthe output shows results`
const shellPipeHtml = renderContent(shellPipe)
assert.ok(!shellPipeHtml.includes('<table'), 'B1: shell pipe command should NOT render as table')

// B2: 文章中的管道字符不应当表格
const proseWithPipe = `This is text | with a pipe character\nMore text here`
const proseWithPipeHtml = renderContent(proseWithPipe)
assert.ok(!proseWithPipeHtml.includes('<table'), 'B2: prose with pipe should NOT render as table')

// B3: 伪表格无分隔行
const pseudoTable = `A | B | C\nD | E | F`
const pseudoTableHtml = renderContent(pseudoTable)
assert.ok(!pseudoTableHtml.includes('<table'), 'B3: pseudo-table without separator should NOT render')

// --- 表格 + 路径链接共存 ---

// C1: 单元格含相对路径
const relativePathTable = `File | Description\n---|---\ndocs/TODO.md | Task list`
const relativePathHtml = renderContent(relativePathTable)
assert.ok(relativePathHtml.includes('<table'), 'C1: table with relative path should render')
assert.ok(relativePathHtml.includes('data-path-candidate="docs/TODO.md"'), 'C1: relative path inside cell should be clickable')

// C2: 单元格含 Windows 绝对路径
const absolutePathTable = `File | Description\n---|---\nD:\\repo\\main.js | Entry point`
const absolutePathHtml = renderContent(absolutePathTable)
assert.ok(absolutePathHtml.includes('<table'), 'C2: table with absolute path should render')
assert.ok(absolutePathHtml.includes('data-path-candidate="D:\\repo\\main.js"'), 'C2: absolute path inside cell should be clickable')

// --- 表格 + 其他块元素 ---

// D1: 表格后接段落
const tableThenParagraph = `A | B\n---|---\n1 | 2\n\nText after table.`
const tableThenParagraphHtml = renderContent(tableThenParagraph)
assert.ok(tableThenParagraphHtml.includes('<table'), 'D1: table before paragraph should render')
assert.ok(tableThenParagraphHtml.includes('<p'), 'D1: paragraph after table should render')

// D2: 标题后接表格
const headingThenTable = `# Title\n\nA | B\n---|---\n1 | 2`
const headingThenTableHtml = renderContent(headingThenTable)
assert.ok(headingThenTableHtml.includes('<h1'), 'D2: heading before table should render')
assert.ok(headingThenTableHtml.includes('<table'), 'D2: table after heading should render')

// D3: 段落后接表格（无空行）
const paragraphThenTable = `Some text\nA | B\n---|---\n1 | 2`
const paragraphThenTableHtml = renderContent(paragraphThenTable)
assert.ok(paragraphThenTableHtml.includes('<p'), 'D3: paragraph before table should render')
assert.ok(paragraphThenTableHtml.includes('<table'), 'D3: table after paragraph (no blank line) should render')

// D4: 表格内联 Markdown 格式
const richTable = `Feature | Status\n---|---\n**Login** | \`done\`\n*Signup* | ~~pending~~`
const richTableHtml = renderContent(richTable)
assert.ok(richTableHtml.includes('<table'), 'D4: table with inline markdown should render')
assert.ok(richTableHtml.includes('<strong>Login</strong>'), 'D4: bold in cell should work')
assert.ok(richTableHtml.includes('<code class="inline-code">done</code>'), 'D4: code in cell should work')
assert.ok(richTableHtml.includes('<del>pending</del>'), 'D4: strikethrough in cell should work')

// --- 路径链接化回归测试（保护 afb16f5 目录前缀分支不退化） ---

// E1: 白名单目录路径不带扩展名
const noExt_1 = renderContent('docs/TODO')
assert.ok(noExt_1.includes('data-path-candidate="docs/TODO"'), 'E1: whitelisted dir path without extension should be clickable')

assert.ok(renderContent('src/main').includes('data-path-candidate="src/main"'), 'E1: src/main should be clickable')
assert.ok(renderContent('packages/foo/bar').includes('data-path-candidate="packages/foo/bar"'), 'E1: packages/foo/bar should be clickable')
assert.ok(renderContent('config/settings').includes('data-path-candidate="config/settings"'), 'E1: config/settings (new whitelist) should be clickable')
assert.ok(renderContent('scripts/deploy').includes('data-path-candidate="scripts/deploy"'), 'E1: scripts/deploy (new whitelist) should be clickable')
assert.ok(renderContent('lib/utils').includes('data-path-candidate="lib/utils"'), 'E1: lib/utils (new whitelist) should be clickable')

// E2: 带扩展名的白名单路径仍然正常
assert.ok(renderContent('docs/TODO.md').includes('data-path-candidate="docs/TODO.md"'), 'E2: with extension should still be clickable')
assert.ok(renderContent('src/main.js').includes('data-path-candidate="src/main.js"'), 'E2: src/main.js with extension')

// E3: 非白名单路径不带扩展名不应当链接
const nonWhitelist = renderContent('other/file')
assert.ok(!nonWhitelist.includes('data-path-candidate'), 'E3: non-whitelisted dir without extension should NOT be clickable')

// E4: ./ ../ 相对路径
assert.ok(renderContent('./foo/bar.md').includes('data-path-candidate="./foo/bar.md"'), 'E4: ./ relative path should be clickable')
assert.ok(renderContent('../parent/file.ts').includes('data-path-candidate="../parent/file.ts"'), 'E4: ../ relative path should be clickable')

// E5: Unix 绝对路径（afb16f5 新增支持）
assert.ok(renderContent('/home/user/file.txt').includes('data-path-candidate="/home/user/file.txt"'), 'E5: Unix absolute path should be clickable')

// E6: 英文短语假阳性过滤
assert.ok(!renderContent('he/she.go').includes('data-path-candidate'), 'E6: he/she.go should NOT be clickable (false positive filter)')

console.log('agent markdown render test passed')
