# T177 Session 切换后台任务延迟与主线程竞争专题

> 日期：2026-07-04
> Task: T177
> 相关：CodeX / ClaudeCode session switch、IPC、session registry、draft、metrics、instruction state
> 状态：Phase 0 已完成，根因确认 → Phase 1 修复 `codex-metrics.session-read` 阻塞主进程 event loop

## 1. 背景

T176 已完成大 session 渲染方向收口：

- CodeX history tool 默认折叠，大 bash output 懒挂载。
- 真实大 session 中 expanded tools 从 29-43 降到 0-3。
- `renderContent` 探针显示 markdown 渲染不是剩余卡顿主因：
  - 打字期间旧消息没有重跑 `renderContent`。
  - 冷加载 `renderContent` 总耗时约 19.5ms。
  - 单条消息最大约 5KB，没有触发普通大消息折叠的样本。

用户仍能感到：切 session / 渲染过程中输入仍有卡顿，只是比 T176 Phase 1 前缓和。

新的 perf 数据显示 1s 级耗时集中在后台任务：

| 项 | 观测值 |
|---|---:|
| `ensureChatMessagesLoaded.ipc` | ~1408ms |
| `sessionDraft.loadDraftForChat` | ~969-1912ms |
| `refreshActiveSessionInstructionState` | ~1583ms |
| `refreshMetricsForChat` | ~1093ms |

这些数值不能直接等同于“阻塞主线程”。CodeX `switchChat()` 中大部分调用是 `void` 后台化，不会同步 await。但它们可能通过以下方式影响体感：

1. IPC 本身排队或主进程慢，导致 session 内容、draft、metrics 延迟回来。
2. 多个后台 IPC 在同一时间返回，renderer 同步写入响应式状态，引发主线程竞争。
3. `ensureChatMessagesLoaded` 返回后执行 `chat.messages = ...`，触发 60 条消息挂载和布局。
4. draft / instruction / metrics 返回后更新 input/status/footer/sidebar，和用户输入事件抢主线程。

T177 的目标是把这些路径拆清楚，而不是先继续猜。

## 2. 调查目标

必须回答以下问题：

1. renderer 看到的 IPC wall time 慢，main process handler 是否也慢？
2. 如果 main 快、renderer 慢，延迟来自 IPC 队列、renderer 主线程忙，还是调用时机被排队？
3. `sessionDraft.loadDraftForChat` 为什么 T173 后仍有 1-2s？
   - 是缓存没命中？
   - 是 chatKey 不稳定？
   - 是每次切换都先 persist old draft 再 load new draft，造成写读竞争？
   - 是 main handler / session registry read 慢？
4. `refreshActiveSessionInstructionState` 为什么会到 1.5s？
   - 它理论上只读 session registry 小字段，不应慢。
5. `refreshMetricsForChat` 是否仍有重复触发？
   - `switch-chat`
   - `active-tab-state-watch`
   - `history-loaded`
   - `session-scan`
   - `done-retry`
6. `ensureChatMessagesLoaded.ipc` 慢在哪里？
   - JSONL tail read / parse / normalize？
   - main process queue？
   - renderer waiting while busy？
7. IPC 返回后的 renderer apply 阶段耗时多少？
   - `chat.messages = ...`
   - `normalizeFileChangeMessages`
   - footer token sync
   - metrics/status update
   - input draft set + textarea resize

## 3. 当前代码入口

CodeX:

- `packages/agent/src/components/codeX/index.vue`
  - `switchChat(id)`
  - `ensureChatMessagesLoaded(chat)`
  - `refreshMetricsForChat(chat, reason)`
  - `refreshActiveSessionInstructionState()`
  - `watch(() => activeTab.value?.id, ...)` 中的 `sessionDraft.loadDraftForChat(tab)`
  - `watch(() => activeTab state object, ...)` 中的 `refreshMetricsForChat(tab, 'active-tab-state-watch')`

