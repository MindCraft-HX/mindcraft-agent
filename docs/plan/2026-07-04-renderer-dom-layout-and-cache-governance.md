# T177-P2 剩余卡顿归因与缓存治理

> 日期：2026-07-04
> 状态：待开工，先诊断后改代码
> 相关：T176 / T177 / T178、CodeX / ClaudeCode 消息列表、Renderer DOM/Layout、缓存治理

## 1. 收口结论

T176 和 T177 主线已经收口：

- T176：CodeX history tool 默认折叠、大 bash output 懒挂载已落地；`renderContent` / computed 缓存 / 普通大消息折叠方向已被探针证伪。
- T177：CodeX + Claude metrics 主进程 event loop 阻塞已修；draft / instruction / readRange / queryMetrics 的 renderer wall 已降到可接受范围。

用户仍感到“还有点卡”。下一步不能继续把 T176-P2、T177-P2、T178 三线并行推进。当前唯一主线是：

**T177-P2：确认剩余卡顿是否来自 Renderer DOM/Layout/Paint 或 Vue patch。**

T178 session scan 缓存化暂缓，只登记方案和缓存治理规则。除非新数据证明卡顿主要来自 `handleRefreshSessions` 或 session list 重扫，否则不先开工。

## 2. 当前判断

目前最强怀疑不是 metrics / draft / instruction / JSONL tail read，而是切入大 session 后：

1. `chat.messages = [...]` 一次性替换消息数组。
2. Vue 挂载 60 条消息和其中的 tool / code / diff 组件。
3. 浏览器执行 Scripting、Style Recalc、Layout、Paint、hit-test。
4. 用户在挂载期间打字、切 tab、滚动时，与同一个 renderer main thread 竞争。

但这仍需要 Chrome Performance trace 证明。不能只凭 `ensureChatMessagesLoaded.proc` 或体感判断直接上虚拟列表。

## 3. 非目标

本专项不做：

- 不回滚 T168 / T176 / T177。
- 不继续做 `renderContent` computed 缓存，除非 trace 证明 markdown render 是主瓶颈。
- 不直接上虚拟列表。虚拟列表会影响 scroll restore、loadMoreHistory、auto bottom、streaming scroll，必须有 DOM 节点数量和 Layout/Paint 证据。
- 不改 draft / instruction / metrics 语义。
- 不写官方 JSONL sidecar。
- 不做全局缓存框架重构。

## 4. Phase 0：采集一份可判读的 trace

必须采集一组同场景数据：

1. 开启 renderer/main perf：
   - `window.__MCPF_PERF__ = true`
   - 或 `localStorage.setItem('mcpf_perf', '1')` 后刷新
2. Chrome DevTools Performance 录制 5-10 秒：
   - 切入一个真实大 CodeX session。
   - 等消息出现后立刻输入 10-20 个字符。
   - 快速切换 2-3 个 session。
3. 同步保存 renderer perf dump 和 main perf dump。

记录以下指标：

| 指标 | 判断 |
|---|---|
| Long task > 50ms | 是否有明显主线程卡顿 |
| Scripting 时间 | Vue patch / render / JS 计算是否主因 |
| Recalculate Style / Layout / Paint | DOM/CSS/布局是否主因 |
| DOM node 数 | 是否已经超过当前 60 条消息可承受范围 |
| IPC wall vs main handler | 是否仍有主进程队列串扰 |
| `rc:*` count | 是否还有意外的消息内容重渲染 |

## 5. 判定树

拿到 trace 后按下面规则选择方向。

| 证据 | 结论 | 下一步 |
|---|---|---|
| IPC wall 高，main handler 也高 | 主进程还有同步重活 | 回到 T177 类问题，只修对应 handler |
| IPC wall 高，main handler 低 | IPC 队列或 renderer main thread 忙 | 对照 trace 看是 Scripting 还是 Layout |
| Scripting 高，Layout/Paint 不高 | Vue patch / 响应式 / render 函数成本 | 查 MessageList props、key、shallow 数据、组件隔离 |
| Layout/Paint 高，Scripting 不高 | DOM 节点、CSS、可见元素太重 | 分片挂载、懒挂载、降低首屏 DOM |
| DOM node 数高且 Layout/Paint 高 | DOM 规模问题 | 先做分片挂载；虚拟列表只作为 Phase 2 |
| `rc:*` count 在输入时暴涨 | renderContent 或 bubble 重渲染回潮 | 再考虑 targeted computed/cache |
| 都不高但体感卡 | 继续查输入事件、selection、scroll、DevTools/dev 模式放大 |

