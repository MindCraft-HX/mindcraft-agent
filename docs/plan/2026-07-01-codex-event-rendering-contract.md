# CodeX 事件渲染契约收口方案

> 日期：2026-07-01
> 范围：CodeX live stream、JSONL history restore、tool card 渲染、assistant/progress 文本归类
> 目标：修复 CodeX tool call 偶发不渲染、assistant 空泡泡、`<thinking>tool call</thinking>` 原始标签泄漏，并把 live/history 事件语义收口到同一套契约。

## 1. 背景

当前 CodeX 对话中出现两类用户可见问题：

- tool call 有时不渲染，尤其是运行中实时 UI 看不到，历史恢复后又可能出现。
- assistant 有时出现空内容泡泡，或把 `<thinking>tool call</thinking>` 这类内部进度文本当普通回复显示。

这些问题只在 CodeX 侧观察到。ClaudeCode 不在本专题范围内。

## 2. 当前判断

这不是单纯的 Vue 渲染问题，而是 CodeX 事件语义在三处实现不一致：

| 层 | 文件 | 当前职责 |
|----|------|----------|
| 主进程 live 转发 | `packages/agent/electron/codexAgent.js` | 读取 SDK/CLI 事件，转发 `codex-agent-message` |
| 前端 live 消费 | `packages/agent/src/components/codeX/composables/useCodexAgentStream.js` | 将 live item 转成 UI message |
| 历史恢复 | `packages/agent/electron/codexAgent.js::readSessionFileRange()` | 从 JSONL 重新构造 UI message |

三套逻辑没有完全等价，导致同一类事件在实时流和历史恢复里表现不同。

## 3. 已定位的高风险点

### 3.1 `custom_tool_call` live/history 行为不一致

历史恢复支持普通 `custom_tool_call`：

- `packages/agent/electron/codexAgent.js` 中 `tryFlushCall()` 对 `custom_tool_call && !apply_patch` 会生成 `role: 'tool'`。

live 消费只特判了 `apply_patch`：

- `packages/agent/src/components/codeX/composables/useCodexAgentStream.js`
- `item.type === 'custom_tool_call' && item.name === 'apply_patch'`
- `ITEM_TOOL_HANDLERS` 没有普通 `custom_tool_call` handler。

结果：

- 实时运行时，普通 `custom_tool_call` 可能落到 `unhandled item type`，不渲染。
- 刷新或历史加载时，同一事件又可能被还原成 tool card。

### 3.2 `agent_message` 会覆盖已有 assistant 文本为空

live 消费当前逻辑是覆盖：

```js
aMsg.text = item.message || item.text || ''
```

风险：

- 如果先收到有内容的 `agent_message`，后续又收到空 `agent_message`，已有 assistant 文本会被冲成空字符串。
- `AssistantMessageBubble.vue` 没有空文本保护，会渲染空 assistant 泡泡。

### 3.3 中间进度文本和最终回复混用

CodeX 运行中需要显示 process，这一点保留。问题在于当前缺少明确分类：

- 中间进度文本应该可见，但应作为 progress/thinking/activity，而不是最终 assistant 正文。
- `tool call` 应该进入 tool card。
- 最终回复正文才进入 assistant bubble。
- 空文本事件只允许更新状态，不允许创建或覆盖 assistant bubble。

截图中的 `<thinking>tool call</thinking>` 表明某些内部进度或 reasoning 标记被归入了 assistant 文本。

## 4. 目标事件契约

建议在主进程或共享 helper 中归一化为下面的 UI 事件语义。前端不应直接猜 SDK 原始事件含义。

| UI 语义 | 用途 | 渲染 |
|---------|------|------|
| `assistant_final` | 最终可见回复正文 | assistant bubble |
| `assistant_delta` | 同一最终回复的增量文本 | append 到当前 assistant bubble |
| `progress_text` | 任务中间进度、CLI process 文本 | progress/thinking 轻量行或折叠卡片 |
| `reasoning` | 模型思考摘要或 reasoning item | thinking tool card |
| `tool_call` | `function_call` / `custom_tool_call` / MCP / shell / apply_patch | tool card |
| `tool_result` | tool 输出或 patch apply result | 更新对应 tool card |
| `turn_terminal` | turn completed/failed/aborted | 关闭 running 状态、挂 tokens |

短期不一定要一次性新增完整 channel，但 live/history 必须共享同一套 mapping 规则。

## 5. 行为规则

1. 中间进度文本要可见。
   - 不隐藏 process。
   - 不进入最终 assistant bubble。
   - 可用 `thinking` tool card 或新的 progress message 表达。

2. `agent_message` 不得无条件覆盖 assistant 文本。
   - 有文本时 append 或按 id 合并。
   - 空文本事件不能创建 assistant bubble。
   - 空文本事件不能覆盖已有非空 assistant 文本。

3. `custom_tool_call` live/history 必须一致。
   - `apply_patch` 保留现有专门预览逻辑。
   - 非 `apply_patch` 的 `custom_tool_call` 也要生成 generic tool card。
   - `custom_tool_call_output` 更新同一个 tool card。

