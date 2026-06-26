# Token Metrics 专题文档

> 最后更新：2026-06-26
> 覆盖：T144（BUG 修复）→ T145（实时增长 + 平滑计数）→ T146（Per-Turn 标注）

---

## 2026-06-26 补充：context 与 turn token 必须解耦

本轮定位结论：

- `contextUsage/contextWindow` 是 session 级状态，用于状态栏比例和自动压缩判断；不能在新 turn 开始时跟 `inputTokens/outputTokens/cacheReadTokens` 一起清零。
- `sdk-result` / terminal final 如果没有提供有效 context（0、空值、缺字段），不能覆盖 live/poll 已经得到的正数 context。否则会出现“对话过程中 context 极低，刷新后恢复正常”的渲染假象，并可能干扰自动压缩入口。
- `in/out/cache` 是 current turn 级状态，新 turn 开始必须清零，等待真实 SDK/token_count/jsonl 样本更新；不得拿上一轮或 session aggregate 顶替。
- ClaudeCode 某些 turn 可能只有工具调用或无 assistant 文本。result 已有 `_turnTokens` 时，前端必须把 footer 绑定到最后一条 user 之后的 assistant；如果没有 assistant，就创建一个空文本 assistant 作为 `TokenMetaRow` 容器，不能错挂到上一轮 assistant。
- 状态栏动画只在真实采样点之间插值；如果 provider 在 turn 结束前没有中间 usage，UI 只能在最终样本到达后展示，不伪造 token 增长。

## 0. 当前决策：UI 只展示统一语义

2026-06-24 追加结论：状态栏和每轮脚注不能直接暴露 ClaudeCode / CodeX / 第三方 provider 的原始 usage 字段语义。对用户只展示一套统一口径：

| UI 字段 | 统一含义 | 说明 |
|---------|----------|------|
| `in` | 本回合输入侧成本 token | 常规输入 + cache creation，不包含 cache read |
| `out` | 本回合输出 token | 模型生成的 assistant 输出 |
| `cache` | 本回合缓存命中 token | 仅 `cacheReadTokens` |
| `context` | 当前上下文占用 | 独立于 `in/out/cache`，按 provider 口径转换后计算 |

内部字段映射规则：

| Provider | 原始 usage | UI `in` | UI `cache` | `contextUsage` |
|----------|------------|---------|------------|----------------|
| 原生 Claude | `input_tokens` 已包含 cache | `max(0, input_tokens - cache_read_input_tokens)` | `cache_read_input_tokens` | `input_tokens` |
| Claude SDK 第三方 provider | `input_tokens` 常见为常规输入 | `input_tokens + cache_creation_input_tokens` | `cache_read_input_tokens` | `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` |
| CodeX | `cached_input_tokens` 通常是 `input_tokens` 的子集 | `max(0, input_tokens - cached_input_tokens) + cache_creation_input_tokens` | `cached_input_tokens` | `input_tokens` |

约束：
- 主进程可以读取 provider 原始字段，但发给前端的 `inputTokens/cacheReadTokens/cacheCreationTokens/outputTokens` 必须已经符合统一 UI 语义：`inputTokens` 代表常规输入 + cache creation，`cacheReadTokens` 代表 cache read。
- 若后续需要排障原始字段，应新增 `rawUsage` / debug 字段，不允许让状态栏直接消费原始 provider 口径。
- 动态数字只在真实样本之间插值，不补造 token；没有本回合真实样本时不拿上一轮数据顶替。
- `homeMetrics` 虽然是历史聚合链路，也必须复用同一 provider normalizer；不能在首页统计里再单独手写 `input_tokens` 推导公式。

## 一、架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        数据源（主进程）                           │
├─────────────────┬──────────────────┬─────────────────────────────┤
│  Claude SDK     │  CodeX SDK       │  简易对话 (raw fetch)        │
│  1s 轮询 JSONL  │  1s 轮询 JSONL   │  invoke() 同步阻塞           │
│  result.usage   │  token_count 事件│  SSE message_delta.usage     │
└───────┬─────────┴────────┬─────────┴──────────────┬──────────────┘
        │                  │                        │
        ▼                  ▼                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                     前端渲染                                      │
