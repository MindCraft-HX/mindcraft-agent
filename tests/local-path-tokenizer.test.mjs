import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import {
  markdownItLocalPathPlugin,
  splitLocalPathText,
} from '../packages/agent/src/components/agentCommon/render.js'

const windowsPath = 'E:\\work\\Timer_manager\\XRADIO_Flash_Developer_Guide-CN.pdf'
const segments = splitLocalPathText(`实际路径 ${windowsPath}。`)

assert.deepEqual(
  segments,
  [
    { type: 'text', content: '实际路径 ' },
    { type: 'path', content: windowsPath, candidate: windowsPath },
    { type: 'text', content: '。' },
  ],
  'tokenizer should split windows paths while keeping trailing Chinese punctuation outside the candidate'
)

assert.equal(
  splitLocalPathText('he/she.go').some((segment) => segment.type === 'path'),
  false,
  'short phrase-like path candidates should not be treated as local files'
)

assert.deepEqual(
  splitLocalPathText('\\\\server\\share[readonly]'),
  [
    { type: 'path', content: '\\\\server\\share[readonly', candidate: '\\\\server\\share[readonly' },
    { type: 'text', content: ']' },
  ],
  'current UNC bracket behavior should stay visible until tokenizer support is widened explicitly'
)

assert.equal(
  splitLocalPathText('file:///D:/repo/docs/index.md').some((segment) => segment.type === 'path'),
  true,
  'file:// windows absolute paths should be recognized as local candidates'
)

assert.equal(
  splitLocalPathText('/home/user/My Documents/spec.md').some((segment) => segment.type === 'path'),
  true,
  'unix absolute paths containing spaces should be recognized as one local candidate'
)

assert.equal(
  splitLocalPathText('./docs/index.md').some((segment) => segment.type === 'path'),
  true,
  './ relative paths should be recognized as local candidates'
)

assert.equal(
  splitLocalPathText('../notes/plan.md').some((segment) => segment.type === 'path'),
  true,
  '../ relative paths should be recognized as local candidates'
)

assert.equal(
  splitLocalPathText('/home/user/file.txt').some((segment) => segment.type === 'path'),
  true,
  'unix absolute paths should be recognized as local candidates'
)

const md = new MarkdownIt({ html: true, linkify: true }).use(markdownItLocalPathPlugin)

const html = md.render(`实际路径 ${windowsPath}

请看 docs/index.md。

[打开 TODO](docs/index.md)

\`packages/agent/electron/claudeAgent.js\`

<code>src/main.js</code>`)

assert.ok(
  html.includes('data-path-candidate="E:\\work\\Timer_manager\\XRADIO_Flash_Developer_Guide-CN.pdf"') ||
    html.includes('data-path-candidate="E:\\work\\Timer_manager\\XRADIO_Flash_Developer_Guide-CN.pdf"'.replace(/\\/g, '&#x5C;')),
  'plugin should linkify plain windows paths with underscores'
)
assert.ok(
  html.includes('data-path-candidate="docs/index.md"'),
  'plugin should linkify plain project paths'
)
assert.ok(
  !html.includes('data-path-candidate="docs/index.md。"'),
  'plugin should exclude trailing Chinese punctuation from candidates'
)
assert.equal(
  (html.match(/data-path-candidate="docs\/index\.md"/g) || []).length,
  2,
  'plain path and markdown local link should both route through data-path-candidate'
)
assert.ok(
  html.includes('<code>packages/agent/electron/claudeAgent.js</code>'),
  'inline code should not be linkified by the markdown-it plugin by default'
)
assert.ok(
  html.includes('<code>src/main.js</code>'),
  'raw HTML code content should not be linkified'
)
assert.ok(
  !html.includes('<em>manager\\XRADIO</em>'),
  'underscores inside local paths should not become emphasis'
)

console.log('local path tokenizer/plugin tests passed')
