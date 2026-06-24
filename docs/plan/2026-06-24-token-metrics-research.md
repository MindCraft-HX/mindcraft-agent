# Token 使用统计优化 — 研究与规划

> 生成时间: 2026-06-24
> 用户需求：
> 1. 研究 codex/claudecode 回传的 token 数据，是否可实时增长或模拟增长（对标 CLI 使用体验）
> 2. 对话界面每个 turn 标注消耗的 token 和时间
> 3. 排查输入框下方 metrics 及首页 token 消耗统计的 BUG

---

## 一、研究结论

### 1. Token 数据实时增长可行性

#### Claude Agent SDK（主 Agent 模式）

**当前机制：**
- 3 秒轮询 `claudeMetrics.pollMetrics()` → 解析 JSONL 文件
- **关键问题**：`getTokenMetrics()` 只统计带有 `stop_reason` 的已完成轮次（去重策略），中间件 tool_use 循环里的 assistant 消息被跳过
- 结果：流式期间如果 agent 在 tool-use 循环中（很常见），3s 轮询返回的 token 数**不变**，直到某一轮 API 返回 `stop_reason: 'end_turn'`
- SDK 最终 `result` 消息包含完整 `usage`（input/output/cache），是权威值

**可行方案：**
- **方案 A（推荐）**：修改 `pollMetrics()` / `getTokenMetrics()`，新增"未完成轮次"聚合模式——累加所有 assistant 消息的 usage（不要求 stop_reason），用于实时显示；最终值仍以 `result` 消息为准覆盖
- **方案 B**：在 `claude-agent-message` 流中直接携带每个 assistant 消息的 usage（SDK 已在消息中提供），前端累加显示
- **风险**：方案 A 的未完成轮次可能有重复计数（同一轮多个 chunk），需要去重逻辑

#### Codex Agent

**当前机制：**
- 3 秒轮询 `getCodexSessionMetricsByFile()` → 解析 JSONL 中 `token_count` 事件
- Codex CLI 在流式期间持续写入 `token_count` 事件，包含 `total_token_usage`（累积值）和 `last_token_usage`（本轮值）
- **实时性较好**：token_count 事件频繁写入，3s 轮询能捕获增量变化

**可行方案：**
- Codex 的实时数据已经可用，主要是**前端展示优化**——StatusBarMetrics 的数字变化不够平滑
- 可以加 transition 动画让数字渐变，模拟"增长感"

#### 简易对话（ChatView）

- Token usage 只在流结束时的 `message_delta` SSE 事件中返回
- `invoke()` 返回了 usage 但前端丢弃了
- **改进**：在 `useChatStream.js` 的 `doApiCall` 中保存 usage，传递给 ChatView 显示

#### 总体结论

| Agent | 实时 token 数据 | 改进方向 |
|-------|----------------|---------|
| Claude SDK | ❌ 轮询跳过未完成轮次 | 改 pollMetrics 聚合所有 assistant usage |
| Codex | ✅ token_count 频繁写入 | 前端动画平滑数字增长 |
| 简易对话 | ❌ 仅流结束返回 | 保存 invoke result 中的 usage |

---

### 2. Per-Turn 标注 Token / 时间

**结论：完全可行，改动集中**

三条对话线（ClaudeCode / CodeX / 简易对话）的 message 对象目前都**没有** token/time/cost 字段。

**改动策略：**

| Agent | Token 数据来源 | 时机 | Time 来源 |
|-------|---------------|------|-----------|
| Claude SDK | `result` 消息的 `usage` 对象 | turn 结束 | `result.duration_ms` 或 `Date.now() - _thinkingStart` |
| Codex | `turn.completed` 事件的 usage | turn 结束 | 同上的 durationMs 字段 |
| 简易对话 | `invoke()` 返回的 `usage` | 流结束 | `Date.now() - turnStartTime` |