├──────────────────────────────────────────────────────────────────┤
│  StatusBarMetrics  ← 累计指标 (useAnimatedNumber 平滑动画)        │
│  TokenMetaRow      ← 每轮标注 (左侧竖线 + 淡入)                   │
│  homeMetrics       ← 首页统计 (跨 session 聚合)                   │
└──────────────────────────────────────────────────────────────────┘
```

## 二、数据管道详情

### 2.1 ClaudeCode

```
SDK stream loop (claudeAgent.js L2808-2891)
  │
  ├─ 每条 SDK 消息 ──→ IPC 'claude-agent-message' ──→ useClaudeAgentStream.js
  │   (assistant snapshot / result 均可能带 usage)
  │
  ├─ assistant.message.usage（若 SDK 中途已给出）
  │   └─ 立即透传 IPC 'claude-agent-metrics'，驱动状态栏实时增长
  │
  ├─ result 消息 ──→ IPC 'claude-agent-metrics' ──→ metricsData 最终收口
  │
  └─ 1s 轮询 ──→ claudeMetrics.pollMetrics() ──→ 同上 IPC
       │
       └─ getTokenMetrics() 读取 JSONL 文件
          - raw usage: 先按 provider 口径读取
          - normalized metrics: 再转换为统一 UI 语义
          - 当前回合状态栏不得回灌上一轮 output/cache
```

**Per-turn 数据**：SDK `result` 消息包含 `usage` + `duration_ms`。
前端 `useClaudeAgentStream.js` 在 `result` 分支提取并附着到 assistant 消息的 `_turnTokens` 字段。
**StatusBar 动态语义**：优先使用 SDK 流中的真实 `assistant.message.usage` 做实时增长；`result` 与 JSONL 轮询负责最终对账。JSONL 轮询是 session transcript 来源，必须先隔离到当前回合，不能把上一轮 `out/cache` 回灌到新回合状态栏。

### 2.2 CodeX

```
Codex stdout JSONL → codexAgent.js
  │
  ├─ turn.completed ──→ IPC 'codex-agent-message' ──→ useCodexAgentStream.js
  │   (携带 _perTurnTokens delta)
  │
  ├─ 1s 轮询 ──→ getCodexSessionMetricsByFile() ──→ IPC 'codex-agent-metrics'
  │
  └─ token_count 事件（仅存在于 JSONL 文件，不实时转发）
```

**Per-turn delta 计算**：
```
_turnTokenCache[chatKey] = { 上次累计 input/output/cache }
perTurnTokens = { 当前累计 - 上次累计 }
turn.completed 消息注入 _perTurnTokens → 前端附着到 assistant 消息
```

CodeX 的 `input_tokens` 与 `cached_input_tokens` 不能在 UI 上当成同一桶重复展示；主进程必须先转成统一的 `in/cache/out/context` 语义。

### 2.3 简易对话 Claude

```
ChatView → useChatStream.sendMessage()
  │
  ├─ doApiCall() → invoke() → electron/claudeAgent.js runClaudeChatStream()
  │   返回 { fullText, toolUseBlocks, stop_reason, usage }
  │
  └─ tool loop: 多次 doApiCall() → 累加 usage → 附着到 assistant._turnTokens
```

**特点**：`invoke()` 是同步阻塞调用，整个 tool loop 完成后才返回。
期间 StatusBar 无中间更新 → 无法平滑动画。

### 2.4 简易对话 CodeX

```
同 Claude 路径，但 invoke() → electron/codexAgent.js runCodexChatStream()
  │
  └─ 返回 { fullText, finish_reason, toolCalls, usage }
     （usage 需要从 SSE response.completed 中捕获 → P4 待实现）
