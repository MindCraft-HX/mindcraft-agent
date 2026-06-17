# mdViewer 文档查看器 — 问题专题文档

> **状态：未解决。** 以下记录原始问题、系统架构、已尝试的修改方案及其局限性。
> 编写目的：让接手的人（人或 AI）能在一份文档里拿到全部上下文，不用再追溯会话记录。

---

## 1. 原始问题清单

| # | 问题 | 用户描述 |
|---|------|----------|
| 1 | 第二个文档打不开 | 打开文档 A 后不关闭，点击文档 B，页面不切换/不渲染 |
| 2 | 代码文档始终深色 | 代码查看器工具栏/按钮/输入框不跟随主题切换（始终硬编码颜色） |
| 3 | 纯文本路径不渲染为链接 | 在文档查看器中，写在正文里的 `src/main.js` 不会变成可点击链接（气泡中正常） |
| 4 | dev 模式卡顿 | 开发模式下应用变卡 |
| 5 | 首页"文档"摘录显示异常 | 显示"未命名文档"而非真实文件名 |

---

## 2. 系统架构

### 2.1 数据流全景

```
用户点击文档（项目区/首页）
        │
        ▼
主进程 (electron/mdRouting.js)
  ├── 入队通道：push 到 pendingPayloads 数组（兜底）
  └── 直投通道：如果 mdViewerReady=true，直接 webContents.send('md-content', payload)
        │
        ▼
渲染进程 (src/components/mdViewer/index.vue)
  ├── onMounted：注册 IPC 监听器 onMdContent(enqueuePayload)
  │              + 排空 pendingPayloads（getPendingMdContent）
  └── enqueuePayload(payload) → applyPayloadSync(payload) + completePayloadAsync(payload, pendingTab)
        │
        ├── 同步：创建 tab、更新 refs、设置 activeTabId
        └── 异步：ensurePayloadContent（读文件）→ finalizeDocumentTab → 更新 tab
```

### 2.2 双通道设计（electron/mdRouting.js）

```js
// mdViewerReady 标志：仅在 did-finish-load 后设为 true，
// did-start-loading 时重置为 false（防止投递到即将销毁的旧页面）

// 通道 1：入队兜底（刷新/首访/重挂载恢复）
pendingPayloads.push(payload)

// 通道 2：就绪直投（keep-alive 下 onMounted 不会重新触发，
// 队列无人消费，必须直接投递）
if (mdViewerReady) {
  mainWindow.webContents.send('md-content', payload)
}
```

### 2.3 关键文件

| 文件 | 职责 |
|------|------|
| `electron/mdRouting.js` | 主进程侧路由：openMdInMain、双通道投递、IPC handler |
| `electron/main.js` | 注册 mdViewer IPC handler、DevTools 管理 |
| `src/components/mdViewer/index.vue` | 核心组件：tab 管理、payload 队列、渲染切换 |
| `src/components/mdViewer/documentPayload.mjs` | tab 数据模型工厂：createDocumentTab |
| `src/components/mdViewer/documentTabs.mjs` | pending tab 工厂：createPendingDocumentTab、finalizeDocumentTab |
| `src/components/mdViewer/viewers/CodeTextViewer.vue` | 代码查看器（~800 行，含 hljs 令牌样式和 UI chrome） |
| `src/components/mdViewer/viewers/MarkdownViewer.vue` | Markdown 查看器 |
| `src/utils/MarkdownIt.js` | markdown-it 实例配置 + renderHtml 函数 |
| `packages/agent/src/components/agentCommon/render.js` | 聊天气泡渲染器（含 linkifyHtmlTextNodes、linkifyStrongLocalPaths） |
| `src/styles/cc-theme-*.css` | 4 个主题文件（dark/light/blue/brown），定义 --cc-* 变量 |

---

## 3. 已尝试的修改方案

### 3.1 修复第二个文档打不开（Phase 1）

**根因分析：** 原来的 `addPayload` 将所有操作（创建 tab + 读文件 + 最终化）放入微任务队列。当 IPC `open-md-viewer` 消息触发 `router.push` 时，`activeTabId` 还未设置。

**修改内容：** 将 `addPayload` 拆分为同步+异步两段：

```js
// 同步部分：立即更新 UI（在 router.push 之前）
function applyPayloadSync(payload) {
  // 创建 tab、设置 activeTabId
  // 返回 pendingTab（需要异步读取时）或 null
}

// 异步部分：加入串行队列
function completePayloadAsync(payload, pendingTab) {
  // ensurePayloadContent → finalizeDocumentTab → upsertTab
  // 带 activeTabId 守卫，防止覆盖用户切换
}

// 入口：同步执行 applyPayloadSync，异步部分进队
function enqueuePayload(payload) {
  const pendingTab = applyPayloadSync(p)
  payloadQueue = payloadQueue
    .then(() => { if (pendingTab) return completePayloadAsync(p, pendingTab) })
    .catch(err => { console.error(...) })
}
```

