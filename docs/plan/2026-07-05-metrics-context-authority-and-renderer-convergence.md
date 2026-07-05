# T180 Metrics Context Authority + Renderer Convergence

> Date: 2026-07-05
> Status: proposed
> Owner: token metrics follow-up
> Contract anchor: `docs/token-metrics-contract.md`

## 1. Problem

当前 token metrics 主链路已经基本统一：

```text
provider adapter -> normalizer -> TurnStore -> snapshot -> UI
```

但仍有一类重复回归没有彻底收口：

- 新回合一开始，`context` 会先退回一个默认值，再等后续样本修正。
- ClaudeCode 首次切入某个会话时，`StatusBarMetrics` 偶发为空，点一次才出现。
- 低置信度 `context` 样本会覆盖上一轮更可信的 `context`，导致数值突然偏低。

这些问题不是 turn token 公式错误，而是 `context` 权威来源和 renderer 首次 hydrate 机制仍不够明确。

## 2. Goal

本任务只收口两件事：

1. `context` 的 authority / carry-forward / downgrade 规则。
2. ClaudeCode / CodeX 在 renderer 层的首次 hydrate 与 live update 消费对称性。

非目标：

- 不重写整个 metrics 架构。
- 不把 session aggregate token totals 回灌成当前回合 `in/out/cache`。
- 不伪造 live token 增长。
- 不把 `context` 做成累计历史总量。

## 3. Decision

### 3.1 `context` 与 turn token 分离

- `in/out/cache/duration` 仍然严格属于“当前回合”。
- `context/contextWindow` 属于“当前会话当前上下文占用”。
- `context` 可以在新回合开始时继承上一轮的已确认值。
- `in/out/cache/duration` 不允许从上一轮继承。

### 3.2 New-turn carry-forward

新回合开始时，如果同一 session 已有上一次确认过的 `contextUsage/contextWindow`：

- `StatusBarMetrics` 应先显示这份已确认 `context`。
- 只要没有新的更高权威样本到达，就保持它。
- 到达新的可信样本后，再替换它。

这比“先退回默认值/初始值”更合理，因为：

- `context` 本来就是 session 级状态，不是当前回合 token。
- 回合切换本身不会把上下文瞬间清空。
- 默认值回退会制造“明明 cache 很高，但 context 只有几千”的假象。

### 3.3 Authority priority

建议把 `context` 来源分成四档：

1. `compact-boundary`
2. `system-context`
3. `usage-estimate`
4. `carry-forward`

解释：

- `compact-boundary`：压缩边界后的 transcript 明确信号，可合法上调或下调。
- `system-context`：provider 若显式提供 `context_usage`，可作为高权威上下文样本。
- `usage-estimate`：由单次 usage 推出的估算值，只能在没有更强样本时使用。
- `carry-forward`：只用于“补空”，不能主动覆盖任何真实样本。

### 3.4 Overwrite / downgrade rules

- 高权威可以覆盖低权威。
- `0/null/缺失` 不能覆盖已有非零 `context`。
- `carry-forward` 只能填补空白，不能覆盖真实值。
- `usage-estimate` 不得覆盖 `compact-boundary` 或 `system-context`。
- 合法下调只允许来自：
  - `compact-boundary.postTokens`
  - 同级或更高权威的明确新样本

## 4. Renderer convergence target

当前 main-process 的语义已经大体收敛，但 renderer 仍有不对称：

- CodeX 更接近“按 sessionId/chatKey 消费 snapshot”。
- ClaudeCode 仍有部分路径更依赖 active tab 时序。

目标：

- ClaudeCode 与 CodeX 都按稳定的 `sessionId/chatKey` 归属消费 metrics snapshot。
- 首次进入历史会话时，不需要再点一次才能看到最近一轮 final snapshot。
- 运行中只更新当前 active session 的 live turn token。
- idle 时恢复的是“最近一轮 finalized snapshot + 当前 session context”，不是 panel state 脏值，也不是整份 transcript aggregate。

## 5. Implementation Steps

### Step 1

在 contract 与 TurnStore 中显式加入 `contextSource/contextAuthority` 语义。

### Step 2

把 `pickSessionMetricValue()` 从“最新正数覆盖旧值”提升为“按 authority 决策”。

### Step 3

在 renderer 统一首次 hydrate：

- 先恢复同 session 最近 final snapshot。
- 同时保留最近 confirmed context。
- 新回合开始时清 turn token，不清 context。

### Step 4

增加 transcript/golden fixtures：

- Claude 正常回合
- Claude cache-read 很高但 input 很小
- Claude compact 后继续对话
- CodeX 长回合、多次 token_count
- 首次进入历史会话立即显示 latest final snapshot

## 6. Acceptance

- 新回合开始时，`context` 不再先掉回默认值。
- 新回合开始时，不会继承上一轮 `in/out/cache/duration`。
- 首次进入 ClaudeCode/CodeX 历史会话时，`StatusBarMetrics` 能直接显示最近一轮 final snapshot。
- 低权威 `context` 样本不能把高权威 `context` 覆盖成更低值。
- compact 后允许 `context` 合法下降。
- footer 与 status bar 的 turn token 都只代表当前回合，不包含整个 transcript 历史累计。

## 7. Guardrails

- 若拿不到新的可信 `context`，宁可继续显示上一轮 confirmed context，也不要回退成默认值。
- 若当前 provider 没有 live token 样本，不能为了动画伪造 `in/out/cache` 增长。
- 若 `context` 真实性不足，允许“不更新”，但不允许“用明显错误的更小值覆盖正确旧值”。