```

---

## 三、关键组件

### 3.1 useAnimatedNumber

**文件**：`packages/agent/src/components/agentCommon/composables/useAnimatedNumber.js`

利用 rAF 逐帧插值，速率 = delta / timeSinceLastUpdate：

```
poll(t0): target=200  → snap (lastTime===0)
poll(t1): target=500  → rate=(500-200)/(t1-t0) → rAF 逐帧递增
poll(t2): target=800  → new rate → rAF 继续追
```

**状态机**：

| 条件 | 行为 |
|------|------|
| `newTarget < display` | snap（session 切换回退），设 snapNext=true |
| `newTarget === target` | skip |
| `lastTime===0` 或 `target===0` 或 `snapNext` | snap，清 snapNext |
| 其他 | rAF 动画 |

### 3.2 TokenMetaRow

**文件**：`packages/agent/src/components/agentCommon/components/TokenMetaRow.vue`

每轮 assistant 消息底部脚注：
```
│ 🕐 12.3s  📊 in 5.2k / out 1.8k  💾 cache 28.8k  💰 $0.12
```

- Props 驱动，三条线复用
- 左侧 2px 竖线 + 0.4s 淡入动画
- 流式期间不显示（`!msg.isStreaming`），历史消息无 `_turnTokens` 自动隐藏

### 3.3 StatusBarMetrics

**文件**：
- `packages/agent/src/components/claudeCode/components/StatusBarMetrics.vue`
- `packages/agent/src/components/codeX/components/StatusBarMetrics.vue`

显示当前回合指标：模型 / in-out tokens / cache / 上下文环 / 运行时长 / 速度 / Git / API 限额。

Token 数值通过 `useAnimatedNumber` 在真实采样点之间平滑递增；不为缺失的中间数据补假点。2026-06-24 起 ClaudeCode / CodeX Agent 轮询从 3s 下调到 1s，增强动态感；简易对话仍只有最终值。
状态栏语义按“当前回合”计：新回合开始时先重置 `in/out/cache`，再依据新的真实采样持续增长。这里 `in = 常规输入 + cache creation`，`cache = cache read`。`contextUsage` 可以来自 session 级 transcript，但必须按统一公式计算，不能影响本回合 `in/out/cache`。

---

## 四、已完成的 T 项

### T144 — Token Metrics BUG 修复

7 个问题，修了 4 个 P0：

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | `createChat()` 缺 `metrics: {}` 导致 runtime state 死代码 | `claudeRuntimeState.mjs` | 初始化时加 `metrics: {}` |
| 2 | Claude `contextUsage` 口径错误 | `claudeMetrics.js` | 区分原生 Claude 与第三方 Claude SDK provider，不能默认 `input_tokens` 已含 cache |
| 3 | ClaudeCode 切 tab 闪烁 + 竞态 | `claudeCode/index.vue` | 加 `_refreshingMetrics` 锁 |
| 4 | homeMetrics 首页统计 4 BUG | `homeMetrics.js` | H1: 跨轮累加修复 / H2: 多事件累加修复 / H3: cacheCreation 补上 / H4: totalInput 公式修正 |

遗留 3 个低优先级：流式停滞（T145 修复）、usageApiSessionPct、cache 合并显示。

### T145 — Token 实时增长

| 阶段 | 内容 | Commit |
|------|------|--------|
| v1 | `getTokenMetrics()` inputTokens 用 `Math.max()` | `c3b5c53` |
| v1 | StatusBar CSS scale 弹跳动画 | `c3b5c53` |
| v1 fix | CSS `color: inherit` → `var(--cc-text-secondary)` | `b96140c` |
| v2 | `useAnimatedNumber` 平滑计数 | `6bf7608` |
| v2 fix | 解构 ref 到顶层（Vue 模板自动解包） | `f6d7810` |
| v2 fix | tick() Math.round + session 切换 snapNext | `9660528` |

**核心改造**：`claudeMetrics.js` L109
```js
// Before: 只在 stop_reason 时计数
if (stopReason) { inputTokens = usage.input_tokens || inputTokens }

