# T181 Hot Path Governance and Streaming Render 收口

> 日期：2026-07-05
> 状态：待实施
> 相关：T176 / T177 / T177-P2 / T178 / T179、ClaudeCode、CodeX、MessageList、session activation、cache governance

## 1. 背景

本轮性能问题不是一个单点慢函数，而是重构后多条链路同时变长：

- session / project activation 会触发 history、draft、instruction、metrics、scan、registry 多个后台任务。
- renderer 冷挂载曾一次性挂 60 条复杂消息，造成 2.3s 级 long task。
- streaming assistant 消息仍会反复把增长中的整段文本交给 `v-html`，浏览器需要同步做 `innerHTML -> DOM -> layout -> paint`。
- 部分缓存确实有效，但也暴露出热路径里混入副作用的问题，例如 scan cache hit 曾继续 registry upsert。

因此下一步不能再叫“继续加缓存”。目标改为：

**治理热路径：同步段只做可见首屏必需工作；后台任务可延迟、可去重、可取消；streaming 期间避免大 DOM 重建。**

## 2. 已收口任务

| 任务 | 结论 |
|---|---|
| T176 | CodeX history tool 默认折叠和大 bash output 懒挂载已完成；`renderContent` / computed / 普通大消息折叠方向已被数据证伪。 |
| T177 | 主进程 metrics 同步读大 JSONL 阻塞 event loop 已修；CodeX + Claude metrics aggregate cache 和后台聚合保留。 |
| T177-P2 | 冷挂载 60 条消息导致 renderer long task 已通过分片挂载缓解。 |
| T178 | session scan 缓存/调度首版有效，但暴露 cache hit 仍可能有 registry 副作用。 |
| T179 | activation work graph 已定位并拆除 scan cache hit 的 registry 写副作用；后续不再以 T179 继续扩大缓存。 |

旧任务不再继续承载新优化。剩余卡顿统一进入 T181。

## 3. 缓存治理结论

缓存不是禁用项，但必须区分“派生缓存”和“补丁型去重”。

### 3.1 保留的派生缓存

| 缓存 | 保留原因 | 边界 |
|---|---|---|
| metrics aggregate cache | 避免重复读/parse 官方 JSONL；命中后 handler 可降到 ms 级。 | key 必须包含 `filePath + size + mtimeMs`；不得写官方 sidecar。 |
| draft / instruction read cache | session-registry 小字段读缓存；切 tab 不应每次磁盘 I/O。 | session-registry 仍是事实来源；写入、删除、clear 时失效。 |
| scan raw summary cache | 避免重复目录扫描和 raw summary 构造。 | cache hit 路径只能纯读 merge registry 字段，禁止无条件 upsert。 |
| in-flight dedup | 防止同一 session 同时发起重复 IPC 或 scan。 | 必须 `finally` 清理，必要时加 timeout。 |

### 3.2 过渡型补丁

| 项 | 风险 | 后续策略 |
|---|---|---|
| metrics 300ms TTL dedup | 有效但语义偏补丁；容易掩盖触发链重复。 | 保留，但不再扩展；后续由 activation queue 统一调度。 |
| streaming 50ms throttle | 降低 `v-html` 次数，但不能降低单次 DOM 成本。 | 作为过渡保留；Phase 1 用 streaming plain text 替代热路径。 |
| scheduled refresh cooldown | 防止 tab activation 风暴。 | 保留；后续纳入 activation priority。 |

新增缓存必须登记 owner、key、value、失效规则、内存上限、stale policy、mutation policy。没有登记的临时 `Map` 不允许进入新热路径。

## 4. 当前剩余卡点

### 4.1 Streaming 输入卡顿

当前两个 assistant bubble 仍然在 streaming 中使用：

```vue
v-html="renderContent(displayText, '...AssistantBubble')"
```

`renderContent` 缓存只能减少 JS markdown 解析，不能避免浏览器同步解析 HTML、替换 DOM、layout 和 paint。`useStreamingText` 的 50ms throttle 只降低频率，不降低单次成本。

因此 active streaming session 中打字仍可能被 renderer main thread 阻塞；非 active session 没有 streaming DOM 更新，所以输入更顺。

### 4.2 Activation 后几百 ms 卡顿

T179 已把 scan cache hit 写 registry 的大头去掉，但 project/session activation 后仍有多个后台任务：

