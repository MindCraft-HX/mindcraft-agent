# Markdown 渲染与本地路径链接化收口方案

> 日期：2026-06-26
> 范围：Agent 对话气泡、Markdown Viewer、本地文件路径链接化
> 结论：保留 `markdown-it`，收口渲染架构；不要继续在 HTML 字符串层叠加零散 regex。

## 1. 背景

近期多次出现本地文件路径渲染问题：

- Windows 路径中的 `_` 被误解析为 markdown 斜体，导致 `Timer_manager\XRADIO_Flash_Developer_Guide-CN.pdf` 显示断裂。
- 本地路径链接化曾破坏 raw HTML / `<code>` / `<script>` 内部文本。
- 无扩展名工程路径、中文标点结尾、绝对 Windows 路径、inline-code 路径等场景反复补回归。

这些问题表面上是路径识别或 markdown 语法细节，根因是当前渲染职责没有分层。

## 2. 当前状态

目前存在两套渲染入口：

| 场景 | 文件 | 特征 |
|------|------|------|
| Markdown Viewer | `src/utils/MarkdownIt.js` | 使用 `markdown-it`，渲染后再调用 `linkifyHtmlTextNodes()` |
| Agent 对话气泡 | `packages/agent/src/components/agentCommon/render.js` | 手写 markdown block/inline parser，路径链接化也在此文件内 |

共享的打开链路是正确的：

```text
data-path-candidate
  -> 全局 click handler
  -> openDocumentCandidate IPC
  -> documentLocator
```

问题不在文件打开链路，而在 `data-path-candidate` 生成阶段。

## 3. 根因

当前 `agentCommon/render.js` 把这些职责混在同一层字符串处理中：

- markdown inline 解析：`*...*`、`_..._`、`` `...` ``、链接、图片等
- 本地路径识别：Windows / Unix / 工程相对路径 / 白名单目录
- HTML 后处理：对渲染后的 HTML 文本节点再次 linkify
- 代码块高亮后的文本再链接化

这会导致字符语义互相抢占：

- `_` 同时可能是文件名字符和 markdown emphasis 分隔符。
- `\` 同时可能是 Windows 路径分隔符和 markdown escape。
- `)`、`.`、`。` 同时可能是路径尾部、markdown link 结尾或自然语言标点。
- 渲染后再扫描 HTML 时，原始 token 边界已经丢失。

因此继续在局部补 regex，不能根治。

## 4. 架构判断

`markdown-it` 不是问题来源，不建议换库。

原因：

- CommonMark 对 intraword underscore 等规则已有成熟处理，`Timer_manager` 这类文本不应被解析为 emphasis。
- 当前问题来自绕过 parser 后手写 inline 规则，而不是 `markdown-it` 能力不足。
- 换成 `marked` / `remark` / `micromark` 后，如果仍在 HTML 字符串层做后置 regex，问题会换一种形式继续出现。

正确方向是：保留 `markdown-it`，把本地路径链接化做成 token 级扩展，并让 Agent 气泡和 Markdown Viewer 共享同一套渲染入口。

## 5. 目标架构

### 5.1 单一渲染入口

新增共享模块，例如：

```text
packages/agent/src/components/agentCommon/markdown/
  renderMarkdown.js
  localPathPlugin.js
  markdownModes.js
```

统一导出：

```js
renderMarkdown(markdown, {
  mode: 'agent-message' | 'document-viewer',
  linkifyLocalPaths: true,
  allowHtml: false,
  linkifyCodeBlocks: false,
})
```

### 5.2 markdown-it 负责 markdown 语法

由 `markdown-it` 负责：

- emphasis / strong / inline code
- fenced code block
- list / ordered list / task list
- table
- markdown link / image

不要在 `render.js` 中继续维护第二套 inline markdown 语法。

### 5.3 本地路径识别改为 token 级插件

路径链接化插件只处理 `text` token：

```text
text token
  -> split local path candidates
  -> text + link_open(data-path-candidate) + text + link_close