// After: 所有消息都取 Math.max（input_tokens 是累积值）
inputTokens = Math.max(inputTokens, usage.input_tokens || 0)
```

### T146 — Per-Turn Token/时间标注

| 步骤 | 内容 | 状态 |
|:---:|------|:---:|
| P0 | TokenMetaRow.vue 共享组件 | ✅ |
| P1 | ClaudeCode 流式提取 + Bubble 引入 | ✅ |
| P2 | 简易对话 Claude token 累加 + Bubble 引入 | ✅ |
| P3 | CodeX per-turn delta + Bubble 引入 | ✅ |
| P4 | 简易对话 CodeX SSE usage 捕获 | ✅ |
| P5 | 历史加载兼容（JSONL 逐轮解析） | ✅ |

> 2026-06-24 本轮落地结果：
> 1. P3 已改为基于 JSONL `token_count/last_token_usage` 的保守实现，不依赖 SDK `turn.completed.usage`
> 2. P4 已在简易对话 `runCodexChatStream()` 捕获 `response.completed.usage`
> 3. P5 已补齐：历史消息恢复时从官方 JSONL 回填 `_turnTokens`
> 4. 状态栏动态数字仅基于真实样本插值，不补造中间 token；ClaudeCode / CodeX Agent 轮询已从 3s 调整为 1s
> 5. ClaudeCode context 占用现已按模型口径计算：原生 Claude 用 `input_tokens`，第三方 Claude SDK provider 额外计入 `cache_read/cache_creation`
> 6. 2026-06-24 追加收口：UI `in/out/cache` 必须统一语义；ClaudeCode 当前待修的是旧轮询样本回灌当前回合，CodeX 当前待修的是 live `token_count` 转发和 cache/input 展示口径。

---

## 五、已知问题

### 5.1 简易对话 StatusBar 无动态感

**现象**：StatusBar token 数字在对话完成时一次性跳变，流式期间无增长。

**根因**：简易对话的 `invoke()` 是同步阻塞调用（electron IPC invoke），整个 tool loop 完成后才返回结果。中间没有任何 metrics 事件 emit 到前端。

**影响范围**：仅简易对话（ClaudeCode 和 CodeX Agent 现为 1s 轮询，不受影响）。

**可能的修复方向**：
- A) 在 `doApiCall()` each iteration 完成后 emit 中间 metrics（但 IPC 是同步模式，需改为 message 通道）
- B) 简易对话也引入 JSONL 轮询（但当前简易对话不写 JSONL）
- C) 接受现状——简易对话的 StatusBar 只显示最终值

### 5.2 Tool 消息无单独 token 数据

**现象**：thinking、websearch 等 Tool 消息卡片上没有 token 标注。

**根因**：API / SDK 返回的 `usage` 是整次 assistant / result 的汇总，不拆分到单个 tool call。当前 transcript、Claude SDK `assistant/result`、CodeX 事件里都没有稳定的 per-tool token 字段。

**结论**：无法做“精确 per-tool usage”展示；若强行细分只能估算，当前实现明确不做。

### 5.3 简易对话 CodeX 无 usage 数据

**现象**：CodeX 简易对话的 `invoke()` 返回值无 `usage` 字段。

**根因**：`codexAgent.js` `runCodexChatStream()` 在解析 SSE `response.completed` 时未捕获 `usage` 对象。

**修复**：P4 待实现。

### 5.4 历史加载不显示 per-turn 数据

**现象**：加载历史对话时，assistant 消息无 token 脚注。

**根因**：历史消息从面板状态文件/sessions.json 恢复，未解析 JSONL 中 per-turn 的 token 数据。

**修复**：P5 待实现。

### 5.5 ClaudeCode 当前回合状态栏被旧轮询回灌

**现象**：新一轮开始后，输入框下方状态栏会出现上一轮的 `out/cache` 或在 0 与上一轮最终值之间跳动。

**根因**：状态栏按“当前回合”重置，但 JSONL 轮询读取的是 session transcript。如果轮询结果未按当前回合隔离，就可能把上一轮最终 token 当成当前回合样本。

**修复方向**：
- SDK live usage / result usage 先归一化为当前回合 UI metrics。
- 轮询数据只在能确认属于当前回合时更新 `in/out/cache`。
- 不能确认当前回合归属时，轮询只补 `contextUsage/contextWindow/git/duration` 等 session 级字段。

### 5.6 CodeX live 与 cache/input 口径待收口

**现象**：CodeX 状态栏可能在回合末尾突然跳变；`input_tokens` 与 `cached_input_tokens` 的显示容易被理解为重复或丢失 cache。

**根因**：当前未直接把流里的 `token_count` 事件即时转发到 `codex-agent-metrics`；同时 UI 沿用了原始字段名，缺少统一 `in/cache/out/context` 映射层。实测 CodeX JSONL 中 `total_tokens = input_tokens + output_tokens`，说明 `cached_input_tokens` 通常包含在 `input_tokens` 内，而不是额外独立桶。

**修复方向**：
- `token_count` 到达时即时归一化并发给前端。
- UI `in` 永远表示输入侧成本，CodeX 按 `max(0, input_tokens - cached_input_tokens) + cache_creation_input_tokens` 计算；`cache` 永远表示 `cached_input_tokens`。

---

## 六、相关文件索引

| 层级 | 文件 | 职责 |
|------|------|------|
| 主进程 | `electron/claudeAgent.js` | SDK 驱动 + 1s 轮询 + metrics IPC |
| 主进程 | `electron/claudeMetrics.js` | JSONL 解析 + token 统计 + cost 估算 |
| 主进程 | `electron/codexAgent.js` | CodeX 驱动 + JSONL 轮询 + metrics IPC |
| 主进程 | `electron/homeMetrics.js` | 首页跨 session token 聚合 |
| 前端 | `claudeCode/composables/useClaudeAgentStream.js` | 流式事件处理 + per-turn 提取 |
| 前端 | `codeX/composables/useCodexAgentStream.js` | CodeX 事件处理 |
| 前端 | `composables/useChatStream.js` | 简易对话 invoke + tool loop |
| 前端 | `agentCommon/composables/useAnimatedNumber.js` | rAF 平滑数字动画 |
| 前端 | `agentCommon/components/TokenMetaRow.vue` | per-turn 脚注组件 |
| 前端 | `claudeCode/components/StatusBarMetrics.vue` | ClaudeCode 状态栏 |
| 前端 | `codeX/components/StatusBarMetrics.vue` | CodeX 状态栏 |
| 前端 | `claudeCode/components/messages/AssistantMessageBubble.vue` | ClaudeCode 消息气泡 |
| 前端 | `codeX/components/messages/AssistantMessageBubble.vue` | CodeX 消息气泡 |
| 前端 | `chat/MessageBubble.vue` | 简易对话消息气泡 |
| 文档 | `docs/TODO.md` | 任务追踪 |
| 文档 | `docs/plan/2026-06-24-token-metrics-research.md` | 早期调研稿（已过时） |
| 文档 | `docs/agent-architecture.md` §16 | 架构文档中的 Token Metrics 章节 |

---

## 七、架构收口方案（2026-06-25）

### 7.1 当前判断

当前 token metrics 的主要风险已经不是单个 bug，而是结构本身仍然分叉：

1. 多数据源并存
   - ClaudeCode 同时依赖 SDK live usage、result usage、JSONL 轮询。
   - CodeX 同时依赖流内 `token_count`、final usage、JSONL 历史回填。
   - 简易对话又单独依赖 `invoke()` 返回 usage。

2. 归一化逻辑分散
   - 主进程、历史恢复、前端 footer、StatusBar、首页聚合都在各自解释 `input/cache/output`。
   - 同一个 provider 字段变化后，容易出现一处修好、另一处继续错。

3. 回合边界不统一
   - 有的链路按 live turn 更新。
   - 有的链路按 transcript 最后样本更新。
   - 缺少统一 `turnId` / `phase` 时，上一轮样本容易回灌到下一轮 UI。

4. 消费者各自维护状态
   - StatusBar
   - assistant message `_turnTokens`
   - 历史恢复
   - `homeMetrics`
   这四类消费者当前没有共享同一个 turn 级内部模型。

结论：继续按组件逐个补丁修，回归概率仍然高。

### 7.2 必须保持的对外语义

对外语义必须固定，不暴露 ClaudeCode / CodeX / provider 原始 usage 差异：

| UI 字段 | 含义 |
|------|------|
| `in` | 当前回合输入侧成本 token（常规输入 + cache creation） |
| `out` | 当前回合输出 token |
| `cache` | 当前回合缓存命中 token（仅 read） |
| `context` | 当前上下文占用，独立于当前回合 `in/out/cache` |

约束：

- 字段缺失时不补假数据。
- `contextUsage` 不能污染当前回合 `in/out/cache`。
- `cache creation` 归入 `in`，不能再并入 `cache`，避免把高成本写入和低成本 read 混成一类。
- provider 原始字段语义差异必须在主进程内部消化。

### 7.3 目标内部模型

后续建议所有链路都收口到同一个 turn 级模型：

```js
{
  provider,
  providerSessionId,
  chatKey,
  turnId,
  phase,                 // live | final | history
  inputTokens,           // 已归一化：常规输入 + cache creation
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  contextUsage,
  contextWindow,
  durationMs,
  costUsd,
  source,                // sdk-live | result | token_count | jsonl-final | history-backfill
}
```

约束：

- 只有同一 `turnId` 的事件才能更新当前回合 `in/out/cache`。
- 无法确认 turn 归属时，只能更新 `contextUsage/contextWindow/duration` 这类 session 级字段。
- `history` 只负责回填已完成回合，不能反向覆盖 live turn。

### 7.4 三阶段迁移

#### Phase A：Normalizer 收口

目标：主进程只保留一套 provider → UI 语义的归一化入口。

- ClaudeCode 所有 live/final/poll 样本先走同一个 normalizer。
- CodeX 所有 `token_count` / final usage / JSONL 样本先走同一个 normalizer。
- `homeMetrics` 的 transcript 聚合也必须复用同一 normalizer；它不是例外，只是另一个 consumer。
- 废弃前端按 provider 自行解释 `input_tokens` / `cached_input_tokens` 的逻辑。

建议任务：

- `T149` Token Metrics Normalizer 收口

#### Phase B：Turn Store 收口

目标：主进程维护单一 turn store，再广播给前端。

- 为每个 `chatKey` 维护当前 active turn。
- 明确 `turnId + phase` 状态机。
- `live -> final -> history` 只能单向收敛，不能倒灌。

建议任务：

- `T150` Token Turn Store

#### Phase C：Consumer 收口

目标：所有 UI 消费者读取同一份标准化 turn 数据。

- StatusBar 读 current turn store。
- footer `_turnTokens` 读 final turn snapshot。
- 历史恢复读 history/backfill snapshot。
- `homeMetrics` 只读 transcript/history 聚合，不混入 live UI 口径。

建议任务：

- `T151` Metrics Consumer 收口

### 7.5 应逐步废弃的旧模式

以下模式后续应视为待淘汰：

- 前端组件自己判断 `input_tokens` 是否包含 cache。
- 轮询读到 transcript 最后一条样本后，直接覆盖当前回合 UI。
- `_turnTokens`、StatusBar、history restore 各自做 delta 计算。
- `homeMetrics` 复用 StatusBar 的 turn 口径，或反过来。

### 7.6 当前修复的定位

2026-06-24 到 2026-06-25 这批修复，定位是止血，不是最终结构完成：

- 已修一批明确 bug：口径错误、负数漂移、最终动画不 snap、Claude footer 直接使用 raw `input_tokens` 等。
- 2026-06-25 追加止血：`homeMetrics.js` 已改为直接复用 `claudeMetrics.normalizeClaudeUsageForUi()`；新增 `tests/home-metrics.test.cjs`，覆盖原生 Claude 与第三方 Claude SDK provider 的首页聚合口径。
- 这些修复提升了当前可用性。
- 但只要 normalizer / turn store / consumer 还没完成收口，后续仍可能在新 provider、新 transcript 样本或历史恢复链路上复发。

因此后续验收不能只看“这次显示对了”，还要同时确认：

1. 当前回合 live 样本只影响当前 turn。
2. turn 结束后 final 值立即收敛且不再跳动。
3. 刷新 / 重启后历史值仍能按统一语义恢复。
4. 首页聚合与会话内展示明确区分 turn 口径和 session 聚合口径。

---

## 八、ClaudeCode cache 漂移定位与可执行重构方案（2026-06-25）

### 8.1 触发问题

用户在 ClaudeCode 消息脚注中观察到明显异常：

```
in 14.8k / out 10.2k / cache 3356.3k
```

随后在 CodeX 消息脚注中也观察到同类异常：

```
in 48.8k / out 78 / cache 14363.6k
```

这不是单纯的展示格式问题。当前 UI 已经把 `cache` 收口为 `cacheReadTokens`，仍然出现百万级 cache，说明异常值来自上游 metrics 样本本身。更重要的是，这次异常同时出现在：

- ClaudeCode footer `_turnTokens`
- CodeX footer `_turnTokens`
- 运行态 StatusBar（历史上已多次出现）

这证明问题范围不再是单 provider 的字段解释错误，而是 **turn ownership + consumer snapshot** 没有收口。

### 8.2 当前根因判断

ClaudeCode token metrics 目前有三条来源同时写同一套 UI 指标：

| 来源 | 当前路径 | 用途 | 风险 |
|------|----------|------|------|
| SDK live usage | `claudeAgent.js` stream loop → `extractClaudeLiveUsageMetricsFromSdkMessage()` | 运行中动态展示 | 样本可能是中间 assistant snapshot，不一定是最终 turn 值 |
| SDK result usage | `claudeAgent.js` `msg.type === 'result'` → `normalizeClaudeUsageForUi()` | turn 结束最终值 | 是当前 turn 最可信来源 |
| JSONL poll | `claudeAgent.js` 1s poll → `claudeMetrics.pollMetrics()` → `getTokenMetrics()` | 实时补偿、context、历史读取 | 缺少稳定 turn identity，容易把 session/transcript 样本误当 current turn |

当前问题的本质不是字段公式，而是**没有一个主进程内的 turn 级权威状态**：

- `pollMetrics()` 扫描 transcript，靠 `tokenSinceMs` 做时间过滤，不是按 `turnId` 过滤。
- `getTokenMetrics()` 遇到 `stop_reason` 后取最后一个非零 cache；没有 stop_reason 时 fallback 取最后 usage。
- live、poll、final 都可以向前端发 `claude-agent-metrics`。
- message footer `_turnTokens` 由前端从 `result.usage` 附着，StatusBar 则可能由 live/poll/final 任一来源更新。

因此它们可能各自看起来合理，但不是同一个 turn snapshot。

### 8.3 目标架构

新增一个主进程领域层：**Token Metrics Domain**。

目标不是重写 ClaudeCode / CodeX 面板，也不是替换已有 Agent event 抽象；目标是把 token metrics 的“样本归一化、turn 归属、consumer 输出”收口。

```
provider raw usage / JSONL
  ↓
