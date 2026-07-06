# Agent Lifecycle Characterization (T197)

> 映射 Claude / CodeX agent loop 中的 stream、abort、done、session map、metrics flush 生命周期。
> 不拆分代码 — 仅表征现状，作为后续提取决策的依据。

## 生命周期阶段

```
                    ┌──────────────────────────────┐
                    │     IPC: AGENT_QUERY          │
                    │  claudeAgent.js:2618          │
                    │  codexAgent.js:2341           │
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │  1. SESSION START             │
                    │  ─ create AbortController     │
                    │  ─ agentSessions.set()        │
                    │  ─ beginTurn() [TurnStore]    │
                    │  ─ pendingSessionMetaByChatKey│
                    │  ─ start metrics poller       │
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │  2. STREAM LOOP               │
                    │  ─ SDK query/runStreamed      │
                    │  ─ for await (msg of stream)  │
                    │  ─ cliSessionIds set on first │
                    │    session_id / thread.started│
                    │  ─ emit metrics per chunk     │
                    │  ─ forward to renderer        │
                    └──┬──────────┬──────────┬─────┘
                       │          │          │
              ┌────────▼──┐ ┌─────▼────┐ ┌──▼──────────┐
              │ result msg │ │  ABORT   │ │ stream error │
              │ (正常完成)  │ │ (用户/系统)│ │ (SDK 异常)   │
              └────────┬──┘ └─────┬────┘ └──┬──────────┘
                       │          │          │
                       └──────────┼──────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │  3. DONE / FINALIZE           │
                    │  ─ resolve done reason        │
                    │  ─ send AGENT_DONE to renderer│
                    │  ─ send AGENT_EVENT           │
                    │  ─ agentSessions.delete()     │
                    └─────────────┬────────────────┘
                                  │
                    ┌─────────────▼────────────────┐
                    │  4. CLEANUP (finally)         │
                    │  ─ clearTimeout(bootWatch)    │
                    │  ─ stopMetricsPoller          │
                    │  ─ clearCurrentTurn()         │
                    │  ─ pendingSessionMeta.delete()│
                    │  ─ resolve(exitCode)          │
                    └──────────────────────────────┘
```

## Claude Agent 详情

### 状态 Map（`setupClaudeHandlers` 闭包内, ~2591-2597）

| Map | Key | Value | 生命周期 |
|-----|-----|-------|----------|
| `agentSessions` | `chatKey` | `{ query, event, abortController, model, cwd, baseURL, apiKey, runMode }` | set:2957, del:3023/3278/3292 |
| `cliSessionIds` | `chatKey` | SDK `session_id` (UUID) | set:3046/3052/3127, del:3161/3178 |
| `sessionModels` | `chatKey` | model string | set:3128, 不清除（跨 run 保留） |
| `metricsPollers` | `chatKey` | `{ interval, startTime, lastCliSessionId }` | set:2973, del:3203 |
| `pendingSessionMetaByChatKey` | `chatKey` | `{ model, effort, modelTier }` | set:2632, del:2673/3279/3293 |
| `activeChatAborts` | `chatId` | `AbortController` (简易对话) | set:2538, del:2542 |

### 流循环 (~3038-3145)

```
for await (const msg of q) {
  if (!agentSessions.has(chatKey)) break           // 会话已被删 → 退出
  backgroundTaskTracker.updateFromSdkMessage(msg)   // 追踪子 agent 后台任务
  if (msg.session_id) cliSessionIds.set(...)        // 首次注册
  if (msg.usage) emitClaudeMetricsViaStore(...)     // 实时指标
  if (msg.type === 'result') {                      // 最终结果
    buildClaudeFinalTurnMetricsFromResultUsage()     // 最终指标
    resultReceived = true
    sendCompletedDoneIfReady(...)                    // 发送 AGENT_DONE
  }
  safeSend(sender, AGENT_MESSAGE, ...)              // 转发到渲染进程
}
```

### done 协调器 (`sendCompletedDoneIfReady`, ~3010)