**UI 方案：**
- 在最后一个 assistant message bubble 底部追加一行小字元数据：`🕐 12.3s · 📊 in 5.2k / out 1.8k · 💰 $0.12`
- 样式：灰色 11px，右对齐或居中，位于消息气泡内底部
- 可配置开关（默认开启）

**涉及文件：**
- `claudeCode/components/messages/AssistantMessageBubble.vue` — 新增 metadata 行
- `codeX/components/messages/AssistantMessageBubble.vue` — 同上
- `chat/MessageBubble.vue` — 同上（简易对话）
- `claudeCode/composables/useClaudeAgentStream.js` — 捕获 result 消息的 usage
- `codeX/composables/useCodexAgentStream.js` — 捕获 turn.completed 的 usage
- `composables/useChatStream.js` — 保存 invoke result 的 usage

---

### 3. Metrics 统计 BUG 排查

共发现 **7 个问题**，按严重程度排列：

#### BUG #1 🔴 ClaudeCode `tab.metrics` 从未创建（中等）

**位置**：`claudeCode/utils/claudeRuntimeState.mjs`
**现象**：`applyClaudeMetrics()`、`markClaudeTurnStarting()` 等函数中所有 `tab.metrics.xxx` 写入都是死代码——`tab.metrics` 始终为 `undefined`，写入被 guard 子句跳过。
**影响**：thinking 状态标记、持久化 metrics 等功能不生效。
**修复**：在 `createChat()` 中初始化 `metrics: {}`，对齐 CodeX 的实现。

#### BUG #2 🔴 ClaudeCode 流式期间 token 数值停滞（中等）

**位置**：`electron/claudeMetrics.js` → `getTokenMetrics()`
**现象**：只统计有 `stop_reason` 的轮次。Agent 在 tool-use 循环中时（常见场景），token 数不变。
**影响**：StatusBarMetrics 在长时间 tool-use 期间显示过时数据。
**修复**：新增 `pollMetrics` 实时模式——累加所有 assistant message 的 usage（不要求 stop_reason），用最后一条 `message.id` 去重。

#### BUG #3 🟡 ClaudeCode `metricsData` 切 tab 闪烁（中高）

**位置**：`claudeCode/index.vue` → `refreshMetricsForChat()`
**现象**：切换 tab 时 `resetMetrics()` 清零 → 异步查询 → 数据回来，中间有几帧显示全 0。
**影响**：视觉 jank，用户体验差。
**修复**：先查询再替换（不先 reset），或在查询完成前保留旧值。

#### BUG #4 🟡 ClaudeCode `resetMetrics` 与 polling 竞态（中等）

**位置**：`claudeCode/index.vue` → `refreshMetricsForChat()` + `onMetricsUpdate()`
**现象**：`resetMetrics()` 和 IPC polling 事件之间存在竞态窗口——polling 数据可能部分覆盖刚查出的完整数据。
**修复**：在 refresh 期间加锁忽略 polling 事件，或先查后换（见 BUG #3）。

#### BUG #5 🟡 ClaudeCode `metricsLiveDurationMs` 计时漂移（中等）

**位置**：`claudeCode/index.vue` → `syncMetricsTimerForClaudeTab()`
**现象**：`_thinkingStart` 首次设置时用 `Date.now()`（当前时间），之后用 `Date.now() - durationMs` 回拨。如果首次 polling 延迟到达，显示时长偏短，回拨时跳跃。
**修复**：统一用 `durationMs` 回拨逻辑；没有 durationMs 时直接用 `Date.now()` 但加上首次 assistant 消息的时间戳偏移。

#### BUG #6 🟢 CodeX `usageApiSessionPct` 始终为 null（低）

**位置**：`electron/codexAgent.js` → metrics 构建
**现象**：CodeX 的 metrics 中 `usageApiSessionPct` 硬编码为 `null`，API 额度百分比永不可见。
**修复**：如果 CodeX 使用 Anthropic 模型，复用 Claude 的 Usage API 查询。如果用 OpenAI 模型，此字段保持 null 即可。

#### BUG #7 🟢 Cache token 合并显示（低/体验）