**已知风险点：**
- `payloadQueue` 是模块级变量（`<script setup>` 顶层），Vue 的 `<script setup>` 变量是模块作用域而非实例作用域。组件被 keep-alive 停用重新激活时不会重置。
- 微任务 vs Task 时序：`applyPayloadSync` 的 ref 更新 + IPC task 中的 `router.push` 竞态仍需验证。
- `onMounted` drain 和 IPC 实时回调都走 `enqueuePayload`，如果 drain 时 IPC 回调同时到达，串行队列保序，但最坏情况下第一个 payload 的 `completePayloadAsync` 阻塞了后续所有 payload 的 `applyPayloadSync`（因为队列串行）。

### 3.2 CodeTextViewer UI chrome 主题化（Phase 2）

**修改内容：**
- 在 `index.vue` 的 `.doc-viewer` CSS 作用域新增约 15 个 `--doc-code-*` CSS 变量
- 在 `CodeTextViewer.vue` 中替换约 15 处 UI chrome 硬编码颜色为 `var(--doc-code-*, fallback)`
- 代码表面（`.code-surface` 本身）保持深色不变（IDE 风格）
- hljs token 样式全部改用 `--cc-hljs-*` 变量（已在 4 个主题文件中定义）

**已知风险点：**
- `--cc-primary-light` 变量在引用时不存在（4 个主题文件均无定义），已改为 `--cc-primary`
- CSS 变量层级 3 层（`--cc-*` → `--doc-*` → `--doc-code-*`）有不一致问题：部分 `--doc-code-*` 直接引用 `--cc-*`，部分通过 `--doc-*` 间接引用

### 3.3 路径链接化（Phase 3）

**修改内容：**
- `render.js` 导出 `linkifyHtmlTextNodes`（之前内部使用）
- `MarkdownIt.js` 的 `renderHtml` 函数末尾调用 `linkifyHtmlTextNodes(rendered)`
- 这样纯文本中的本地路径（如 `src/main.js`）被正则扫描并转为 `<a class="md-file-link" data-path-candidate="...">`

**已知风险点：**
- `linkifyHtmlTextNodes` 在公式占位符还原**之后**运行，如果 KaTeX 输出无标签包裹的纯文本，可能被误链接化
- 代码块内的路径字符串也会被链接化（与聊天气泡行为不一致——气泡中有标记保护）
- `linkifyHtmlTextNodes` 对每个非标签文本部分运行 `linkifyStrongLocalPaths` 正则（包含 5 个 `isStrongLocalPathCandidate` 子检查），代码繁重的文档有约 2-5ms 的性能开销

### 3.4 错误恢复（代码审查发现并修复）

- **Bug：`isLoadError` 成功后不清除** — `completePayloadAsync` 成功路径显式设置 `isLoadError: false`
- **Bug：`activeTabId` 被异步完成的 tab 覆盖** — 加了 `if (activeTabId.value === pendingTab.id)` 守卫
- **Bug：`onMounted` drain 绕过串行队列** — 改为走 `enqueuePayload`
- **Bug：`openFile` 不处理缺失 data 的 payload** — 加了防御性 async 调用

---

## 4. 为什么可能仍然失败

### 4.1 Vue keep-alive 与响应式更新的交互

这是**最隐蔽的问题**。Vue 的 keep-alive 在停用组件时：

1. 调用 `onDeactivated` 钩子
2. **停止渲染 effect（`effect.stop()`）** — 这意味着响应式数据的变化不会触发重新渲染
3. 组件实例保留在内存中，refs 仍可读写

当 `applyPayloadSync` 修改 `activeTabId.value` 时：
- 如果 mdViewer 当前**可见**（用户就在文档页面）：Vue 会调度重渲染 → 正常
- 如果 mdViewer 被 keep-alive **停用**（用户在 codeHub）：渲染 effect 已停止 → Vue 不会调度更新 → `router.push` 激活组件后，可能不会自动检测到停用期间的数据变化 → 显示旧 tab

### 4.2 IPC 消息的 Task 边界

```js
// 主进程（同步执行）：
webContents.send('md-content', payload)    // 消息 1 入队
webContents.send('open-md-viewer')         // 消息 2 入队

// 渲染进程事件循环：
// Task 1: 处理 'md-content' → enqueuePayload → applyPayloadSync（同步）
//                → completePayloadAsync 入队（微任务）
// Task 2: 处理 'open-md-viewer' → router.push
```

`applyPayloadSync` 在 Task 1 中同步执行，`activeTabId` 应该已经在 Task 2 之前设置了。但 keep-alive 的激活时机可能与 Task 2 相关——如果 `router.push` 触发 keep-alive 的 `onActivated`，这个钩子的执行时机在 Vue 内部可能与渲染 effect 的重新调度竞争。

### 4.3 串行队列的先到先服务问题

```js
payloadQueue = payloadQueue
  .then(() => { if (pendingTab) return completePayloadAsync(p, pendingTab) })
```

如果 `completePayloadAsync` 中的 `ensurePayloadContent` 卡住（文件 I/O 慢、handler 出错），**整个队列停止**。后续 payload 的 `applyPayloadSync` 已经执行（UI 已更新），但 `completePayloadAsync` 被阻塞。