## 6. 可选修复池

只能在 Phase 0 trace 指向后选择。

### 6.1 分片挂载

适用：切 session 后一次性挂载 60 条消息导致长任务。

做法：

- 首屏先挂最近 15-20 条。
- 其余消息用 `requestIdleCallback` / `setTimeout(0)` / `requestAnimationFrame` 分批补齐。
- 保持 `loadMoreHistory` 和 scroll restore 语义不变。

风险：滚动位置恢复、自动到底、用户马上向上滚动时的体验。

### 6.2 更激进的 tool/detail 懒挂载

适用：Layout/Paint 主要来自 tool card / diff / code block detail。

做法：

- 已完成 tool 继续默认折叠。
- 折叠态不挂 detail 子组件。
- 对代码块、diff、文件变更详情延迟到展开时渲染。

风险：历史/live parity，要确保 error tool 和 active tool 仍可见。

### 6.3 响应式边界收窄

适用：Scripting 高，Vue patch 占比高。

做法：

- MessageList 从父组件中隔离，确保 inputText 变化不触发消息列表 patch。
- 大消息对象使用 `shallowRef` / `markRaw` / 冻结只读派生对象，减少深层 tracking。
- 保持消息 id 稳定，禁止 index key。

风险：streaming 更新、tool 状态更新、footer token 回填可能依赖响应式深层更新。

### 6.4 虚拟列表

只在以下条件同时满足时考虑：

- trace 证明 DOM node 数和 Layout/Paint 是主瓶颈。
- 分片挂载和 detail 懒挂载仍不够。
- 已补 scroll restore / loadMoreHistory / auto bottom / streaming scroll 回归测试。

## 7. 缓存治理规则

后续可以继续用缓存，但不能继续临时堆 Map。新增或修改缓存必须登记：

| 字段 | 要求 |
|---|---|
| Owner | 谁负责写入、失效、清理 |
| Key | 明确使用 `chatKey` / `cliSessionId` / `filePath` 哪一种，禁止混用 |
| Value | 缓存什么，不缓存什么 |
| Invalidation | 何时失效，如 size/mtime、root signature、TTL、session delete |
| Limit | 内存上限或 LRU 数量 |
| Stale policy | 是否允许旧值先显示，最长多久 |
| Mutation policy | 返回拷贝、冻结对象，还是只读引用 |

已有缓存的推荐归类：

| 类型 | 例子 | Key | 规则 |
|---|---|---|---|
| Session registry cache | draft / instruction | `chatKey/sessionId` | MindCraft 自有数据，优先 session registry |
| Transcript aggregate cache | token metrics / context | `filePath + size + mtimeMs` | 官方 JSONL 只读派生，禁止 sidecar |
| Directory scan cache | JSONL file list / session summary | root signature | 只缓存轻量摘要，避免热路径递归扫 |
| In-flight dedup | metrics aggregate / session refresh | `filePath` 或 `sessionId` | 同一任务同一时刻只跑一次 |
| Short TTL cache | git status / command list | cwd / provider | TTL 明确，允许短时 stale |

T178 session scan 缓存化必须先按本节写清 owner/key/invalidation/limit，再开工。

## 8. 下一步交接

给 ClaudeCode 的执行口径：

```text
先收口 T176/T177，不写业务优化代码。接下来只做 T177-P2 Phase 0：采集并分析 renderer Performance trace。

目标：
1. 证明剩余卡顿来自 Scripting、Layout/Paint、DOM node 数、还是仍有 IPC 队列。
2. 更新 docs/plan/2026-07-04-renderer-dom-layout-and-cache-governance.md 的 Phase 0 数据。
3. 只在证据明确后提出 Phase 1 最小改动方案。

禁止：
- 不直接上虚拟列表。
- 不继续 renderContent 缓存。
- 不扩展 metrics/draft/instruction。
- 不新增未登记的临时缓存 Map。
```