- 如果后台任务活跃 → 排队 done，等任务完成后发送
- 否则 → 立即发送 `AGENT_DONE` + 删除 `agentSessions.delete(chatKey)`
- 也发送 `CORE_CHANNELS.AGENT_EVENT` (`agent.run.done` / `agent.turn.terminal`)

### 指标 collect path

1. **SDK 实时指标**: 流循环内, `extractClaudeLiveUsageMetricsFromSdkMessage` → `emitClaudeMetricsViaStore` → `submitSample()`
2. **JSONL 轮询**: 1s interval polling `claudeMetrics.pollMetrics(cliId, cwd, ...)` → `emitClaudeMetricsViaStore`
3. **Result 最终指标**: `msg.type === 'result'` → `buildClaudeFinalTurnMetricsFromResultUsage(usage, model)`
4. **Turn 清理**: `clearCurrentTurn(chatKey)` (finally 块中)

### abort 路径

1. **AGENT_ABORT IPC** (~3286): `s.abortController.abort()` + `s.query.close()` + `agentSessions.delete(chatKey)` + 发送 `AGENT_DONE { reason: 'aborted' }`
2. **流循环 catch** (~3154): `resolveClaudeDoneReasonFromError(err)` → `'aborted'` if AbortError
3. **finally 块** (~3198): 清理 poller + turn + session map

---

## CodeX Agent 详情

### 状态 Map（模块顶层, ~2159-2163）

| Map | Key | Value | 生命周期 |
|-----|-----|-------|----------|
| `codexSessions` | `sessionId` | `{ runId, abortController, thread, event, model, cwd, streamClosed, doneSent, completionPromise, ... }` | set:2428, del:2396/3287/3348/2313 |
| `cliSessionIds` | `sessionId` | CodeX SDK thread ID | set:2839/3384, del:2225/2569/3389/3381/2315 |
| `sessionFingerprints` | `sessionId` | `JSON({ model, baseURL, apiFormat, reasoningEffort })` | set:2844, del:3392/2316 |
| `codexMetricsPollers` | `sessionId` | `{ interval, runId }` | set at start, del via `stopCodexMetricsPoller` |

额外状态:
- `pendingItemIds` (Set): 流中未完成的 SDK item ID
- `_metricsAggregateCache` / `jsonlLineCache`: 文件派生缓存 (按 mtime 签名)

### 流循环 (~2810-3200)

```
for await (const ev of events) {
  switch (ev.type) {
    case 'thread.started':  cliSessionIds.set(sessionId, ev.thread_id)
    case 'turn.completed':  sessionFingerprints.set(...); perTurnTokens
    case 'token_count':     emitCodexMetricsViaStore(turn-live)
    case 'turn.completed' / 'turn.failed' / 'task_complete':
      resultReceived = true
      emitCodexMetricsViaStore(turn-final)
      maybeSendDone()          // 排空逻辑
    case 'item.*':           pendingItemIds add/delete; AGENT_MESSAGE
    case 'compaction_*':     向前端发送 compaction 事件
  }
}
```

### 排空逻辑 (~2699-2788)

CodeX 独有的复杂性：SDK 的 `turn.completed` 事件到达后，仍可能有剩余的 `item.completed` 事件。排空机制确保所有 item 都完成后才发送 `AGENT_DONE`。

- `maybeSendDone()`: pendingItemIds 为空 → `scheduleDone(DRAIN_EMPTY_MS)`, 否则 → `scheduleDone(DRAIN_PENDING_IDLE_MS)`
- `flushDone()`: 重新检查状态；空闲/总时间超限 → `triggerDone()`；否则重新排期
- `triggerDone()`: 设置 `doneSent = true`, `streamClosed = true`, 发送 `AGENT_DONE` + `AGENT_EVENT`

### 指标 collect path

