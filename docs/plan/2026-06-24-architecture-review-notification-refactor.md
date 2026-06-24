# Agent 运行时事件架构重构规划

> 日期：2026-06-24
> 状态：评审稿 v0.2
> 范围：`packages/agent` 内 ClaudeCode / CodeX 的运行时事件、done 语义、metrics、通知触发边界、多 Agent 扩展、未来远程 Runtime 兼容

## 1. 结论

当前架构的问题不是某一个提示音 bug，而是 Agent 运行时语义散落在 Main、Renderer、IPC 和 UI 状态里：

- Main 通过 `claude-agent-message` / `codex-agent-message` 转发原始或半原始 provider 事件。
- Main 通过 `claude-agent-done` / `codex-agent-done` 发送收尾事件，但 done 同时承载 session 绑定、UI 解锁、错误状态和通知触发。
- Renderer 侧 composable 既解析 provider 事件，又更新 UI message，又维护 runtime state，又触发声音/高亮，又保存历史。
- metrics / per-turn token 既在 Main 解析 JSONL，又在 Renderer 从 result / turn.completed 里补一遍。

这导致 bug 修复经常变成局部补丁：改通知会碰 done reason，改 token 会影响状态栏，改 session 恢复会碰历史加载。重构的核心价值是建立稳定的 MindCraft 领域事件层，让各模块消费明确语义，而不是重复猜 provider 原始事件的含义。

通知音问题应拆成独立的小修，不等待完整重构，但也不应继续寄生在 `reason === 'completed'` 上。该小修在本方案确认后单独实施。

本方案不要求切换 Tauri，也不要求新增独立后端进程。当前实现仍基于 Electron `Renderer + Preload + Main`。但事件协议和客户端访问层必须按 transport-agnostic 设计：第一阶段走 Electron IPC，未来可以替换或并存 WebSocket / HTTP / 本地 sidecar。

## 2. 已调研事实

### 2.1 当前 IPC 通道

Preload 暴露的主要运行时事件：

| Agent | message 通道 | done 通道 | metrics 通道 |
|------|--------------|-----------|--------------|
| ClaudeCode | `claude-agent-message` | `claude-agent-done` | `claude-agent-metrics` |
| CodeX | `codex-agent-message` | `codex-agent-done` | `codex-agent-metrics` |

当前 message 通道仍以 provider 原始事件为核心。Renderer 必须理解：

- Claude 的 `assistant` / `user` / `result` / `system` / `tool_result`
- CodeX 的 `item.started` / `item.updated` / `item.completed` / `turn.completed` / `task_complete` / `metrics`

### 2.2 done 事件的真实职责

`*-agent-done` 当前至少承担 5 件事：

1. 填充 `cliSessionId` / `filePath`
2. 注册 `chatKey -> cliSessionId` 映射
3. 清理 `thinking` / `_awaitingDone` / `_thinkingStart`
4. 根据 `reason` 标记 failed / aborted / interrupted
5. 触发提示音、后台高亮、任务栏闪烁

其中第 5 项是横切关注点，不应依赖 done reason。

### 2.3 Claude 的双 done 风险

Claude 主进程在 `result` 到达时会发送一次 `claude-agent-done(reason='completed')`，finally 中还会根据 `finalizeClaudeDoneReason()` 再发送一次 done。虽然前端大多数状态赋值是幂等的，但通知、历史保存和 dangling tool 标记不是天然无风险。

相关位置：

- `packages/agent/electron/claudeAgent.js`：`result` 分支发送 done
- `packages/agent/electron/claudeAgent.js`：finally 分支再次发送 done
- `tests/claude-agent-done-payload.test.cjs`：已覆盖 done payload 和 reason finalization

### 2.4 CodeX 的 done window 防护不能破坏

CodeX 已经有一套历史修复：

- `runId`
- `doneSent`
- `resultReceived`
- `streamClosed`
- `TERMINAL_SEEN`
- `_awaitingDone`

这些不是冗余复杂度，而是为了解决 done 早于流真正退出、下一轮启动和旧 run 收尾重叠的问题。任何重构都必须先保留这些语义，再逐步收敛。

相关测试：

- `tests/codex-agent-done-reason.test.mjs`
- `tests/codex-runtime-state.test.mjs`
- `tests/codex-session-lifecycle.test.mjs`
- `tests/codex-session-run-ownership.test.cjs`

### 2.5 Renderer 已有 runtime state 基础

项目不是从零开始：

- Claude 已有 `packages/agent/src/components/claudeCode/utils/claudeRuntimeState.mjs`
- CodeX 已有 `packages/agent/src/components/codeX/utils/sessionLifecycle.mjs`
- CodeX `codexRuntimeState.mjs` 已经 re-export session lifecycle

