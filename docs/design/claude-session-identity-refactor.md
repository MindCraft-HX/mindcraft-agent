# Claude 会话身份模型收敛方案

> 创建：2026-06-17
> 状态：设计中
> 关联：T089 / T090 / T091 / T093

## 1. 背景

ClaudeCode 当前同时存在两类会话身份：

| 身份 | 当前字段 | 含义 | 生命周期 |
|------|----------|------|----------|
| UI/runtime 身份 | `chat.sessionId` | renderer 中的 chat 运行态 key，用于流式事件、abort、权限弹窗、主进程 runtime Map | chat 创建时立即存在 |
| CLI/disk 身份 | `chat.cliSessionId` | Claude SDK 真实 session UUID，对应 `~/.claude/projects/<project>/<uuid>.jsonl` | SDK 创建真实会话后才存在 |
| 磁盘文件身份 | `chat.filePath` | `.jsonl` 文件路径，可用于读历史、删除文件、推导同名 sidecar | 扫描或 `done` 后补齐 |

这两类身份并存有合理性：新建空 chat 尚未发送首条消息时，SDK 还没有创建真实 CLI session，因此 UI 必须先有一个本地 key 承载 tab、输入、消息和运行态事件。

问题在于当前字段和函数大量使用泛化的 `sessionId` 命名，导致调用者很难一眼判断它是 UI/runtime key，还是 CLI/disk UUID。T089 per-session model 上一次失败后暴露出一个更底层的问题：如果把会话级设置写入错误身份层，close-tab、scan、adopt、done 这些异步路径会互相覆盖或读不到。

## 2. 当前隐含状态机

当前代码已经隐含了两个状态，只是没有被明确建模：

| 状态 | 条件 | 允许行为 |
|------|------|----------|
| draft/unbound chat | 有 `sessionId`，无 `cliSessionId` / `filePath` | UI 展示、输入、发送首条消息、临时 draft 状态 |
| bound chat | 有 `cliSessionId`，通常也有 `filePath` | resume、读写 JSONL、删除磁盘文件、读取会话级 sidecar |

关键路径：

1. `createChat()` 创建 draft chat，只生成 UI/runtime key。
2. `claude-agent-query` 以 UI/runtime key 管理主进程 `agentSessions`。
3. SDK 首条流式消息或 `done` 返回 CLI session UUID。
4. renderer 将 `cliSessionId` / `filePath` 写回 chat。
5. 后台扫描可把磁盘 JSONL 领养到 pending chat。

## 3. 设计原则

### 3.1 命名原则

后续新增代码禁止使用裸 `sessionId` 表示不清晰的身份。

| 推荐命名 | 用途 |
|----------|------|
| `chatKey` | UI/runtime key；兼容当前 `chat.sessionId` |
| `cliSessionId` | Claude SDK session UUID；唯一 durable session identity |
| `sessionFilePath` | `.jsonl` 文件路径 |
| `bindingKey` | 去重/匹配用的 durable key，优先 `cliSessionId`，其次 `filePath` |

短期为了降低风险，不立即全量重命名 persisted 字段 `chat.sessionId`。可以先在局部变量、注释和新 helper 中使用 `chatKey`，并明确 `chat.sessionId` 是 legacy 字段名。

### 3.2 存储原则

| 数据 | 存储位置 | Key |
|------|----------|-----|
| UI tab 列表、draft chat、未绑定状态 | `claude-panel-state.json` | `chatKey` |
| SDK 会话历史 | `.jsonl` | `cliSessionId` |
| 会话级模型/effort 等 sidecar | `.meta.json` | `cliSessionId` |
| 主进程运行态 Query | `agentSessions` Map | `chatKey` |
| renderer chat 到 CLI session 映射 | `cliSessionIds` Map | `chatKey -> cliSessionId` |

红线：

- 磁盘侧 artifact 只能用 `cliSessionId` 或 `sessionFilePath` 定位。
- `.meta.json` 不能用 draft `chatKey` 命名。
- `close project/tab` 只影响 panel state，不删除 `.jsonl` / `.meta.json`。
- `delete chat` 才能删除 `.jsonl` / `.meta.json`。

## 4. T089 的前置影响

T089 原始方案想把模型写入同目录 `.meta.json`，方向正确，但必须先解决身份边界：

错误路径：

```text
createChat()
  -> 只有 chat.sessionId（UI/runtime key）
  -> 直接写 <sessionId>.meta.json
  -> scan 只认识 <cliSessionId>.jsonl
  -> reopen 时读不到 meta
```

正确路径：

