# Markdown 本地路径链接化验收

> 日期：2026-06-26
> 关联：`docs/plan/2026-06-26-markdown-renderer-consolidation.md`、`T152`

## Dev 手测输入

把下面内容分别发送到 ClaudeCode / CodeX 对话气泡，或放进 Markdown Viewer 打开：

```md
实际路径 E:\work\Timer_manager\XRADIO_Flash_Developer_Guide-CN.pdf。

请打开 docs/TODO.md。

[打开 TODO](docs/TODO.md)

[官网](https://example.com)

`packages/agent/electron/claudeAgent.js`

<code>src/main.js</code>

不要把 he/she.go 当作文件。
```

## 预期结果

- `E:\work\Timer_manager\XRADIO_Flash_Developer_Guide-CN.pdf` 是一个完整可点击链接，`_` 不变成斜体，末尾 `。` 不进入链接。
- `docs/TODO.md` 普通文本和 `[打开 TODO](docs/TODO.md)` 都能通过 `data-path-candidate` 打开。
- `https://example.com` 仍按外链打开，不走本地文件候选。
- Markdown Viewer 中 inline code 和 raw `<code>` 内的路径默认不链接化。
- Agent 气泡当前仍保留 inline code 路径可点击的旧兼容行为，后续切换到统一 renderer 时再按 mode 明确。
- `he/she.go` 不应出现可点击链接。

## 自动化覆盖

- `tests/local-path-tokenizer.test.mjs`
- `tests/markdown-it-local-link.test.mjs`
- `tests/agent-markdown-render.test.mjs`