这些文件已经把 `thinking`、`DONE`、`FAILED`、`TERMINAL_SEEN`、`ABORT_REQUESTED` 等状态抽出了一部分。下一步不应新造一套平行状态机，而应把这些现有状态机作为迁移基础。

### 2.6 CodeHub 已有 Agent Registry 雏形

当前已有：

- `packages/agent/src/registry/agentRegistry.js`
- `packages/agent/src/registry/agentRegistryComponents.js`
- `packages/agent/src/components/codeHub/index.vue`

`agentRegistry.js` 已经定义 ClaudeCode / CodeX 的 `key`、名称、图标、描述和基础 capabilities。CodeHub 也已经通过 `useAgentRegistry()` 渲染 agent picker 和统一 tab。

但当前 registry 仍偏 UI 元数据，缺少 runtime / transport / command schema / event schema 能力声明。CodeHub 的 tab 收集也仍依赖每个 panel 暴露 `projectTabData`，并通过 panel refs 调用 `switchProject` 等方法。这可以继续使用，但后续新增 Agent 或远程 Agent 时，需要把 registry 从“选择 UI 数据”升级为“Agent 接入契约”。

### 2.7 远程交互的真实含义

远程交互不是简单把 Electron IPC 换成 HTTP。真正需要抽象的是：

- command：用户动作如何发给 Agent Runtime
- event：Agent Runtime 如何流式回传状态和消息
- identity：`chatKey` / `runId` / `providerSessionId` 如何稳定关联
- permission：工具审批、文件写入、命令执行如何跨网络确认
- persistence：客户端关闭后，远程 run 是否继续、如何恢复

因此第一阶段不做远程 Runtime，但必须避免把 Electron 专属概念写进领域事件 schema。

## 3. 核心问题

### 3.1 缺少 MindCraft 领域事件层

当前 IPC 事件表达的是 provider 怎么说，而不是 MindCraft 运行时发生了什么。

目标应该是新增稳定事件：

```js
{
  domain: 'agent.turn.terminal',
  agent: 'codex',
  provider: 'codex',
  chatKey: 'session-chat-1-...',
  cliSessionId: '...',
  runId: '...',
  terminal: {
    kind: 'completed',
    hasAssistantOutput: true,
    reason: 'completed',
  },
  turn: {
    inputTokens: 5200,
    outputTokens: 1800,
    cacheReadTokens: 28800,
    cacheCreationTokens: 0,
    durationMs: 12300,
  },
}
```

Renderer 可以继续处理旧 `*-agent-message`，但通知、metrics、状态机应逐步迁到领域事件。

### 3.2 `reason` 字段语义过载

`reason` 当前同时被用来表达：

- provider 是否正常完成
- 本地进程是否失败
- 用户是否 abort
- session 文件是否存在 dangling tool
- 通知是否应该播放

这些不是同一个维度。应拆成：

| 字段 | 含义 |
|------|------|
| `terminal.kind` | `completed` / `failed` / `aborted` / `interrupted` |
| `terminal.hasAssistantOutput` | 本轮是否产生用户可感知输出 |
| `lifecycle.streamClosed` | 主进程流是否真正退出 |
| `binding.cliSessionId` | provider 会话身份 |
| `notification.soundEligible` | 是否具备播放声音资格 |

### 3.3 Renderer composable 职责过宽

`useClaudeAgentStream.js` 和 `useCodexAgentStream.js` 当前同时做：

- provider event parsing
- message append / tool card update
- runtime state
- per-turn token attach
- notification trigger
- scroll
- history save

短期不需要一次性拆完，但新逻辑不应继续塞进这两个文件。优先把“纯判断逻辑”抽到可测试 utils，再迁移 IPC 消费端。

### 3.4 Main 大文件不能机械拆

`claudeAgent.js` / `codexAgent.js` 都很大，但直接按文件行数拆分风险高。里面有很多历史 bug 的防护逻辑，尤其是 CodeX 的 run ownership 和 done window。第一阶段应该先抽纯函数和事件构造器，不移动复杂闭包状态。

### 3.5 缺少 Agent Client / Transport 边界

当前 Renderer 直接调用：

```js
window.electronAPI.claudeAgentQuery(...)
window.electronAPI.onClaudeAgentMessage(...)
window.electronAPI.onCodexAgentDone(...)
```

这使 UI 与 Electron IPC、Claude/CodeX 通道名、provider 差异强绑定。未来如果接远程 Agent，会面临两种坏选择：