**位置**：`StatusBarMetrics.vue` ×2
**现象**：`cache (cacheRead + cacheCreation)` 合并为单一数字，但 read ($0.30/M) 和 creation ($3.75/M) 成本相差 12 倍。
**修复**：拆分为 `cache r 1.2k / w 300` 或 tooltip 显示详情。

---

## 二、任务清单（建议优先级）

### Phase 1 — BUG 修复（先修统计问题）

| # | 任务 | 改动文件 | 预估 |
|---|------|---------|------|
| T144 | ClaudeCode 创建 `tab.metrics` 初始化 | `claudeRuntimeState.mjs` + `claudeCode/index.vue` | 小 |
| T145 | ClaudeCode metrics 切 tab 闪烁修复 | `claudeCode/index.vue` | 小 |
| T146 | 修复 resetMetrics/polling 竞态 | `claudeCode/index.vue` | 小 |
| T147 | CodeX `usageApiSessionPct` 修复（Anthropic 模型） | `codexAgent.js` | 小 |

### Phase 2 — Token 实时增长

| # | 任务 | 改动文件 | 预估 |
|---|------|---------|------|
| T148 | Claude: pollMetrics 增加实时模式（聚合未完成轮次） | `claudeMetrics.js` | 中 |
| T149 | Codex: StatusBar 数字增长动画 | `codeX/StatusBarMetrics.vue` | 小 |
| T150 | 简易对话: 保存 invoke result usage 到 message | `useChatStream.js` + `ChatView.vue` | 小 |

### Phase 3 — Per-Turn Token/Time 显示

| # | 任务 | 改动文件 | 预估 |
|---|------|---------|------|
| T151 | ClaudeCode AssistantBubble 追加 metadata 行 | `AssistantMessageBubble.vue` | 中 |
| T152 | ClaudeCode stream handler 捕获 result usage 注入消息 | `useClaudeAgentStream.js` | 中 |
| T153 | CodeX AssistantBubble 追加 metadata 行 | `codeX/AssistantMessageBubble.vue` | 中 |
| T154 | CodeX stream handler 捕获 turn.completed usage | `useCodexAgentStream.js` | 中 |
| T155 | 简易对话 MessageBubble 追加 metadata | `MessageBubble.vue` + `useChatStream.js` | 小 |

---

## 三、关键文件索引

| 文件 | 作用 |
|------|------|
| `packages/agent/electron/claudeMetrics.js` | Claude JSONL 解析、token 计数、速度、Usage API |
| `packages/agent/electron/codexAgent.js` (L740-888) | Codex JSONL 解析、token_count 事件处理 |
| `packages/agent/electron/claudeAgent.js` (L2793-2874) | Claude 3s polling 循环 + 最终 metrics |
| `packages/agent/src/components/claudeCode/index.vue` | ClaudeCode 主视图，metricsData ref + IPC 监听 |
| `packages/agent/src/components/codeX/index.vue` | CodeX 主视图，tab.metrics computed + IPC 监听 |
| `packages/agent/src/components/claudeCode/components/StatusBarMetrics.vue` | Claude 底部状态栏 |
| `packages/agent/src/components/codeX/components/StatusBarMetrics.vue` | CodeX 底部状态栏（几乎相同） |
| `packages/agent/src/components/claudeCode/components/messages/AssistantMessageBubble.vue` | Claude 助手消息气泡 |
| `packages/agent/src/components/codeX/components/messages/AssistantMessageBubble.vue` | CodeX 助手消息气泡 |
| `packages/agent/src/components/chat/MessageBubble.vue` | 简易对话气泡 |
| `packages/agent/src/components/claudeCode/utils/claudeRuntimeState.mjs` | Claude 运行时状态（含死代码 tab.metrics） |
| `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js` | Claude 流事件 → 消息转换 |
| `packages/agent/src/components/codeX/composables/useCodexAgentStream.js` | CodeX 流事件 → 消息转换 |
| `packages/agent/src/composables/useChatStream.js` | 简易对话流处理 |