TokenMetricsNormalizer
  ↓
TokenTurnStore
  ↓
StatusBar snapshot / final turn snapshot / history snapshot / home aggregate
```

### 8.4 数据模型

#### 8.4.1 NormalizedMetricSample

所有 provider 来源先转换为 sample，不能直接写 UI。

```js
{
  provider: 'claude' | 'codex' | 'chat',
  source: 'sdk-live' | 'sdk-result' | 'jsonl-poll' | 'jsonl-history' | 'token-count' | 'chat-result',
  chatKey: string,
  providerSessionId: string,
  turnId: string,
  phase: 'live' | 'final' | 'history' | 'session',
  sampleTs: number,

  inputTokens: number,          // UI in = regular input + cache creation
  outputTokens: number,
  cacheReadTokens: number,      // UI cache = cache read only
  cacheCreationTokens: number,  // retained for cost/debug, not displayed as cache

  contextUsage: number,
  contextWindow: number,
  durationMs: number,
  costUsd: number,

  rawUsage: object | null,
}
```

#### 8.4.2 TokenTurnSnapshot

这是 UI 唯一可消费结构。

```js
{
  provider: 'claude' | 'codex' | 'chat',
  chatKey: string,
  providerSessionId: string,
  turnId: string,
  phase: 'live' | 'final' | 'history',

  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  contextUsage: number,
  contextWindow: number,
  durationMs: number,
  costUsd: number,

  updatedAt: number,
  sources: string[],
}
```

### 8.5 ClaudeCode 权威来源规则

ClaudeCode current turn 的 token 写入规则必须收紧：

| 字段 | live 阶段权威来源 | final 阶段权威来源 | JSONL poll 权限 |
|------|------------------|-------------------|----------------|
| `inputTokens` | SDK live usage | SDK result usage | 默认不写 current turn |
| `outputTokens` | SDK live usage（如存在） | SDK result usage | 默认不写 current turn |
| `cacheReadTokens` | SDK live usage（如存在） | SDK result usage | 默认不写 current turn |
| `cacheCreationTokens` | SDK live usage（如存在） | SDK result usage | 默认不写 current turn |
| `contextUsage/contextWindow` | 可空 | result 或 JSONL | 可写 session 字段 |
| `durationMs` | wall clock | result.duration_ms | 可补 session 字段 |

关键约束：

- JSONL poll 不能直接覆盖 current turn 的 `in/out/cache`。
- JSONL poll 只能更新 current turn 的 `contextUsage/contextWindow/duration`，除非它能证明样本属于当前 `turnId`。
- ClaudeCode final snapshot 以 SDK `result.usage` 为准；JSONL final 只做缺失字段补偿。
- `_turnTokens` 和 StatusBar 必须来自同一个 final snapshot，而不是前端再从 `result.usage` 解析一次。

### 8.6 CodeX 权威来源规则

CodeX 的来源相对稳定，但也必须进入同一个 store。2026-06-25 新增实证已经说明：即便 `token_count` 本身较稳定，只要 footer `_turnTokens`、terminal fallback、history/backfill 没有共享同一个 final snapshot，仍然会把 session 累计 cache 误当成 per-turn cache。

CodeX 的来源相对稳定，但也必须进入同一个 store：

| 字段 | live 阶段权威来源 | final 阶段权威来源 | JSONL 权限 |
|------|------------------|-------------------|------------|
| `in/out/cache` | `token_count.last_token_usage` 或由 total delta 推导 | `turn.completed` / final token_count | 可用于 history/backfill |
| `contextUsage/contextWindow` | token_count info | token_count info | 可用于 history/backfill |
| `durationMs` | wall clock | terminal event / inferred | 可用于 history/backfill |

CodeX 可以继续消费 `token_count`，但同样不能让 StatusBar、footer、history 各自计算 delta。

### 8.7 实施步骤

#### Phase 0：诊断保护

目标：在不改行为的前提下收集证据，避免再次盲修。

改动：

- 在 main 进程加 `TOKEN_METRICS_DEBUG` 开关。
- 每次产生 metric sample 时记录：
  - `chatKey`
  - `providerSessionId`
  - `source`
  - `phase`
  - `input/output/cacheRead/cacheCreation`
  - `rawUsage` 摘要
- 日志写入 app `userData` 下诊断文件，不写官方 transcript 目录。

验收：

- 同一 ClaudeCode turn 能看到 live/result/poll 三类样本的数值差异。
- 能判断百万级 cache 来自 SDK result、SDK live 还是 JSONL poll。

#### Phase 1：Normalizer 模块收口

目标：所有 provider usage 只通过一个 normalizer。

新增建议文件：

- `packages/agent/electron/tokenMetrics/normalizer.js`
- `packages/agent/electron/tokenMetrics/normalizer.test.cjs`

迁移：

- `claudeMetrics.normalizeClaudeUsageForUi()` 移入或委托给 normalizer。
- `codexAgent.normalizeCodexUsage()` 移入或委托给 normalizer。
- `homeMetrics` 只调用 normalizer，不再手写 provider 字段公式。
- 前端不再判断 provider 口径。

测试：

- 原生 Claude：`input_tokens` 包含 read/creation。
- Claude SDK 第三方 provider：`input_tokens` 常规输入，read/creation 独立。
- CodeX：`cached_input_tokens` 是 `input_tokens` 子集。
- cache-only 样本仍生成可见 snapshot。

#### Phase 2：TokenTurnStore 最小实现

目标：先只接管 ClaudeCode current turn。

新增建议文件：

- `packages/agent/electron/tokenMetrics/turnStore.js`
- `packages/agent/electron/tokenMetrics/turnStore.test.cjs`

接口：

```js
beginTurn({ provider, chatKey, providerSessionId, startedAt })
applySample(sample)
finalizeTurn(sample)
getCurrentSnapshot(chatKey)
getFinalSnapshot(chatKey, turnId)
clearCurrentTurn(chatKey)
```

规则：

- `beginTurn()` 创建 `turnId`，记录 `startedAt`。
- `sdk-live` 只能更新相同 `turnId` 的 live snapshot。
- `sdk-result` finalizes current turn。
- `jsonl-poll` 对 current turn 默认只更新 context/duration。
- final 后不允许 live/poll 再覆盖 `in/out/cache`。

验收：

- ClaudeCode 一轮运行中，StatusBar 来自 `getCurrentSnapshot()`。
- turn 结束后，StatusBar 和 `_turnTokens` 来自同一个 final snapshot。
- JSONL poll 中出现异常大 cache 时，不能覆盖 current turn 的 cache。

#### Phase 3：消费者切换

目标：先切掉用户最直观看到错误的两个 consumer —— StatusBar 与 message footer，再逐步收 history/homeMetrics。

改动：

- `claudeAgent.js` 不再直接发送三路 metrics payload；改为 submit sample → 读 snapshot → 发送。
- `codexAgent.js` 的 terminal / footer / history 也改为 submit sample → 读 snapshot，禁止任一 fallback 直接把 raw total usage 塞给 `_turnTokens`。
- `useClaudeAgentStream.js` 不再从 `result.usage` 自行生成 `_turnTokens`；改为接收 main 发来的 final snapshot 或从消息 payload 附带的 `_turnTokens` 使用。
- `useCodexAgentStream.js` 不再把局部 delta/terminal fallback 直接当 `_turnTokens`；改为只消费主进程 final snapshot。
- `StatusBarMetrics.vue` 只展示 snapshot 字段。
- history restore 只读 history snapshot，不影响 current turn。

验收：

- StatusBar 与 assistant footer 数值一致。
- 刷新恢复后的 footer 与运行时 final snapshot 一致。
- 切 tab 后不会出现 cache 减半、暴涨或上一轮回灌。

#### Phase 4：CodeX 接入同一 store

目标：把 CodeX 已有较稳定的 token_count 链路并入统一模型。

改动：

- `token_count` → normalized sample → turn store。
- `turn.completed` → final sample。
- JSONL history → history snapshot。

验收：

- CodeX 动态 token 仍然实时增长。
- terminal fallback 不绕过 normalizer。
- StatusBar/footer/history 使用同一 snapshot。

#### Phase 5：删除旧路径

删除或降级以下模式：

- `getTokenMetrics()` 直接作为 current turn token 来源。
- 前端从 `result.usage` 自行生成 `_turnTokens`。
- `homeMetrics` 手写 provider usage 公式。
- 任意 consumer 直接解释 `input_tokens`、`cached_input_tokens`。

保留：

- `getTokenMetrics()` 可继续服务 history/context 查询。
- JSONL 仍然是历史恢复和对账来源。

### 8.8 测试矩阵

必须补自动化测试：

| 测试 | 覆盖点 |
|------|--------|
| `normalizer.test.cjs` | Claude 原生、Claude 第三方、CodeX、cache-only、缺字段 |
| `turnStore.test.cjs` | live → final、final 后 poll 不覆盖、turnId 不匹配拒绝、context-only poll |
| `claudeMetrics.test.cjs` | JSONL poll 不写 current turn token，仅补 context |
| `homeMetrics.test.cjs` | 首页聚合复用 normalizer，第三方 provider 不低估 context |

必须做人工验收：

1. ClaudeCode 单轮无 tool：StatusBar final 与 footer 一致。
2. ClaudeCode 多 tool：运行中 cache 不暴涨，结束后立即收敛。
3. ClaudeCode 切 tab：cache 不减半、不回灌上一轮。
4. ClaudeCode 刷新恢复：历史 footer 保留，当前 StatusBar 不显示旧 turn。
5. CodeX 单轮与多 tool：动态增长保留，footer 与 final 一致。
6. 首页统计：`input/cache` 与会话内新口径一致。

### 8.9 风险与边界

- ClaudeCode SDK 如果 live usage 本身不稳定，运行中只能展示已有真实样本；不能补假数据。
- JSONL 没有稳定 turn identity 前，不应再承担 current turn token 权威来源。
- 简易对话是单轮为主，不强制接入 Phase 2；可在 Phase 4 后用 `chat-result` sample 接入。
- 不写 `~/.claude` / `~/.codex` sidecar，不污染官方 transcript。
- 不在本轮改 Agent Protocol 通信抽象；这是 token metrics 领域层，不是 transport 重构。

### 8.10 完成定义

本重构完成必须同时满足：

- 主进程内只有一个 provider usage normalizer。
- ClaudeCode current turn 的 `in/out/cache` 不再由 JSONL poll 直接覆盖。
- StatusBar、footer、history restore 读取同一类 snapshot。
- cache creation 始终归入 `in`，cache 只显示 read。
- 任何缺失字段不补假数据。
- 旧调研文档不再作为任务入口。
