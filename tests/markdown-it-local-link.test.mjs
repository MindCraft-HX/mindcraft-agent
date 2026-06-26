import assert from 'node:assert/strict'
import { renderHtml } from '../src/utils/MarkdownIt.js'

const html = renderHtml(`[打开 TODO](docs/TODO.md)

请查看 docs/TODO.md

[官网](https://example.com)`)

assert.ok(html.includes('data-path-candidate="docs/TODO.md"'), 'markdown local links should route through path candidate attributes')
assert.ok(/data-path-candidate="docs\/TODO\.md"/.test(html), 'plain strong local paths should become clickable candidates in markdown viewer output')
assert.ok(html.includes('href="https://example.com"'), 'external links should stay external')
assert.ok(html.includes('target="_blank"'), 'external links should preserve target blank behavior')

const rawHtml = renderHtml(`<script>docs/TODO.md</script>

<code>src/main.js</code>

Inline code \`packages/agent/electron/claudeAgent.js\`

Regular docs/TODO.md`)

assert.ok(rawHtml.includes('<script>docs/TODO.md</script>'), 'raw script contents should not be linkified')
assert.ok(rawHtml.includes('<code>src/main.js</code>'), 'raw code tag contents should not be linkified')
assert.ok(rawHtml.includes('<code>packages/agent/electron/claudeAgent.js</code>'), 'markdown inline code should not be linkified by the viewer plugin')
assert.equal((rawHtml.match(/data-path-candidate=/g) || []).length, 1, 'only ordinary text outside protected tags should be linkified')

const pathWithUnderscores = renderHtml('实际路径 E:\\work\\Timer_manager\\XRADIO_Flash_Developer_Guide-CN.pdf。')

assert.ok(
  pathWithUnderscores.includes('data-path-candidate="E:\\work\\Timer_manager\\XRADIO_Flash_Developer_Guide-CN.pdf"'),
  'windows paths with underscores should become one local path candidate'
)
assert.ok(
  !pathWithUnderscores.includes('data-path-candidate="E:\\work\\Timer_manager\\XRADIO_Flash_Developer_Guide-CN.pdf。"'),
  'trailing Chinese punctuation should not be included in viewer path candidates'
)
assert.ok(
  !pathWithUnderscores.includes('<em>manager\\XRADIO</em>'),
  'viewer should not render underscores inside windows paths as emphasis'
)

console.log('markdown it local link test passed')