```text
draft chat:
  -> model/effort 临时保存在 panel state 的 draft 字段

binding established:
  -> 拿到 cliSessionId/filePath
  -> 将 draft model/effort 迁移写入 <cliSessionId>.meta.json

bound chat:
  -> scan/read/query/delete 均以 cliSessionId/filePath 为准
```

因此 T089 应依赖本重构至少完成 Phase 1-2。

## 5. 分阶段重构

### Phase 0：模型文档与注释

目标：不改行为，只降低理解成本。

- 在 `claudeAgent.js` 的 runtime Map 附近补充身份模型注释。
- 在 `claudeCode/index.vue` 的 `createChat()` 附近补充 draft/bound 状态说明。
- 在 `pendingSessionBinding.mjs` 顶部补充 scan/adopt 绑定说明。
- 在 TODO 中注册前置型重构任务，明确 T089/T090/T091 依赖它。

### Phase 1：引入 identity helpers

目标：把散落判断集中成纯函数，不改变持久化字段。

建议新增：

```text
packages/agent/src/components/claudeCode/utils/claudeSessionIdentity.mjs
```

候选函数：

```javascript
export function getClaudeChatKey(chat) {}
export function isBoundClaudeChat(chat) {}
export function isDraftClaudeChat(chat) {}
export function getClaudeChatBindingKey(chat) {}
export function canUseClaudeSessionArtifacts(chat) {}
```

替换范围：

- `pendingSessionBinding.mjs`
- `historyPersistenceSanitizer.mjs`
- `index.vue` 中 scan/adopt/delete 相关判断

### Phase 2：局部变量和函数参数收敛

目标：把新代码和关键路径中的语义写进变量名。

- 主进程 runtime Map 注释改为 `chatKey -> ...`。
- IPC handler 内局部变量使用 `chatKey`，但 IPC payload 暂保持 `sessionId` 兼容旧调用。
- renderer 事件处理中的 `sid` 改为 `chatKey`。
- 新增磁盘侧函数一律使用 `cliSessionId` / `sessionFilePath` 参数名。

### Phase 3：收紧磁盘接口

目标：所有磁盘 artifact 操作只接受 durable identity。

- `deleteSessionFile` 删除 `.jsonl` 时同步删除同名 `.meta.json`。
- 新增 meta helper 时只接受 `cliSessionId` 或 `sessionFilePath`。
- 扫描返回结构明确 `id` 是 `cliSessionId`，必要时在 renderer map 阶段重命名。

### Phase 4：实施 T089

目标：在身份模型稳定后实现 per-session model。

- draft chat 使用 `_draftModel` / `_draftEffort`。
- bound chat 使用 `<cliSessionId>.meta.json`。
- query 优先级：draft override -> bound meta -> global default。
- SelectModel 打开时按 chat 状态读取不同来源。

## 6. 同类问题清单

这轮可以一起收敛，但不应扩大到 Codex 主链路：

| 问题 | 建议 |
------|------|
| `pendingSessionBinding.mjs` 用 `sessionId` 字符串前缀判断 pending | 改为 identity helper 判断 |
| `historyPersistenceSanitizer.mjs` 中 `sessionId === cliSessionId` 评分逻辑语义不明 | 补注释，说明这是历史兼容态 |
| `useClaudeAgentStream.js` 事件参数 `sid` 语义不明 | 局部改名为 `chatKey` |
| `claudeAgent.js` Map 注释写 `sessionId -> ...` | 改成 `chatKey -> ...` |
| 新增 meta helper 容易误传 draft key | helper 签名禁止 `sessionId`，只写 `cliSessionId` / `sessionFilePath` |

## 7. 回归清单

每个 Phase 完成后至少验证：

- 新建空 chat，未发送消息时切 tab / 关闭项目 / 重新打开。
- 首次发送消息后 early cli session 能回填。
- scan 能领养 pending chat，不产生重复会话。
- `done` 后历史会话能 resume。
- provider 切换后已绑定会话仍能继续。
- delete chat 只删除目标 `.jsonl`，后续 Phase 3 起同步删除 `.meta.json`。
- close project/tab 不删除磁盘会话文件。
- crash/interrupted 后从磁盘恢复消息，不被内存残留阻断。

## 8. 风险控制

- 不一次性全量 rename `chat.sessionId`，先通过 helper 和局部变量收敛。
- 不改 IPC channel 名，避免 preload/main/renderer 三端同时大面积变更。
- 不改 panel state schema；如后续需要新增字段，必须兼容旧数据。
- 每个 Phase 独立提交，Phase 1-2 不引入 T089 行为变化。
- 若同一函数连续三次回归，停止补丁式修改，改为重写该函数并补测试。