ClaudeCode:

- `packages/agent/src/components/claudeCode/index.vue`
  - 同类函数：`switchChat` / `ensureChatMessagesLoaded` / `refreshMetricsForChat` / `refreshActiveSessionInstructionState`

Shared:

- `packages/agent/src/components/agentCommon/composables/useSessionDraft.js`
- `packages/agent/src/components/agentCommon/utils/metricsDedupHelper.js`
- `packages/agent/src/components/agentCommon/utils/rendererPerfProbe.mjs`

Main process:

- `packages/agent/electron/sessionInstructionIpc.js`
  - `agent-get-session-draft`
  - `agent-set-session-draft`
  - `agent-get-session-instruction`
- `packages/agent/electron/sessionRegistry.js`
  - `getSessionDraft`
  - `setSessionDraft`
  - `getSessionInstruction`
- `packages/agent/electron/codexAgent.js`
  - CodeX session range read / metrics query handlers
- `packages/agent/electron/claudeAgent.js`
  - Claude session range read / metrics query handlers
- `packages/agent/electron/shared/mainPerfProbe.js`

## 4. Phase 0：分段探针，只观测不优化

### 4.0 Phase 0 实测数据（2026-07-04）

**测试条件**：CodeX 大 session（46-62MB JSONL），连续 4 次切换 session，`window.__MCPF_PERF__=true` 开启双端探针。

#### renderer wall vs main process handler 对齐

| IPC | Renderer wall (avg) | Main handler | 丢失在队列 |
|-----|:---:|:---:|:---:|
| `readSessionRange` | 733ms | **49ms** | **684ms** |
| `getSessionDraft` | 831ms | **1-3ms** | **828ms** |
| `getSessionInstruction` | 831ms | **1ms** | **830ms** |
| `queryMetrics` | 1738ms | **2391ms** | ~对齐 |

**三项 IPC 的 main handler 都是毫秒级，无可优化。**

#### main process 内部阶段拆解

`codex-read-session-file-range`（49ms total）：

| 阶段 | 耗时 | 
|------|:---:|
| `stat` | 0ms |
| `tailRead`（I/O + parse） | 26-44ms |
| `collect`（flush + pending） | 0-1ms |
| `process`（result build） | 0ms |

`sessionRegistry.getDraft`：0-1ms 或 cacheHit=1 命中。

`sessionRegistry.getInstruction`：1ms，无 disk cache 但极快。

#### 🔴 根因：`codex-metrics.session-read` 阻塞主进程 event loop

```
codex-metrics.session-read total=5697ms   ← 读 47MB JSONL
codex-metrics.session-read total=2384ms   ← 读 ？MB JSONL
codex-metrics.session-read total=365ms
codex-metrics.session-read total=117ms
codex-metrics.session-read total=56ms
codex-metrics.session-read total=23ms
```

`getCodexSessionMetricsByFile()` 内部 `fs.readFileSync` 同步读取完整 JSONL 文件求和 token count。文件越大越慢（5697ms），在此期间 **event loop 完全冻结**——draft、instruction、messages 三个已完成的主进程响应被阻塞在队列中无法返回 renderer。

```
时间线：
  renderer → 发送 4 个 IPC（draft / instruction / messages / metrics）
  main   → draft(1ms) → instruction(1ms) → messages(49ms) → 全部完成
  main   → metrics 开始 → fs.readFileSync(2384ms) → 🔴 event loop 冻结
                        → 前 3 个响应卡在 IPC 队列
  main   → metrics 完成 → event loop 恢复 → 4 个响应同时到达 renderer
  renderer 看到: draft=831ms, instruction=831ms, messages=733ms, metrics=2391ms
```

#### 其他发现