- 在 UI 里继续加 `if remote then websocket else ipc`
- 或者把远程 Agent 硬塞进 Electron Main，导致 Main 同时管理本地和远程协议

正确方向是引入逻辑访问层：

```text
Renderer UI
  -> Agent Client
  -> Transport Adapter
  -> Agent Runtime
```

第一阶段 Agent Client 可以很薄，只包装现有 IPC。

## 4. 目标架构

### 4.1 分层

```text
Renderer UI
  MessageList / StatusBar / ProjectTabs / Notification

Renderer Agent Client
  sendCommand()
  onEvent()
  abortRun()
  listSessions()

Renderer transport adapters
  IpcAgentTransport        当前实现
  WebSocketAgentTransport  未来远程
  MockAgentTransport       测试

Renderer runtime adapters
  agentDomainEventConsumer
  claudeLegacyMessageAdapter
  codexLegacyMessageAdapter

IPC protocol
  agent:event                新领域事件通道
  claude-agent-message       旧通道，兼容期保留
  codex-agent-message        旧通道，兼容期保留

Main runtime services
  AgentRuntimeRouter        按 agentId 分发命令
  ClaudeRuntimeAdapter       provider event -> domain event
  CodexRuntimeAdapter        provider event -> domain event
  MetricsService             token/context/cost normalization
  SessionBindingService      chatKey <-> cliSessionId/filePath

Provider adapters
  Claude SDK
  CodeX CLI / SDK JSONL
```

未来远程形态：

```text
Renderer UI
  -> Agent Client
  -> WebSocketAgentTransport
  -> Remote Agent Runtime
  -> Provider adapters
```

UI 层不应知道底层 transport 是 IPC 还是 WebSocket。

### 4.2 事件通道策略

新增通道，不删除旧通道：

```js
safeSend(sender, 'agent:event', {
  version: 1,
  eventId: 'evt_...',
  timestamp: '2026-06-24T12:00:00.000Z',
  agent: 'claudeCode',
  provider: 'claude',
  domain: 'agent.turn.terminal',
  chatKey,
  runId,
  cliSessionId,
  filePath,
  transport: 'ipc',
  terminal: {
    kind: 'completed',
    hasAssistantOutput: true,
  },
  turn: {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    durationMs,
  },
})
```

兼容期内：

- UI message 渲染继续走旧 message 通道。
- `onAgentDone` 继续负责绑定和解锁。
- 新通知/metrics 可以优先消费 `agent:event`。
- 待测试稳定后，再迁移 runtime state 和 message normalization。

事件 schema 约束：

- 必须可 JSON 序列化。
- 不包含 Electron 对象，例如 `event.sender`、`webContents`。
- 不包含 Vue reactive proxy。
- 不依赖本地绝对路径作为唯一身份，绝对路径只能作为 payload 字段。
- 必须包含 `version`、`eventId`、`timestamp`、`agent`、`domain`、`chatKey`。
- 可选包含 `runId`、`turnId`、`providerSessionId`、`filePath`。
- `agent` 使用 Agent Registry key，例如 `claudeCode` / `codex`；provider 身份单独放 `provider` 或 `runtime.provider`，不要把二者混用。

### 4.3 推荐事件类型

| domain | 语义 | 第一批消费者 |
|--------|------|--------------|
| `agent.turn.started` | 本轮开始，已进入运行态 | runtime state / metrics timer |
| `agent.stream.activity` | 有 assistant/tool/reasoning 活动 | runtime state |
| `agent.turn.terminal` | provider 本轮终止边界已出现 | notification / per-turn token |
| `agent.run.done` | 主进程完成收尾，可解锁下一轮 | session binding / queued input |
| `agent.metrics.updated` | token/context/cost 更新 | StatusBar |
| `agent.binding.updated` | chatKey 与 cliSessionId/filePath 绑定更新 | session registry / renderer tab |
| `agent.error` | 用户可见错误或 silent failure 诊断 | toast / message |

注意：`turn.terminal` 和 `run.done` 必须分开。CodeX 已经证明 terminal event 之后仍可能有 drain window 和旧 run 收尾。

### 4.4 Agent Registry 目标结构

当前 registry 可渐进扩展为：

```js
{
  key: 'codex',
  name: 'GPT Codex',
  kind: 'coding-agent',
  runtime: {
    location: 'local',
    provider: 'codex',
    defaultTransport: 'ipc',
  },
  component: {
    panel: 'codeX',
    settings: 'codexSettings',
  },
  capabilities: {
    projectWorkspace: true,
    tools: true,
    fileRead: true,
    fileWrite: true,
    shell: true,
    images: true,
    webSearch: true,
    approvals: false,
    remote: false,
    resumable: true,
    longRunning: false,
  },
  protocol: {
    commandVersion: 1,
    eventVersion: 1,
    domains: [
      'agent.turn.started',
      'agent.stream.activity',
      'agent.turn.terminal',
      'agent.run.done',
      'agent.metrics.updated',
      'agent.binding.updated',
      'agent.error',
    ],
  },
}
```

