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

Regular docs/TODO.md`)

assert.ok(rawHtml.includes('<script>docs/TODO.md</script>'), 'raw script contents should not be linkified')
assert.ok(rawHtml.includes('<code>src/main.js</code>'), 'raw code tag contents should not be linkified')
assert.equal((rawHtml.match(/data-path-candidate=/g) || []).length, 1, 'only ordinary text outside protected tags should be linkified')

console.log('markdown it local link test passed')