| 发现 | 数据 |
|------|------|
| apply 全 0ms | Vue 状态写入不是瓶颈 |
| draft cache 生效 | `cacheHit=1` 命中率良好 |
| metrics 调用频率 | `switch-chat`×4 + `active-tab-state-watch`×4 + `history-loaded`×4 → 每次切 session 3 次刷新 |
| 后台扫描 | `handleRefreshSessions` avg 1106ms, max 2213ms（也触发了 metrics） |
| CodeX readRange | 55-83ms 正常路径，2254ms 异常路径（被 metrics 排队拖慢） |
| Claude 对比 | draft 199ms / instruction 197ms / messages 1880ms — 系统性更慢，待单独诊断 |

#### 结论

**唯一需要修复的瓶颈：`codex-metrics.session-read` 的 `fs.readFileSync`。**

messages / draft / instruction 的 main handler 都是毫秒级，apply 阶段 0ms。修复 metrics 的文件读取方式（异步化或走缓存）即可消除串扰，让前三项 IPC 的实际 wall time 降到 1-49ms。

本阶段只加显式 perf flag 下的探针，不改变行为。禁止直接改缓存策略或调度策略。

### 4.1 renderer IPC wrapper 分段

对以下调用记录：

- call start time
- promise resolved time
- returned payload size summary（只记录数量/长度，不记录内容）
- apply start/end time
- current active chat 是否仍匹配请求 chat

CodeX labels 建议：

- `codex.ipc.readSessionRange.wall`
- `codex.ipc.readSessionRange.apply`
- `codex.ipc.getSessionDraft.wall`
- `codex.ipc.getSessionDraft.apply`
- `codex.ipc.getSessionInstruction.wall`
- `codex.ipc.getSessionInstruction.apply`
- `codex.ipc.queryMetrics.wall`
- `codex.ipc.queryMetrics.apply`

Claude labels 同理加 `claude.*`。

注意：不要打印消息正文、draft 正文、instruction 正文、路径敏感内容、API key。meta 只允许数字：

- `messages`
- `tools`
- `chars`
- `hasMore`
- `cacheHit`
- `sameChat`
- `activeMatch`
- `reasonCode`

### 4.2 main process handler 分段

主进程已有 `perfStartIpc`。需要确认以下 handler 是否有 main-side 输出：

- `agent-get-session-draft`
- `agent-set-session-draft`
- `agent-get-session-instruction`
- `codex-read-session-file-range`
- `codex-agent-query-metrics`
- Claude 对应 session range / metrics handler

如果 handler 内部还有明显阶段，继续拆：

`codex-read-session-file-range`:

- file stat / signature
- tail read
- JSON parse
- message normalize
- return payload build

`agent-get-session-draft` / `agent-get-session-instruction`:

- index read
- record read
- legacy fallback read

metrics:

- file read
- aggregate
- normalize

### 4.3 dump 对齐方式

需要同时看 renderer 和 main process 的 `[perf]` 输出。

判断规则：

| 现象 | 结论 |
|---|---|
| renderer wall 1500ms，main handler 20ms | IPC 往返/renderer event loop/队列竞争，不是 main handler 计算慢 |
| renderer wall 1500ms，main handler 1450ms | main process handler 本身慢 |
| main handler 快，但 apply 慢 | renderer 状态写入 / Vue 更新 / DOM 挂载慢 |
| wall 快但用户仍卡 | 继续查 Layout/Paint/DOM，而不是 IPC |

## 5. Phase 1：按证据选择修复，不预设方案

只有 Phase 0 数据出来后才进入修复。

### 5.1 如果 draft 慢

候选方向：

1. 验证 `_draftCache` 命中率。
   - 同一 chat 第二次切回应命中内存，不应再 IPC。
   - cache key 应为 MindCraft `chatKey/sessionId`，不要混用 `cliSessionId` / `filePath`。
2. 避免切换时写旧 draft 和读新 draft 互相竞争。
   - `persistDraftForChat(oldId)` 如果 oldId 为空或文本未变，应跳过。
   - 旧 draft 写入不应阻塞新 draft 展示。