- current chat history / chunked mount
- draft read
- instruction read
- metrics refresh
- project scan
- session list merge / apply

如果这些任务各自 `void` 启动、各自 dedup、各自更新 UI，就会继续出现“同步段很短但后续几百 ms 抢主线程”的体感。

## 5. Phase 1：Streaming Assistant Plain Text

目标：streaming 期间不再反复 `v-html` 整段 assistant 消息。

### 5.1 方案

- `MessageList` 计算当前消息是否为 active streaming assistant：

```js
tab.thinking && tab.currentAssistantId === msg.id
```

- 通过 prop 传给 `MessageItem` 和 `AssistantMessageBubble`。
- streaming 中渲染纯文本：

```vue
<pre class="assistant-streaming-text">{{ displayText }}</pre>
```

- done 后切回一次 markdown：

```vue
<div v-html="renderContent(displayText, '...AssistantBubble')"></div>
```

### 5.2 实现约束

- ClaudeCode 和 CodeX 必须共享同一套 prop / composable 思路，禁止两边复制两套状态判断。
- 不向官方 JSONL 或 session registry 写 streaming UI 状态。
- 不把 `isStreaming` 持久化进 message schema；优先从 `tab.thinking + tab.currentAssistantId` 派生。
- `v-memo` 依赖必须包含 `isStreaming`，否则 done 后可能不从纯文本切回 markdown。
- Token footer、tool cards、system/user bubbles 不受影响。
- streaming 期间不提供 markdown、高亮、文件链接；done 后恢复完整 markdown。这是明确产品取舍。

### 5.3 验收

- active streaming session 中连续输入，输入框不应出现 200ms+ 可感知停顿。
- perf 中 `rc:*AssistantBubble` 可以继续出现，但 streaming 期间不应伴随大段 Layout/Paint long task。
- done 后 assistant 内容变为格式化 markdown，代码块、表格、链接恢复。
- 历史恢复消息仍直接 markdown 渲染，不走 streaming 纯文本。

## 6. Phase 2：Activation Work Queue 最小收口

只有 Phase 1 后仍存在“切 tab 后几百 ms 内输入卡一下”时再做。

目标不是重写生命周期，而是把后台任务按优先级提交：

| 优先级 | 工作 | 规则 |
|---|---|---|
| P0 | active id、focus、scroll restore | 同步完成，目标 < 16ms |
| P1 | current chat history / draft / instruction | 当前 chat 优先；旧 activation 返回时必须 guard |
| P2 | current chat metrics | cache-first；后台刷新；不得阻塞输入 |
| P3 | project scan / non-active refresh | 延迟、去重、可取消；不得抢 P1 |

Phase 2 先只接 project scan 和 metrics，不一次性吞 history/draft/instruction，避免大重构。

## 7. 明确不做

- 不回滚 T176 / T177 / T179 已验证有效的修复。
- 不继续扩大 `renderContent` 缓存。
- 不直接上虚拟列表。
- 不新建全局缓存框架。
- 不把 MindCraft 自有缓存写到官方 transcript 旁。
- 不改 token metrics UI 语义。

## 8. 给 ClaudeCode 的执行口径

```text
任务：T181 Hot Path Governance and Streaming Render。

先做 Phase 1：streaming assistant plain text。

要求：
1. 从 MessageList 派生 isStreaming = tab.thinking && tab.currentAssistantId === msg.id。
2. isStreaming 通过 MessageItem 传到 AssistantMessageBubble。
3. isStreaming=true 时使用纯文本节点/pre 渲染 displayText，不调用 v-html/renderContent。
4. isStreaming=false 时保持现有 markdown renderContent 路径。
5. v-memo 依赖加入 isStreaming，避免 done 后不切回 markdown。
6. ClaudeCode 和 CodeX 两边行为一致；共享逻辑放 agentCommon，禁止复制复杂判断。
7. 不新增缓存，不写 session registry，不写官方 JSONL，不打开默认 console 日志。

验证：
- node --test tests/codex-stream-rendering-contract.test.mjs tests/codex-event-rendering-contract.test.mjs
- node --test tests/agent-markdown-render.test.mjs
- npm run test:undef
- npm test
- npm run build

人工验收：
- active streaming 中连续输入，输入框不卡顿明显改善。
- done 后 markdown、高亮、链接恢复。
- 历史 session 直接显示 markdown，不出现纯文本残留。
```