未来远程 Agent 示例：

```js
{
  key: 'remoteCodingAgent',
  name: 'Remote Agent',
  kind: 'coding-agent',
  runtime: {
    location: 'remote',
    defaultTransport: 'websocket',
    endpointConfigKey: 'remoteAgentEndpoint',
  },
  capabilities: {
    projectWorkspace: true,
    tools: true,
    fileRead: true,
    fileWrite: false,
    shell: false,
    approvals: true,
    remote: true,
    resumable: true,
    longRunning: true,
  },
  protocol: {
    commandVersion: 1,
    eventVersion: 1,
  },
}
```

第一阶段只扩展数据结构，不要求接入远程 Agent。

### 4.5 Agent Command 协议

事件是 Runtime -> UI；command 是 UI -> Runtime。为了未来远程兼容，command 也需要稳定 envelope。

建议基础格式：

```js
{
  version: 1,
  commandId: 'cmd_...',
  timestamp: '2026-06-24T12:00:00.000Z',
  agent: 'codex',
  command: 'agent.run.start',
  chatKey: 'session-chat-...',
  runId: 'run_...',
  payload: {
    prompt: '...',
    cwd: 'D:/repo',
    images: [],
    model: '...',
    reasoningEffort: 'medium',
    sessionInstruction: null,
  },
}
```

推荐 command：

| command | 语义 |
|---------|------|
| `agent.run.start` | 启动一轮 Agent run |
| `agent.run.abort` | 中断 run |
| `agent.permission.resolve` | 回复工具/计划/提问审批 |
| `agent.session.list` | 列出会话 |
| `agent.session.resume` | 恢复会话 |
| `agent.session.rename` | 重命名会话 |
| `agent.session.delete` | 删除会话 |
| `agent.metrics.query` | 查询历史 metrics |

当前可以只实现 `agent.run.start` / `agent.run.abort` 的 IPC 包装，其他 command 先文档化。

### 4.6 Transport 接口

Renderer 侧建议定义最小接口：

```js
export function createAgentClient(transport) {
  return {
    sendCommand(command) {
      return transport.send(command)
    },
    onEvent(callback) {
      return transport.onEvent(callback)
    },
    abortRun({ agent, chatKey, runId }) {
      return transport.send({
        version: 1,
        command: 'agent.run.abort',
        agent,
        chatKey,
        runId,
      })
    },
  }
}
```

IPC transport 第一版可以内部仍调用旧 API：

```js
// command: agent.run.start + agent=claudeCode
window.electronAPI.claudeAgentQuery(legacyPayload)

// command: agent.run.start + agent=codex
window.electronAPI.codexAgentQuery(legacyPayload)

// events
window.electronAPI.onAgentEvent(callback)
```

兼容期可以同时监听旧事件，把旧事件转换成领域事件给 Agent Client 消费。

## 5. 执行路线

### Phase 0：补充架构基线与测试

目标：在不改行为的前提下，把现有语义固定下来。

任务：

- 为 Claude 双 done 场景补测试：result done + finally done 不应重复触发通知资格。
- 为 CodeX terminal message 补测试：`task_complete` 只进入 `TERMINAL_SEEN`，不解除 `_awaitingDone`。
- 补 `agent turn notification eligibility` 纯函数测试。
- 补 Agent Registry schema 测试：现有 `claudeCode` / `codex` 必须包含 runtime、capabilities、protocol。
- 在 `docs/agent-architecture.md` 更新 done / terminal / notification 的术语边界。

验收：

- 现有测试通过。
- 新增测试能描述当前风险，不要求先引入新 IPC。

### Phase 1：新增协议构造器，不接 UI

目标：先形成可测试的 event / command schema 和构造函数。

建议文件：

```text
packages/agent/electron/agentDomainEvents.js
packages/agent/src/components/agentCommon/runtime/agentProtocol.mjs
packages/agent/src/components/agentCommon/runtime/agentClient.mjs
packages/agent/electron/agentDomainEvents.test.js 或 tests/agent-domain-events.test.*
```

任务：