```

默认跳过：

- `code_inline`
- `fence`
- `code_block`
- 已有 markdown link 内部文本
- raw HTML token

如确需保留“代码块内路径可点击”，必须作为显式模式开关处理，而不是默认在 HTML 字符串里扫描。

### 5.4 打开链路保持不变

继续使用：

```text
data-path-candidate -> openDocumentCandidate
```

`documentLocator` 不参与 markdown 语法判断，只负责把候选路径解析为可打开文件。

## 6. 模式差异

| mode | 适用场景 | html | 路径链接化 | 代码块路径 |
|------|----------|------|------------|------------|
| `agent-message` | Claude / Codex 对话气泡 | 默认禁用 | 启用 | 默认禁用 |
| `document-viewer` | 本地 Markdown 文档 | 可配置保留 | 启用 | 可配置 |

Agent 消息来自模型输出，应优先避免 raw HTML 造成渲染和安全边界扩大。

Markdown Viewer 面向本地文档，可保留更多 markdown 能力，但路径链接化仍应走 token/plugin，不再对完整 HTML 字符串做盲扫。

## 7. 迁移步骤

### Phase 0：冻结当前修复

目标：保留当前止血修复，避免继续扩大 regex 逻辑。

- 保留 `render.js` 中已补的 underscore emphasis 边界修复。
- 新增的路径回归测试继续保留。
- 后续新的路径渲染 bug 优先归入本专题，不再直接补散点 regex。

### Phase 1：抽出本地路径 tokenizer

目标：先把路径识别从 HTML 处理里拆出来。

- 从 `render.js` 提取 `isStrongLocalPathCandidate()` / `trimLocalPathCandidate()` 的纯逻辑。
- 增加单测覆盖：
  - Windows 绝对路径
  - Unix 绝对路径
  - 工程相对路径
  - 中文标点结尾
  - `he/she.go` 这类误报
  - 带 `_`、空格、括号的路径

### Phase 2：实现 markdown-it local path plugin

目标：在 token 层生成 `data-path-candidate`。

- 插件只处理 `inline` token 的 `text` children。
- 跳过 `link_open` 到 `link_close` 范围内的文本，避免嵌套链接。
- 跳过 `code_inline`。
- 本地 markdown link 的 `href` 转为 `data-path-candidate`，外链仍保留 `href + target=_blank`。

### Phase 3：Agent 气泡切换到共享 renderer

目标：逐步替换 `renderContent()` 的手写 parser。

- 先在测试中对比新旧输出关键语义，不要求 HTML 完全一致。
- 优先保证：
  - 普通段落
  - 列表
  - 表格
  - 代码块
  - inline code
  - 本地路径链接
  - 外链
- 切换 Claude / Codex 共享消息气泡。

### Phase 4：Markdown Viewer 复用共享 renderer

目标：消除 `src/utils/MarkdownIt.js` 与 `agentCommon/render.js` 的重复职责。

- Markdown Viewer 使用 `mode: 'document-viewer'`。
- Mermaid、heading anchor、公式保护等 Viewer 专属能力通过 mode/plugin 配置保留。
- 删除或废弃 `linkifyHtmlTextNodes()` 的全局 HTML 后处理用法。

### Phase 5：清理旧实现

目标：防止新旧链路长期并存。

- `render.js` 只保留：
  - 全局路径点击 handler
  - 打开错误提示
  - 必要的兼容导出
- 删除手写 inline parser 或标记 deprecated。
- 边界测试改为覆盖共享 renderer。

## 8. 验收矩阵

必须覆盖以下用例：

| 类别 | 用例 | 预期 |
|------|------|------|
| Windows 路径 | `E:\work\Timer_manager\XRADIO_Flash_Developer_Guide-CN.pdf` | `_` 保留，不触发 emphasis，可点击 |
| 中文标点 | `docs/TODO.md。` | candidate 不包含 `。` |
| markdown link | `[打开](../TODO.md)` | 生成 `data-path-candidate` |
| 外链 | `[官网](https://example.com)` | 保留外链 |
| inline code | `` `wasm_gtslidersettagrawdata` `` | 不触发 `_` emphasis |
| inline code 路径 | `` `packages/agent/electron/claudeAgent.js` `` | 是否可点击由 mode 明确决定 |
| raw HTML | `<script>docs/TODO.md</script>` | 不插入链接 |
| 表格 | `File | Desc` 中含路径 | 表格渲染正常，路径可点击 |
| 误报 | `he/she.go` | 不生成路径候选 |

## 9. 不做的事

- 不替换 `markdown-it`。
- 不改变 `openDocumentCandidate` / `documentLocator` 打开链路。
- 不为了短期兼容继续扩大 HTML 字符串级 linkify。
- 不把 Agent 消息里的 raw HTML 能力作为默认行为。

## 10. 风险

1. `render.js` 当前手写 parser 的 HTML 结构与 CSS 深度耦合，切换到 `markdown-it` 后需要对 `.agent-markdown` 样式做一次对齐。
2. 代码块内路径是否继续可点击需要产品决策；从架构上应作为显式 mode，而不是默认行为。
3. Markdown Viewer 有 Mermaid、公式、heading anchor 等能力，迁移时需要逐项保留。
4. 测试应以语义为主，不要要求新旧 HTML 字符串完全一致，否则会拖慢迁移。

## 11. 当前结论

当前 bug 的短期修复是必要的，但长期不能继续靠 `render.js` 内部 regex 扩张。

本专题的完成标准是：Agent 气泡和 Markdown Viewer 共用同一个 markdown parser 管线，本地路径链接化在 token 层完成，HTML 后处理只作为兼容路径保留或移除。

## 12. 2026-06-26 Phase 1/2 进展

已完成：

- 新增共享本地路径 tokenizer：`packages/agent/src/components/agentCommon/markdown/localPathTokenizer.js`。
- 新增 `markdown-it` token 级本地路径插件：`packages/agent/src/components/agentCommon/markdown/localPathPlugin.js`。
- `render.js` 复用共享 tokenizer，避免 Agent 气泡和 Markdown Viewer 的路径识别规则继续分叉。
- Markdown Viewer 改为使用 token 级插件，移除 `renderHtml()` 末尾 `linkifyHtmlTextNodes(rendered)` 的 HTML 字符串后处理。
- 插件跳过 markdown inline code、raw HTML `<code>` / `<script>` 等保护区域，并处理 Windows 反斜杠路径在 `markdown-it` 中拆成 `text` + `text_special` 的情况。
- 增加自动化覆盖：`tests/local-path-tokenizer.test.mjs`、`tests/markdown-it-local-link.test.mjs`、`tests/agent-markdown-render.test.mjs`。
- 完成开发态手工回归；覆盖范围由自动化测试和本文记录。

仍待后续：

- Agent 气泡仍保留手写 block/inline parser，仅路径识别已复用共享 tokenizer。
- 代码块内路径可点击仍是 Agent 旧兼容行为；全量切换共享 renderer 时需要用 mode 显式决定。