1. **SDK 实时**: `ev.type === 'token_count'` → `emitCodexMetricsViaStore(scope: 'turn-live')`
2. **JSONL 轮询**: 1s interval → `extractLatestCodexLiveTurnMetricsFromJsonl()` + `getCodexSessionMetricsByFile()`
3. **Turn 最终**: `turn.completed` → `emitCodexMetricsViaStore(scope: 'turn-final')`
4. **Turn 清理**: `clearCurrentTurn(sessionId)` (finally 块)

### abort 路径

1. **AGENT_ABORT IPC** (~3335): `s.abortController.abort()` + `s.thread.cancel()` + `codexSessions.delete(sessionId)` + 发送 `AGENT_DONE { reason: 'aborted' }`
2. **空闲超时** (~2475): 10min 无事件 → `abortController.abort()`
3. **catch 块** (~3183): AbortError → `doneReason = 'aborted'`
4. **finally 块** (~3217): 清理 timers + poller + turn + session map
5. **运行 ID 防护**: `deleteCodexSessionRunIfCurrent(codexSessions, sessionId, runId)` 只在 runId 匹配时删除，防止过时 finally 清除新运行

---

## 差异对比

| 维度 | Claude | CodeX |
|------|--------|-------|
| **会话标识** | `chatKey` (UI 侧) | `sessionId` (UI 侧) |
| **SDK 调用** | `sdk.query({ prompt, options })` → AsyncIterable | `thread.runStreamed(input, { signal })` → events |
| **会话恢复** | `query({ resume: sessionId })` | `codex.resumeThread(prevCliId, ...)` |
| **流输入** | `existing.query.streamInput(userMsg)` 复用 | 不支持 (每次新建 thread) |
| **done 延迟** | `backgroundTaskTracker` (子 agent 追踪) | 排空逻辑 (`pendingItemIds` + `scheduleDone`) |
| **指标源** | SDK 消息内联 usage + JSONL 轮询 | `token_count` 事件 + JSONL 轮询 |
| **会话指纹** | `sessionModels` (仅 model) | `sessionFingerprints` (model + baseURL + apiFormat + effort) |
| **运行竞态防护** | 无 (简单删除) | `runId` 递增 + `deleteCodexSessionRunIfCurrent` |
| **空闲超时** | 无 | 10 分钟 `TURN_TIMEOUT_MS` |
| **compaction 事件** | 无 | `compaction_trigger` / `compaction` / `context_compaction` |

## 共享模式

1. **AGENT_QUERY → AGENT_DONE 握手**: 两个 agent 都通过 IPC 通道 `AGENT_QUERY` 接收请求，通过 `AGENT_DONE` 返回结果
2. **AbortController 模式**: 都使用 `AbortController` 传递 abort signal 给 SDK，并在 `AGENT_ABORT` IPC 中触发
3. **TurnStore 集成**: 都调用 `beginTurn()` → `submitSample()` → `clearCurrentTurn()`
4. **指标双通道**: 都同时使用 SDK 内联指标 + JSONL 磁盘轮询
5. **agentSessions Map**: 都是 in-memory Map，会话结束/中止时删除
6. **AGENT_EVENT 协议**: 都通过 `CORE_CHANNELS.AGENT_EVENT` 发送 `agent.run.done` 事件
7. **渲染进程完成处理**: 都在 `AGENT_DONE` 后触发 `REGISTER_CLI_SESSIONS` → `findSessionRecordByProvider`

## 建议

1. **不要合并流循环**: Claude 和 CodeX 的 SDK 接口差异太大（`query()` AsyncIterable vs `runStreamed()` event emitter），强行统一会引入不必要的抽象层
2. **可提取的共享模块**: `emitMetricsViaStore` 模式几乎相同（TurnStore 集成 + AGENT_METRICS 发射），可抽取为共享帮助函数
3. **排空逻辑差异合理**: CodeX 的 item 排空是其 SDK 架构的必要产物；Claude 的 backgroundTaskTracker 解决不同的问题
4. **运行竞态防护**: CodeX 的 `runId` 方案更健壮，Claude 可考虑对齐（低优先级）