- 定义 `buildAgentTurnTerminalEvent()`
- 定义 `buildAgentRunDoneEvent()`
- 定义 `buildAgentMetricsUpdatedEvent()`
- 定义 `buildAgentCommand()`
- 定义 `normalizeAgentEnvelope()`
- 明确字段命名：`chatKey` 优先，legacy `sessionId` 只做兼容别名
- 不改任何现有发送逻辑

验收：

- 纯函数测试覆盖 Claude result、Claude failed、CodeX turn.completed、CodeX aborted。
- envelope 测试确保事件不包含函数、Electron 对象、Vue proxy。

### Phase 1.5：扩展 Agent Registry 契约

目标：把现有 UI registry 扩展为多 Agent 接入契约，但不改 CodeHub 行为。

任务：

- 在 `AGENT_DEFINITIONS` 中新增 `kind`、`runtime`、`protocol`、更完整 capabilities。
- 保持 `key`、`name`、`iconClass`、`descriptionKey` 兼容现有 UI。
- 增加 `validateAgentDefinition()` 纯函数和测试。
- 文档化 capability 含义，避免后续 Agent 自由发挥。

建议文件：

```text
packages/agent/src/registry/agentRegistry.js
tests/agent-registry-contract.test.mjs
```

验收：

- CodeHub UI 不变化。
- registry 测试能阻止缺少 runtime/protocol 的新 Agent 定义。

### Phase 2：Main 双发新领域事件，旧通道保留

目标：Main 侧在关键节点发送 `agent:event`，但 Renderer 暂不依赖它。

任务：

- Preload 增加 `onAgentEvent(callback)`。
- Preload 可选增加 `agentSendCommand(command)`，内部先路由到旧 IPC。
- Claude `result` 分支发送 `agent.turn.terminal`。
- Claude finally 分支发送 `agent.run.done`。
- CodeX `turn.completed/task_complete` 分支发送 `agent.turn.terminal`。
- CodeX `triggerDone/finally` 发送 `agent.run.done`。
- `agent.metrics.updated` 可先只包一层现有 metrics payload。

风险控制：

- 所有新事件都 fire-and-forget，不影响旧通道。
- 不把通知迁过来。
- 不删除任何 `claude-agent-*` / `codex-agent-*` 通道。

验收：

- 开发日志中可看到新事件顺序。
- Claude / CodeX 主路径行为不变。
- CodeX run ownership 测试通过。

PR2 特别注意：

- `agent` 字段必须使用 registry key：Claude 是 `claudeCode`，CodeX 是 `codex`。
- 如需表达底层 provider，可新增 `provider: 'claude' | 'codex'`，不要把 `agent` 写成 `claude`。
- Claude 在 PR2 仍可能没有稳定 `runId`，但 `agent.turn.terminal` 应尽量携带可稳定去重的 `cliSessionId`；后续再补 turn/run id。
- `agent:event` 只能额外发送，不允许替代旧 done/message 通道。

### Phase 2.5：Renderer 引入 Agent Client，但只包旧 API

目标：让 UI 代码开始依赖 Agent Client 入口，而不是散落的 `window.electronAPI.*`。

任务：

- 新增 `createIpcAgentTransport(window.electronAPI)`。
- 新增 `createAgentClient(transport)`。
- 先在测试或小范围逻辑中使用，不立即改 ClaudeCode/CodeX 大面板。
- 明确 legacy adapter：旧 `claude-agent-message` / `codex-agent-message` 可以转换成领域事件，但只在兼容层存在。

验收：

- Agent Client 单元测试通过。
- 不改变现有 UI 行为。

### Phase 3：通知迁移到领域事件

目标：解决通知音不稳定，同时验证领域事件的第一批实际价值。

任务：

- 新增共享前端通知闸门，例如 `agentCommon/utils/agentNotificationGate.mjs`。
- 通知音消费 `agent.turn.terminal`，并根据 `hasAssistantOutput` / `soundEligible` / 去重 key 判断。
- 高亮和任务栏闪烁暂时可以继续保留 `onAgentDone + shouldNotifyOnTaskDone` 路径，或在确认稳定后迁到 `agent.run.done`。
- 从 `onAgentDone` 移除声音触发。
- 提升 `playDoneSound` 音量另做小改。

通知去重 key 建议：

```text
agent + chatKey + cliSessionId + runId/turnId + terminal.kind
```

没有 runId 的 Claude 可临时使用：

```text
agent + chatKey + cliSessionId + resultMessageUuid/session result timestamp
```

验收：

- 正常完成播放一次。
- Claude 双 done 不重复播放。
- CodeX terminal 后 finally 不重复播放。
- abort / failed 不播放，除非明确 `hasAssistantOutput=true` 且产品决定失败也提示。

### Phase 4：metrics / per-turn token 迁移