### 4.4 被变更的文件之外可能存在问题

本方案**没有触碰**以下可能出问题的环节：
- `electron/mdRouting.js` 的 `mdViewerReady` 状态管理
- 主进程 `read-file-by-path` handler 的错误处理
- Vue Router 的路由守卫逻辑
- keep-alive 的 `include/exclude` 配置

---

## 5. 建议的排查方向

1. **添加诊断日志**：在 `applyPayloadSync`、`completePayloadAsync`、`enqueuePayload`、`onActivated`、`onDeactivated` 中加 `console.log`，追踪实际的调用时序和 ref 值变化。

2. **简化串行队列**：当前的 `payloadQueue = payloadQueue.then().catch()` 链条在模块生命周期中持续增长。考虑用单元素队列（只保留最新一个 pending 读操作，取消旧的）。

3. **替代 keep-alive 停用期问题**：在 `onActivated` 中主动触发 `nextTick(() => { /* 强制重新评估 activeTabId */ })`。

4. **检查主进程侧**：确认 `read-file-by-path` handler 是否可能永不 resolve（例如文件不存在时的 Promise rejection vs resolve(null)）。

5. **验证路径链接化**：确认 `linkifyHtmlTextNodes` 在文档查看器的 DOM 上下文中产生的 `.md-file-link` 元素有点击事件处理（当前依赖全局事件委托或组件内事件绑定——需确认事件代理存在）。

---

## 6. 修改文件清单（附行号参考）

| 文件 | 修改性质 | 关键行号 |
|------|----------|----------|
| `src/components/mdViewer/index.vue` | 核心逻辑大改 | 162-298（applyPayloadSync/completePayloadAsync/enqueuePayload） |
| `src/components/mdViewer/documentPayload.mjs` | tab 模型增强 | 3-11（getDisplayName 导出）、52（isLoadError 字段） |
| `src/components/mdViewer/documentTabs.mjs` | tab 工厂重构 | 1-38（复用 getDisplayName、isLoadError 字段） |
| `src/components/mdViewer/viewers/CodeTextViewer.vue` | CSS 变量替换 | 散落约 15 处 |
| `src/components/mdViewer/viewers/MarkdownViewer.vue` | CSS 变量 + hljs 令牌 | 散落约 25 处 |
| `src/utils/MarkdownIt.js` | 路径链接化 | 213（linkifyHtmlTextNodes 调用） |
| `packages/agent/src/components/agentCommon/render.js` | 导出函数 | 559（新增 3 个导出） |
| `src/main.js` | 删除 hljs 导入 | 删 2 行 |
| `electron/mdRouting.js` | 注释压缩 | 仅注释 |
| `electron/main.js` + `claudeWindow/index.js` + `codexWindow/index.js` | DevTools 恢复 | 取消注释 |

---

## 7. 附录：CSS 变量体系速查

```
全局主题层 (cc-theme-*.css)
  --cc-bg, --cc-text, --cc-primary, --cc-primary-bg, --cc-border-medium, ...
  --cc-hljs-keyword, --cc-hljs-string, --cc-hljs-comment, ...  (hljs 令牌色)

文档查看器作用域 (.doc-viewer)
  --doc-bg: var(--cc-bg)
  --doc-text: var(--cc-text)
  --doc-muted: var(--cc-text-dim)
  --doc-line: var(--cc-border-medium)
  --doc-code-btn-bg: var(--cc-bg-secondary)
  --doc-code-btn-text: var(--doc-text)
  --doc-code-btn-hover-border: var(--cc-primary)
  --doc-code-spinner-accent: var(--cc-primary)
  ... (共约 18 个变量)
```
# mdViewer status update - 2026-06-16

Status: fixed and verified locally.

Implemented:
- mdViewer delivery uses request ids, direct-send when ready, and queued fallback for reload/activation recovery.
- Tab creation is synchronous; async file loading no longer blocks visible tab switching.
- Recent document names are normalized from file paths when payload names are missing.
- Plain local paths in rendered markdown are linked through the shared `data-path-candidate` path opener.
- Strong local paths inside inline code are clickable while normal inline code remains unchanged.
- Source-code viewer chrome, tabs, empty state, and unsupported/html/pdf viewer shells consume mdViewer theme variables.
- Removed global highlight.js theme imports that conflicted with app theme tokens.

Verification:
- `npm run build`
- `npm test`
- `node --test tests/agent-public-renderer-boundary.test.cjs tests/markdown-it-local-link.test.mjs tests/md-routing.test.cjs tests/document-locator.test.cjs tests/document-tabs.test.mjs tests/document-viewer-registry.test.mjs tests/document-link-click-context.test.cjs tests/agent-markdown-render.test.mjs`

Residual notes:
- Full `node --test tests/*.test.*` still has unrelated pre-existing failures in other suites.
- HTML/PDF iframe content keeps its own document background; only the mdViewer shell is theme-aware.