3. main handler 如果慢，查 `sessionRegistry` 读写是否每次全量读 index 或大 record。

边界：

- draft 事实来源仍是 session registry。
- 不回退到 panel state。
- 不写官方 JSONL。

### 5.2 如果 instruction 慢

候选方向：

1. 和 draft 共用 session registry 小字段缓存，但必须保持会话级隔离。
2. `activeTab.sessionId` 未变化时不重复 refresh。
3. 对 `refreshActiveSessionInstructionState` 做 active guard：返回时若 active chat 已变，不写旧结果。
4. main handler 慢则查 legacy fallback 或 record read。

边界：

- 不把 instruction 写入官方 config/transcript。
- 不改变 session instruction 注入语义。

### 5.3 如果 metrics 慢或重复

候选方向：

1. 按 reason 聚合调用次数，确认是否 `switch-chat` + `active-tab-state-watch` 重复。
2. 互动路径如果已有 snapshot，可只显示缓存，不发 IPC，或延迟到 idle。
3. `history-loaded` 后 metrics 刷新可 debounce，避免刚切换时和 draft/instruction/history 同时返回。
4. main metrics 如果慢，查文件 read/aggregate 是否可走 signature/cache。

边界：

- 不破坏 Token Metrics 红线。
- StatusBar current turn 仍走 normalizer -> TurnStore -> snapshot。
- 不拿上一轮数据冒充当前回合。

### 5.4 如果 readSessionRange 慢

候选方向：

1. main handler 慢：继续优化 JSONL range read / normalize；不要把全部 JSONL 读入 renderer。
2. renderer apply 慢：分帧 apply 或先 skeleton，再 requestIdleCallback / rAF commit messages。
3. 如果 payload 大但 DOM 已经变轻，查 `chat.messages = allMessages.slice(-n)` 触发的 Vue update 和 layout。

边界：

- 仍只读官方 JSONL。
- 不写 sidecar 到官方目录。
- 不做虚拟列表，除非单独开新专题。

## 6. 明确不做

T177 不做：

- 不继续 T176 的 renderContent computed 缓存。
- 不做普通大消息折叠，除非新数据推翻 T176 Phase 2a-0。
- 不做虚拟列表。
- 不拆输入框组件。
- 不改 provider storage / T174。
- 不改 simple chat storage / T175。
- 不写官方 `~/.claude` / `~/.codex` 旁的 sidecar。
- 不把 draft 恢复到 panel state。
- 不默认打开 debug console 噪音。

## 7. 验收标准

### 7.1 量化验收

在同一个大 CodeX session 上执行：

1. 开启 perf flag。
2. 连续切换 5 次 session。
3. 每次切换后立刻输入 5-10 个字符。
4. dump renderer + main perf。

必须能回答：

- 每个慢项 main-side 与 renderer-side 各自耗时多少。
- draft 第二次切回是否命中缓存。
- metrics 是否重复发起。
- instruction 是否重复发起。
- readSessionRange 的 apply 阶段耗时多少。

### 7.2 体验验收

修复阶段完成后：

- 切 session 后输入不应被 1s 级后台任务拖住。
- session 内容可以稍后补齐，但输入框不应冻结。
- StatusBar 允许先显示缓存，再后台刷新；不能显示上一 session 的错误数据。
- draft 不能串 session。
- session instruction 开关不能串 session。
- metrics 不能污染新 thinking cycle。

## 8. 交付要求

Phase 0 交付：

- 文档更新：把采集到的 renderer/main 对齐数据写回本文件。
- 只允许新增显式 flag 下的 perf 探针。
- 不改变行为。

Phase 1 交付：

- 只修 Phase 0 证明确认的瓶颈。
- 每个修复必须有测试或可复现实测数据。
- code review 必须列出：
  - 是否影响 session registry 边界。
  - 是否影响 Token Metrics 红线。
  - 是否影响官方 JSONL 只读边界。
  - 是否会引入默认 dev console 噪音。