目标：让 token 口径集中在 Main 侧，Renderer 只展示。

任务：

- `agent.metrics.updated` 使用统一字段：`inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheCreationTokens` / `contextUsage` / `contextWindow` / `costUsd`。
- `agent.turn.terminal.turn` 作为 per-turn token 权威来源。
- Renderer 从领域事件把 `_turnTokens` 附到最后一个 assistant message。
- 删除或冻结 Renderer 内重复 token normalization，新逻辑只读统一字段。

依赖：

- 参考 `docs/plan/2026-06-24-token-metrics-research.md`。

验收：

- Claude / CodeX StatusBar 字段一致。
- per-turn token 显示口径一致。
- token 相关测试通过。

### Phase 5：Runtime state 迁移

目标：把 `markClaude*` / `markCodex*` 消费点逐步迁到领域事件。

任务：

- 引入 `agentRuntimeReducer`，封装共同状态转换。
- Claude / CodeX 保留各自差异字段，但共享 terminal/run done 语义。
- `onAgentDone` 收窄为 legacy adapter，最终只负责兼容旧通道。

验收：

- `thinking`、`_awaitingDone`、`TERMINAL_SEEN`、`DONE` 测试覆盖不退化。
- late metrics 不会 revive thinking。
- CodeX queued input flush 不回归。

### Phase 5.5：CodeHub 消费 Registry 能力

目标：让 CodeHub 从 registry capability 获取 Agent 行为差异，而不是新增硬编码。

任务：

- Agent picker 展示 capability，例如 remote/local、是否支持图片、是否需要项目目录。
- unified tab 保持现状，但 tab meta 从 registry 取 `runtime.location` / `capabilities`。
- `codehubSwitchToAgent` 保持兼容现有 `agentKey`。
- 不在本阶段接远程 Agent。

验收：

- ClaudeCode / CodeX 入口不退化。
- 新增一个 mock Agent definition 时，registry 测试可通过，CodeHub 不崩。

### Phase 6：物理拆分 Main 大文件

目标：在语义已经稳定后再移动代码。

建议顺序：

1. 抽 `agentDomainEvents.js`、`agentRuntimeDone.js` 等纯函数。
2. 抽 metrics service。
3. 抽 provider config service。
4. 抽 session scan / registry integration。
5. 最后拆 stream loop。

原则：

- 每次只移动一个职责。
- 不在移动代码时改变行为。
- 每次移动后跑相关测试。
- CodeX stream loop 的 `runId/doneSent/streamClosed` 闭包状态在没有完整测试前不要拆散。

### Phase 7：远程 Runtime 预研与最小 POC

目标：验证 transport-agnostic 协议是否可承载远程 Agent，不进入主线产品。

范围：

- 新增 `MockWebSocketAgentTransport` 或本地 fake server。
- 只支持 `agent.run.start`、`agent.stream.activity`、`agent.turn.terminal`、`agent.run.done`。
- 不支持文件写入、shell、真实 provider key。

验收：

- 同一 Agent Client 可以接 IPC mock 和 WebSocket mock。
- UI 不需要知道 transport 类型。
- 明确远程安全边界和未解决问题。

## 6. 通知音小修的独立方案

通知音不应等待完整重构，但应等本方案确认后再做，避免继续补错位置。

独立小修范围：

- 新增前端通知去重闸门。
- Claude 在 `result` 或新 `agent.turn.terminal` 上触发声音。
- CodeX 在 `turn.completed/task_complete` 或新 `agent.turn.terminal` 上触发声音。
- `onAgentDone` 不再播放声音，只保留高亮和收尾。
- `playDoneSound` 音量从 `0.21` 调整到较清晰但不刺耳的值。

不在小修范围：

- 不拆 Main 大文件。
- 不迁移 metrics。
- 不删除旧 IPC。
- 不改高亮策略，除非发现现有逻辑有明确 bug。

## 7. 风险与约束

### 7.1 最大风险：破坏会话生命周期保护

必须遵守 `docs/session-pitfalls.md`：

- `onAgentDone` 不保证触发。
- `scan` 和 `done` 并发不可假设顺序。
- done 信号不等于流真正退出。
- `resetAgentRuntime` 影响所有窗口。

### 7.2 不要把领域事件变成另一套原始事件

领域事件必须表达稳定语义，而不是把 provider payload 包一层继续转发。允许附带 `rawType` 用于诊断，但 UI 不应依赖 `rawType`。

### 7.3 `hasAssistantOutput` 不能拍脑袋

第一版可以保守：