4. `function_call` / `custom_tool_call` / `mcp_tool_call` 统一工具身份。
   - 统一字段：`toolUseId`、`toolName`、`rawType`、`status`、`text`、`toolResultContent`、`filePath`。
   - 不同来源只影响 preview 细节，不影响是否显示。

5. final assistant 和 progress assistant 分离。
   - 最终 assistant 正文用于用户可读回答。
   - progress 文本用于过程展示。
   - `<thinking>...</thinking>` 这类包装应被识别为 progress/reasoning，不应原样显示在 assistant final bubble。

## 6. 建议实施阶段

### Phase 0：Characterization tests

先补测试锁定现状和目标行为，避免继续凭截图修。

建议新增或扩展：

- `tests/codex-stream-rendering-contract.test.mjs`
- `tests/codex-history-rendering-contract.test.cjs` 或扩展现有 Codex history 测试

覆盖场景：

- live `custom_tool_call` 非 `apply_patch` 生成 tool message。
- live `custom_tool_call_output` 更新同一 tool message。
- history 同样事件生成相同 tool message。
- 空 `agent_message` 不创建 assistant bubble。
- 空 `agent_message` 不覆盖已有非空 assistant text。
- `<thinking>tool call</thinking>` 不进入 final assistant bubble。
- `agent_message` 中真实中间进度文本仍可见为 progress/thinking。

### Phase 1：抽共享 mapper

新增共享纯函数，供 live/history 同时调用。建议位置：

```text
packages/agent/src/components/codeX/utils/codexUiEventMapper.mjs
```

或如果主进程 CJS 也要直接复用，则采用现有双入口模式：

```text
packages/agent/src/components/codeX/utils/codexUiEventMapper.mjs
packages/agent/src/components/codeX/utils/codexUiEventMapper.cjs
```

输入可以是归一化后的 item/row，输出 UI message patch：

```js
{
  kind: 'tool' | 'assistant' | 'progress' | 'terminal' | 'ignore',
  message,
  mergeKey,
  mode: 'append' | 'upsert' | 'status-only'
}
```

避免在 Vue composable 和 JSONL history parser 里继续复制 tool 判断。

### Phase 2：修 live 消费

修改 `useCodexAgentStream.js`：

- 普通 `custom_tool_call` 走 generic tool card。
- `custom_tool_call_output` 能更新结果。
- `agent_message` 改为非空 append/merge。
- 空 assistant 文本不创建 message。
- progress 文本单独进入 progress/thinking。

### Phase 3：修 history restore

修改 `codexAgent.js::readSessionFileRange()`：

- 使用和 live 相同的 mapper。
- 保证 live 中能看到的 tool/progress，刷新历史后仍一致。
- 保留 tail-read 防 phantom tool 的保护，但不要吞掉完整的 call/output 成对事件。

### Phase 4：诊断与清理

- 对 unknown item type 打结构化 debug 日志，默认不污染 UI。
- 删除重复 mapping 分支或收窄到 adapter。
- 更新 `docs/session-pitfalls.md` 或本专题的复盘段落。

## 7. 验收标准

自动测试：

- 新增契约测试覆盖 live/history 的 `custom_tool_call`、`agent_message` 空覆盖、thinking 标签归类。
- `npm test` 通过。
- 如有 contract test 脚本，`npm run test:contract` 通过。

人工验证：

- 运行 CodeX，让它执行非 patch 工具调用，实时 UI 能看到 tool card。
- 刷新或切换历史后，同一工具调用仍能看到，内容一致。
- 中间进度文本可见，但不污染最终 assistant bubble。
- 不再出现空 assistant 泡泡。
- 不再把 `<thinking>tool call</thinking>` 原样显示为 assistant 回复。

## 8. 风险与边界

- 不要把中间进度全部隐藏。用户明确需要看到 process。
- 不要把所有 `agent_message` 都当 final assistant；CodeX 里它可能承载中间进度。
- 不要为了修空泡泡删除 TokenMetaRow 容器逻辑；如果某轮只有工具调用，footer tokens 仍需要挂到最后一个可渲染消息。
- 不要触碰 ClaudeCode 流式逻辑，本专题仅限 CodeX。
- 不要顺手做 IPC channel 大统一；当前目标是 CodeX event rendering contract。

## 9. 给执行 Agent 的入口

优先阅读：

1. `packages/agent/src/components/codeX/composables/useCodexAgentStream.js`
2. `packages/agent/electron/codexAgent.js`
3. `packages/agent/src/components/codeX/components/messages/MessageItem.vue`
4. `packages/agent/src/components/codeX/components/messages/ToolMessageCard.vue`
5. `docs/codex-turn-failed-diagnostics.md`
6. `docs/session-pitfalls.md`

推荐先做 Phase 0 测试，再改实现。这个问题已经表现为 live/history 不一致，直接补 UI 分支容易继续回归。
