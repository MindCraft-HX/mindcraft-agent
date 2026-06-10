import assert from 'node:assert/strict'
import { renderHtml } from '../src/utils/MarkdownIt.js'

const html = renderHtml(`[打开 TODO](docs/TODO.md)

请查看 docs/TODO.md

[官网](https://example.com)`)

assert.ok(html.includes('data-path-candidate="docs/TODO.md"'), 'markdown local links should route through path candidate attributes')
assert.ok(/data-path-candidate="docs\/TODO\.md"/.test(html), 'plain strong local paths should become clickable candidates in markdown viewer output')
assert.ok(html.includes('href="https://example.com"'), 'external links should stay external')
assert.ok(html.includes('target="_blank"'), 'external links should preserve target blank behavior')

console.log('markdown it local link test passed')