- Claude `result` 且本轮有 assistant 文本 / tool_use / tool_result 之一，才认为有输出。
- CodeX `turn.completed` 且本轮出现 `agent_message` / file_change / tool item / reasoning 之一，才认为有输出。

如果短期难以可靠判断，通知小修可以先按 terminal completed 触发，但必须有去重，并在文档中标注“completed 不严格等于有用户可见输出”。

### 7.4 文档与测试必须同步

新事件 schema 应更新到：

- `docs/agent-architecture.md`
- 本计划文件
- 对应测试文件

### 7.5 远程 Runtime 的安全边界不能提前模糊

远程 Agent 涉及：

- provider key 托管
- 项目文件访问
- shell 执行
- 企业审计日志
- 多端恢复
- 网络断线重连

第一阶段只做协议兼容，不做真实远程执行。任何远程 POC 默认禁止 `fileWrite` 和 `shell`，除非有明确权限模型。

### 7.6 不要为了远程牺牲本地体验

本地 ClaudeCode / CodeX 是当前核心路径。Agent Client / Transport 抽象必须薄，不能让本地调用绕过多层异步包装导致调试困难。原则是先适配现有 IPC，再逐步替换调用点。

## 8. 建议优先级

推荐执行顺序：

1. 评审本方案，确认 `turn.terminal` 与 `run.done` 分离。
2. 做 Phase 0/1：测试、协议构造器、Agent Registry 契约。
3. 做通知音小修，使用事件闸门和去重。
4. 做 Phase 2：Main 双发 `agent:event`。
5. 引入 Agent Client / IPC Transport 包装，但先小范围使用。
6. 迁移 metrics/per-turn token。
7. 迁移 runtime state。
8. 最后拆 Main / Renderer 大文件。
9. 远程 Runtime 只做 POC，不进入核心路径。

不建议：

- 不建议先大拆文件再修通知。
- 不建议把提示音修复和 Main 事件协议重构混在一个提交。
- 不建议立刻删除旧 IPC 通道。
- 不建议让 Renderer 新增更多 provider 原始事件判断。
- 不建议现在接 Tauri 或新增真实远程 Runtime。
- 不建议把 WebSocket 判断写进 ClaudeCode/CodeX 面板组件。

## 9. 评审关注点

请重点评审：

- `agent.turn.terminal` 和 `agent.run.done` 的拆分是否符合 Claude / CodeX 实际生命周期。
- `reason` 拆字段是否足够覆盖 completed / failed / aborted / interrupted / dangling tool。
- 通知音小修是否应该先基于旧事件实现，还是等 `agent:event` 双发后实现。
- `hasAssistantOutput` 第一版是否需要严格判断，还是先用 completed terminal 加去重。
- Phase 6 物理拆文件的顺序是否保守。
- Agent Registry 是否应在 Phase 1.5 扩展为接入契约。
- Agent Client / Transport 抽象是否足够薄，是否会影响本地调试。
- 远程 Runtime POC 是否应等本地领域事件稳定后再开始。

## 10. 给实施者的交付切片

后续开发不要按“完成整套架构”开一个大 PR。建议拆成以下独立提交/PR，每个都可测试、可回滚。

### PR 1：协议纯函数与 registry 契约

目标：只加可测试的 schema / builder / validator，不接入运行时。

改动范围：

- `packages/agent/src/components/agentCommon/runtime/agentProtocol.mjs`
- `packages/agent/src/components/agentCommon/runtime/agentClient.mjs`（只放接口和 mock，不接真实 IPC）
- `packages/agent/src/registry/agentRegistry.js`
- `tests/agent-protocol.test.mjs`
- `tests/agent-registry-contract.test.mjs`

必须包含：

- `buildAgentEvent()`
- `buildAgentCommand()`
- `validateAgentEventEnvelope()`
- `validateAgentCommandEnvelope()`
- `validateAgentDefinition()`
- ClaudeCode / CodeX registry 新字段补齐

不得包含：

- 不修改 `claudeAgent.js`
- 不修改 `codexAgent.js`
- 不改 UI 行为
- 不改通知音

建议测试：

```powershell
node --test tests/agent-protocol.test.mjs
node --test tests/agent-registry-contract.test.mjs
```

### PR 2：Main 双发 `agent:event`

目标：在 Main 关键节点额外发送新事件，但旧通道仍是权威路径。

改动范围：

- `packages/agent/preload/index.js`
- `packages/agent/electron/claudeAgent.js`
- `packages/agent/electron/codexAgent.js`
- `tests/claude-agent-done-payload.test.cjs`
- `tests/codex-agent-done-reason.test.mjs`
- 新增 `tests/agent-domain-events.test.*`

必须包含：

- `onAgentEvent(callback)` preload API
- Claude `result` -> `agent.turn.terminal`
- Claude finally -> `agent.run.done`
- CodeX `turn.completed/task_complete` -> `agent.turn.terminal`
- CodeX `triggerDone/finally` -> `agent.run.done`

不得包含：

- 不让 Renderer 依赖新事件
- 不删除旧 `claude-agent-*` / `codex-agent-*`
- 不改变 queued input flush 逻辑

建议测试：

```powershell
node --test tests/claude-agent-done-payload.test.cjs
node --test tests/codex-agent-done-reason.test.mjs
node --test tests/codex-session-run-ownership.test.cjs
```

### PR 3：通知音小修

目标：解决用户可感知的提示音不稳定，但只触碰通知逻辑。

改动范围：

- `packages/agent/src/components/agentCommon/utils/agentNotificationGate.mjs`
- `packages/agent/src/components/agentCommon/utils/playDoneSound.js`
- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js`
- `packages/agent/src/components/codeX/composables/useCodexAgentStream.js`
- `tests/agent-notification-gate.test.mjs`
- `tests/codex-agent-done-reason.test.mjs`

必须包含：

- 通知去重 key
- `onAgentDone` 不再播放声音
- abort / failed 默认不播放
- Claude 双 done 不重复播放
- CodeX terminal + finally 不重复播放

不得包含：

- 不改高亮策略，除非测试证明有 bug
- 不迁移 metrics
- 不拆 Main 大文件

建议测试：

```powershell
node --test tests/agent-notification-gate.test.mjs
node --test tests/codex-agent-done-reason.test.mjs
```

手动验证：

- Claude 正常完成播放一次
- CodeX 正常完成播放一次
- 主动 abort 不播放
- 后台 tab 完成仍有视觉高亮
- 窗口失焦时声音仍可听见

### PR 4：Agent Client / IPC Transport 包装

目标：建立 UI 访问层，但不大规模替换 ClaudeCode / CodeX 面板。

改动范围：

- `packages/agent/src/components/agentCommon/runtime/createAgentClient.mjs`
- `packages/agent/src/components/agentCommon/runtime/ipcAgentTransport.mjs`
- `tests/agent-client.test.mjs`

必须包含：

- `sendCommand(command)`
- `onEvent(callback)`
- `abortRun({ agent, chatKey, runId })`
- IPC transport 内部路由到旧 API 或新 `agentSendCommand`

不得包含：

- 不在面板里写 WebSocket 判断
- 不接真实远程
- 不改 CodeHub tab 行为

### PR 5：metrics / per-turn token 迁移

目标：让 token 展示逐步消费统一事件字段。

依赖：

- PR 2 的 `agent.metrics.updated`
- `docs/plan/2026-06-24-token-metrics-research.md`

必须保护：

- Claude 最终 `result.usage` 仍是权威值
- CodeX `token_count` / `_perTurnTokens` 口径不回归
- StatusBar 切 tab 不闪烁或至少不恶化

建议测试：

```powershell
node --test tests/claude-context-usage.test.cjs
node --test tests/codex-turn-tokens.test.cjs
node --test tests/codex-git-metrics.test.cjs
```

### PR 6：Runtime state reducer 迁移

目标：把已有 `markClaude*` / `markCodex*` 逐步统一到领域事件 reducer。

必须保护：

- late metrics 不 revive thinking
- CodeX `TERMINAL_SEEN` 仍保持 `_awaitingDone=true`
- abort requested 不被后续 stream activity 覆盖
- 崩溃恢复不因状态字段改变而退化

建议测试：

```powershell
node --test tests/claude-runtime-state.test.mjs
node --test tests/codex-runtime-state.test.mjs
node --test tests/codex-session-lifecycle.test.mjs
node --test tests/task-done-history-persistence.test.mjs
```

### PR 7：Main 物理拆分

目标：在语义和测试稳定后拆文件。

拆分顺序：

1. 纯函数和 builder
2. metrics service
3. provider config service
4. session scan / registry integration
5. stream loop

规则：

- 每次只移动一个职责
- 移动前后测试结果一致
- 不在同一个 PR 中同时“移动代码”和“改变行为”
- CodeX stream loop 的闭包状态最后拆

## 11. 非目标

本轮架构重构明确不做：

- 不切换 Tauri
- 不新增真实远程 Runtime
- 不做 WebSocket 生产链路
- 不引入独立本地 daemon
- 不删除旧 IPC 通道
- 不重写 ClaudeCode / CodeX 面板 UI
- 不把 Agent Registry 做成完整插件市场
- 不把远程 shell / 文件写入权限提前开放
