# Agent Session Identity 与 MindCraft Registry 重构

> 创建：2026-06-18
> 状态：主体实现完成，待人工回归
> 关联：T134 / T138
> 原则：官方 transcript/config 不搬；MindCraft 产品状态只写 `userData`；扫描官方数据只建立底层映射，不生成产品状态。

## 1. 问题背景

当前 ClaudeCode / CodeX 都存在会话身份混用：

- `chat.sessionId` 有时是 MindCraft 自己生成的 UI key，例如 `session-chat-54-...`。
- `chat.sessionId` 有时又等于官方 Claude session UUID 或 CodeX thread id。
- `chat.cliSessionId` / `chat.filePath` 才是底层 transcript 的真实身份。

这导致几个问题：

- 关闭项目 Tab 后重新打开，历史会话从官方 JSONL 全量重建，MindCraft 自有字段容易丢失。
- 自定义标题、session instruction、模型/effort 等产品状态没有稳定权威来源。
- session registry 同步 panel state 时，会把已经混用的身份固化成持久 record。
- 同一个 provider session 可能对应多个 `chatKey`，造成 title / instruction / runtime 映射不确定。

## 2. Transcript 是什么

Transcript 是底层 Agent CLI/SDK 的官方会话流水账，通常是 JSONL 文件。

它记录底层会话事实：

| 内容 | 作用 |
|------|------|
| session meta / thread id / cwd | 标识底层官方会话和工作目录 |
| 用户消息 / assistant 消息 | 恢复历史聊天内容 |
| 工具调用 / 工具结果 | 恢复工具卡片、计划、diff 等 UI |
| token_count / usage | 统计 token、成本、上下文使用量 |
| 运行上下文事件 | 辅助恢复和诊断 |

Transcript 的职责是“底层事实来源”。它不应该承载 MindCraft 产品状态。

MindCraft 产品状态包括：

- UI `chatKey`
- 用户自定义标题
- 会话描述
- session instruction 与附件引用
- per-session model / effort / reasoningEffort
- panel 展开/选中/隐藏状态
- 编排元数据、诊断状态、缓存状态

这些状态必须写在 MindCraft 自己的 `{userData}/session-registry/` 或 panel state 中。

## 3. 三层身份模型

目标态只保留三层身份：

| 层 | 字段 | 归属 | 规则 |
|----|------|------|------|
| UI 会话 | `chatKey` | MindCraft | 由 MindCraft 生成，稳定主键；legacy 字段仍是 `chat.sessionId` |
| Provider 会话 | `providerSessionId` | 官方 Agent | Claude 为 `cliSessionId`，CodeX 为 thread id；只用于 resume |
| Transcript 文件 | `filePath` | 官方 Agent | JSONL 文件路径；只读解析，用户永久删除时才删除 |

关键约束：

- `chatKey` 不应等于 `providerSessionId`。
- 新代码不应把官方 `meta.id` 写入 `chat.sessionId`。
- 同一个 `agent + providerSessionId/filePath` 只能映射到一个 `chatKey`。
- panel state 可以缓存当前 UI，但 registry 才是跨关闭/重建的权威映射层。

## 4. 扫描为什么仍然能匹配

“扫描官方 transcript 只返回 provider 信息”不是不返回 id，而是不返回 **MindCraft UI sessionId**。

扫描仍然读取官方 JSONL 并返回：

```json
{
  "providerSessionId": "019eda54-...",
  "filePath": "C:/Users/.../.codex/sessions/...jsonl",
  "cwd": "D:/repo",
  "providerTitle": "从 transcript 推断的标题",
  "providerTitleSource": "custom-title|first-user|assistant|fallback",
  "createdAt": "...",
  "updatedAt": "...",
  "fileSize": 12345,
  "runtime": {
    "model": "...",
    "effort": "...",
    "reasoningEffort": "..."
  }
}
```

然后 MindCraft 用 `agent + providerSessionId/filePath` 去 registry 查自己的 record：

```text
官方 JSONL scan
  -> providerSessionId/filePath
  -> registry provider index
  -> chatKey/title/instruction/runtime
  -> 构建 UI chat
```

如果 registry 查不到，说明这是 MindCraft 首次看到该官方会话。此时才生成新的 `chatKey`，并立即写入 registry。

## 5. 配置与 Transcript 映射关系

目标 registry：

```text
{userData}/session-registry/
  index.json
  sessions/
    <chatKey>.json
```

### 5.1 `sessions/<chatKey>.json`

| 字段 | 来源 | 是否权威 | 说明 |
|------|------|:------:|------|
| `chatKey` | MindCraft | 是 | UI 会话主键 |
| `agent` | MindCraft | 是 | `claude` / `codex` |
| `projectId` | MindCraft | 是 | 当前 panel project id，可随 UI 重建更新 |
| `cwd` | transcript scan / UI | 是 | 工作目录，用于项目归属 |
| `title` | MindCraft | 是 | 用户标题或自动标题 |
| `titleSource` | MindCraft | 是 | `user` / `auto` / `provider` |
| `description` | MindCraft | 是 | 会话描述，不注入模型 |
| `provider.cliSessionId` | transcript scan / done event | 是 | Claude session UUID 或 CodeX thread id |
| `provider.filePath` | transcript scan / done event | 是 | 官方 JSONL 路径 |
| `runtime.model` | UI / transcript fallback | 是 | per-session model |
| `runtime.effort` | UI / transcript fallback | 是 | Claude effort |
| `runtime.reasoningEffort` | UI / transcript fallback | 是 | CodeX reasoning effort |
| `instruction.enabled` | MindCraft | 是 | 会话指令启用状态 |
| `instruction.content` | MindCraft | 是 | 会话指令正文 |
| `instruction.attachments` | MindCraft | 是 | 本地附件引用，不复制文件 |
| `createdAt` / `updatedAt` | UI / transcript | 是 | record 生命周期 |

### 5.2 `index.json`

`index.json` 应包含轻量索引，避免每次全量扫 `sessions/*.json`：

```json
{
  "schemaVersion": 2,
  "sessions": {
    "<chatKey>": {
      "agent": "codex",
      "cwd": "D:/repo",
      "title": "用户标题",
      "titleSource": "user",
      "cliSessionId": "019eda54-...",
      "filePath": "C:/Users/...jsonl",
      "updatedAt": 0,
      "path": "sessions/<encoded>.json"
    }
  },
  "providers": {
    "codex:thread:019eda54-...": "<chatKey>",
    "codex:path:c:/users/...jsonl": "<chatKey>"
  }
}
```

`providers` 是唯一约束层。写入时如果同一个 provider key 已指向另一个 `chatKey`，必须合并，而不是新增第二条 session record。

## 6. Title 与 `_userRenamed`

`_userRenamed` 不是官方稳定字段；它是 MindCraft panel state 里的 UI 标记。

历史上还存在官方 transcript 里的 `custom-title`：

- Claude：当前代码调用 SDK `renameSession()`，底层可能写官方 transcript。
- CodeX：当前代码手动 append `type: "custom-title"` 行到 JSONL。

目标态不再向官方 transcript 写 MindCraft 标题。

替代字段：

| 字段 | 位置 | 说明 |
|------|------|------|
| `title` | registry | 当前显示标题 |
| `titleSource` | registry | 标题来源 |

`titleSource` 语义：

| 值 | 含义 | 是否可被 transcript 自动标题覆盖 |
|----|------|:------:|
| `user` | 用户显式重命名 | 否 |
| `auto` | MindCraft 自动生成的标题 | 可以 |
| `provider` | 从官方 transcript 推断或 legacy `custom-title` 读取 | 可以，除非用户再次重命名 |

迁移期兼容：

- 旧 `_userRenamed: true` -> `titleSource: "user"`。
- 旧 transcript `custom-title` 只作为 fallback；不再作为新写入目标。
- 旧 `_userRenamed` 可保留一段时间用于兼容旧 panel state，但不再作为权威字段。

## 7. 删除语义

当前行为：

- 关闭项目 Tab：只移除 MindCraft panel project，不删官方 transcript。
- 删除单个 session：Claude / CodeX 都会删除官方 JSONL transcript，并清理 registry。

目标行为：

| 操作 | 影响 MindCraft registry | 影响官方 transcript |
|------|-------------------------|---------------------|
| 关闭项目 Tab | 不删除 session record | 不删除 |
| 从 MindCraft 移除会话 | 标记 hidden 或从当前项目解除显示 | 不删除 |
| 永久删除底层会话 | 删除 registry record | 删除官方 JSONL |

UI 建议：

- 删除按钮保留为“永久删除”时，必须二级确认，文案明确会删除底层 Claude/Codex 会话历史。
- 后续可新增“仅从 MindCraft 移除”。

## 8. 自动修复策略

自动修复必须保守，避免副作用。

### 8.1 触发时机

- 应用启动或首次加载 agent panel state 时执行。
- 执行前备份：
  - `{userData}/session-registry/`
  - `{userData}/claude-panel-state.json`
  - `{userData}/codex-panel-state.json`
- 旧 `~/.claude` / `~/.codex` 不写入，不删除。

### 8.2 合并规则

按 `agent + providerSessionId/filePath` 分组。

同组多个 record 的保留优先级：

1. 有 `titleSource: "user"` 的 record。
2. 旧 panel state 中 `_userRenamed: true` 的 record。
3. 有 instruction 内容或附件的 record。
4. 有 runtime model/effort 的 record。
5. `updatedAt` 最新的 record。

字段合并：

| 字段 | 合并规则 |
|------|----------|
| `chatKey` | 选择优先级最高 record 的 chatKey；如果等于 provider id 且存在更像 UI key 的候选，则选 UI key |
| `title` | 用户标题优先，其次 legacy panel title，其次 transcript custom-title，其次 first user |
| `titleSource` | 用户标题为 `user`，transcript fallback 为 `provider`，自动推断为 `auto` |
| `instruction` | 非空内容/附件优先保留 |
| `runtime` | 显式 per-session 配置优先，缺失时 transcript fallback |
| `provider` | 保留完整 `cliSessionId/filePath` |

### 8.3 不自动做的事

- 不删除官方 JSONL。
- 不把 title 写回官方 JSONL。
- 不把无法确认归属的 session 强行合并。
- 不修改 transcript 内容。

## 9. 实施阶段

### Phase 1：文档与测试基线

- 注册 T138。
- 增加 registry identity 测试：
  - 同 provider 只能有一个 chatKey。
  - 关闭 Tab 后重建保留 title。
  - 用户 title 不被 transcript 自动标题覆盖。
  - 扫描摘要不再把 provider id 写入 UI `sessionId`。

### Phase 2：Registry API 收敛

- 新增或收敛 API：
  - `resolveSessionByProvider(agent, providerSessionId, filePath)`
  - `upsertSessionFromProviderScan(agent, scanSummary, project)`
  - `setSessionTitle(chatKey, title)`
  - `hideSession(chatKey)`
  - `deleteSessionPermanently(chatKey | provider)`
- `syncPanelStateSessions()` 改为只同步 UI 缓存，不得覆盖 registry 权威字段。

### Phase 3：扫描重建改造

- Claude / CodeX 扫描摘要统一字段：
  - `providerSessionId`
  - `filePath`
  - `providerTitle`
  - `providerTitleSource`
  - `runtime`
- 前端不再用 `summary.id` / `summary.sessionId` 作为 `chat.sessionId`。
- 新建历史 chat 时通过 registry resolve 得到 `chatKey`。

### Phase 4：Title 写入改造

- Claude / CodeX 重命名统一写 registry。
- 官方 transcript 的 `custom-title` 只读 fallback。
- panel state 保存 title 缓存，但不作为唯一权威。

### Phase 5：自动修复与删除语义

- 实现保守自动修复。
- 增加诊断输出：合并了哪些 provider、保留了哪个 chatKey、丢弃了哪些重复 record。
- 删除会话改二级确认，明确“永久删除底层官方会话历史”。

## 10. 验收标准

- 新建 Claude / CodeX 会话后，`chatKey !== providerSessionId`。
- 关闭项目 Tab 后重新打开，自定义标题仍保留。
- 同一 provider transcript 在 registry 中只有一个 session record。
- 用户标题不会被后台扫描覆盖。
- session instruction / runtime 配置不会因 panel state 保存而丢失。
- 删除 session 有二级确认，并且删除行为符合文案。
- 代码中不再新增 MindCraft 自有数据写入 `~/.claude` / `~/.codex` 官方 transcript 附近。

## 11. 文件级改动计划

### 11.1 Registry 主进程层

目标文件：

- `packages/agent/electron/sessionRegistry.js`
- `packages/agent/electron/sessionRegistry.test.js`

新增能力：

| API | 作用 |
|-----|------|
| `makeProviderKeys(agent, { cliSessionId, filePath })` | 生成稳定 provider 唯一键 |
| `resolveSessionByProvider({ agent, cliSessionId, filePath })` | 用 provider identity 找 MindCraft session record |
| `upsertSessionFromProviderScan(agent, scanSummary, project)` | 扫描 transcript 后创建或更新 registry record |
| `setSessionTitle(chatKey, title, { source: 'user' })` | 统一写 MindCraft 标题 |
| `deleteSessionPermanently(...)` | 删除 registry record，用于永久删除底层 transcript 后清理 |
| `repairSessionRegistry(options)` | 保守合并重复 provider record，输出诊断报告 |

实现要求：

- `index.json` schema 升到 2，保留兼容读取 schema 1。
- `index.providers` 是唯一约束来源。
- 旧 `findSessionRecordByProvider()` 可保留为兼容包装，但内部应走 provider index；index 缺失时才 fallback 全量扫描并重建 index。
- `syncPanelStateSessions()` 不得用 panel state 空字段覆盖 registry 权威字段；它只能补充 UI 缓存字段和 legacy 迁移线索。

### 11.2 Transcript 扫描层

目标文件：

- `packages/agent/electron/sessionTitleUtils.js`
- `electron/mainModules/sessionTitleUtils.js`（如仍被旧入口引用，保持同步或确认废弃）
- `packages/agent/electron/claudeAgent.js`
- `packages/agent/electron/codexAgent.js`

改动要求：

- 扫描摘要新增统一字段：
  - `providerSessionId`
  - `providerTitle`
  - `providerTitleSource`
  - `runtime`
- 保留旧字段 `id` / `cliSessionId` 作为过渡兼容，但新 renderer 代码不得把它们写入 `chat.sessionId`。
- CodeX 不再把扫描摘要里的 `sessionId: meta.id` 作为 UI identity。
- Claude 不再把 `cliSessionId` 作为新历史 chat 的 `sessionId`。

### 11.3 Renderer 会话重建层

目标文件：

- `packages/agent/src/components/claudeCode/index.vue`
- `packages/agent/src/components/codeX/index.vue`
- `packages/agent/src/components/claudeCode/composables/useClaudeHistory.js`
- `packages/agent/src/components/codeX/composables/useCodexHistory.js`

改动要求：

- `selectDir()` / `loadProjectSessions()` / `loadProjectChatsFromCodexSessions()` 必须通过 registry resolve 得到 `chatKey`。
- 新建历史 chat 时，`sessionId` 只能是 registry `chatKey` 或新生成的 MindCraft key。
- 从扫描结果恢复 title 时，优先 registry `title/titleSource`，再用 transcript fallback。
- `saveHistory()` 继续保存 panel state，但 panel state 不再是 title/instruction/runtime 的唯一事实来源。
- 恢复后立即注册 `chatKey -> providerSessionId` 到主进程 runtime map。

### 11.4 Title 写入层

目标文件：

- `packages/agent/electron/sessionRegistry.js`
- `packages/agent/electron/sessionInstructionIpc.js` 或新增 `sessionTitleIpc.js`
- `packages/agent/electron/claudeAgent.js`
- `packages/agent/electron/codexAgent.js`
- Claude / CodeX renderer rename handler

改动要求：

- 新增统一 IPC：`agent-set-session-title` / `agent-get-session-title`（命名可按现有风格微调）。
- ClaudeCode rename 不再把 MindCraft title 作为主路径写官方 SDK transcript。
- CodeX rename 不再 append `custom-title` 到 JSONL。
- 旧 transcript `custom-title` 只作为 fallback 读取。

### 11.5 删除语义层

目标文件：

- Claude / CodeX `HistorySidebar.vue`
- Claude / CodeX `index.vue`
- `packages/agent/electron/claudeAgent.js`
- `packages/agent/electron/codexAgent.js`
- i18n locale 文件

改动要求：

- 现有“删除 session”如果仍永久删除官方 transcript，必须二级确认。
- 文案明确：会删除底层 Claude/Codex 官方会话历史，无法仅靠 MindCraft 恢复。
- 后续可加“仅从 MindCraft 移除”，但本阶段不是必须。

## 12. 测试矩阵

### 12.1 单元测试

新增或更新：

| 测试 | 覆盖 |
|------|------|
| `sessionRegistry.test.js` | provider 唯一索引、schema 1 兼容、重复 record 合并、titleSource 保护 |
| `claude-session-identity.test.*` | Claude 扫描摘要不生成 UI chatKey |
| `codex-session-identity.test.*` | CodeX 扫描摘要不生成 UI chatKey |
| `*-history.test.*` | panel state 恢复不覆盖 registry title/instruction/runtime |

必须断言：

- 同一 `agent + cliSessionId` 写入两次不会生成两个有效 record。
- 有 `titleSource: "user"` 时，扫描得到的新标题不能覆盖用户标题。
- `_userRenamed: true` 的 legacy panel state 迁移后变成 `titleSource: "user"`。
- `chatKey == providerSessionId` 的旧 record 会被修复或隔离为 legacy，不再作为新建规则。

### 12.2 集成/人工回归

ClaudeCode：

1. 新建会话，发送一条消息，确认 panel state 里 `chat.sessionId !== chat.cliSessionId`。
2. 重命名，关闭项目 Tab，重新打开目录，标题保留。
3. 继续发送消息，确认 resume 原 transcript，不创建新 JSONL。
4. 删除会话，二级确认后官方 JSONL 被删除，registry record 被清理。

CodeX：

1. 同 ClaudeCode 四项。
2. 确认重命名不会向 JSONL 追加新的 `custom-title` 行。
3. 旧 JSONL 有 `custom-title` 时，首次迁移可读作 fallback title。

跨 Agent：

1. 切换 provider 不丢 registry 映射。
2. 同一 cwd 下 Claude / CodeX registry provider key 不互相覆盖。
3. session instruction 和附件在关闭 Tab 后仍保留。

## 13. 自动修复回滚策略

自动修复必须先备份，再写入。

备份目录建议：

```text
{userData}/session-registry-backups/
  2026-06-18Txxxxxx/
    session-registry/
    claude-panel-state.json
    codex-panel-state.json
    repair-report.json
```

修复输出：

| 字段 | 说明 |
|------|------|
| `startedAt` / `finishedAt` | 修复时间 |
| `dryRun` | 是否仅诊断 |
| `mergedProviderGroups` | 合并的 provider 分组 |
| `keptChatKey` | 每组保留的 chatKey |
| `removedChatKeys` | 每组被合并掉的重复 chatKey |
| `warnings` | 无法确认归属、跳过修复的项目 |

回滚策略：

- 自动修复只写 MindCraft `userData`。
- 回滚只需要恢复备份的 registry/panel state。
- 官方 `~/.claude` / `~/.codex` transcript 不参与修复，不需要回滚。

## 14. 实施顺序与停靠点

### Stop 1：只加测试和 registry API

可验证：

- 新 API 能解析旧 record。
- provider 唯一约束生效。
- 自动修复 dry-run 能输出报告但不写入。

不改 UI 行为。

### Stop 2：改扫描重建

可验证：

- 关闭项目 Tab 后重开，不再生成 `chatKey == providerSessionId` 的新会话。
- 旧标题和 instruction 从 registry 恢复。

保留旧 rename 行为，降低一次变更范围。

### Stop 3：改 title 写入

可验证：

- 新 title 只写 registry。
- 旧 transcript title fallback 仍可读。
- 用户 title 不再被扫描覆盖。

### Stop 4：自动修复默认启用

可验证：

- 首次启动自动备份并修复 MindCraft userData。
- 修复报告可追溯。
- 不触碰官方 transcript。

### Stop 5：删除二级确认

可验证：

- 文案准确。
- 永久删除路径清理 registry 和官方 transcript。

## 15. 已知陷阱

- 不要把“扫描返回 provider id”重新命名为 `sessionId`，否则会再次污染 UI key。
- 不要让 panel state sync 覆盖 `titleSource: "user"`、instruction 或 runtime。
- 不要把自动修复写成“全量按最新覆盖”，必须按字段合并。
- 不要在修复里删除官方 JSONL。
- 不要同时重构 Claude / CodeX SDK runtime 行为；本任务只处理身份和 registry。
- 不要用 `chat.id` 代替 `chatKey`。`chat.id` 是 Vue list/UI id，`chat.sessionId` 当前是 legacy chatKey 字段。

## 16. 2026-06-18 实施记录

- 已实现 registry provider index v2：`agent + providerSessionId/filePath` 唯一映射到一个 MindCraft `chatKey`。
- Claude / CodeX transcript 扫描结果已接入 registry resolve，不再用 provider id 创建 UI `chat.sessionId`。
- 用户重命名主路径已改为 `agent-set-session-title`，只写 MindCraft registry；旧 transcript `custom-title` 仅作扫描 fallback。
- panel state 保存/恢复已携带 `titleSource`，用户标题以 `titleSource: "user"` 保护。
- 自动修复已接入 panel state 加载：执行前备份 `{userData}/session-registry`、`claude-panel-state.json`、`codex-panel-state.json`，只修 MindCraft 自有数据，不写不删官方 transcript。
- 修复覆盖两类污染：重复 provider record 合并；`chatKey == providerSessionId` 或 panel state 仍存 provider id 时改回 canonical MindCraft `chatKey`。
- 永久删除底层会话已增加二级确认，文案明确会删除 Claude/Codex 官方 JSONL transcript。
- 验证：`node --test packages/agent/electron/sessionRegistry.test.js tests/codex-session-summary.test.cjs tests/session-title-utils.test.cjs tests/claude-session-identity.test.mjs tests/claude-history-restore-import.test.cjs tests/claude-history-selection.test.mjs tests/claude-session-refresh-guard.test.mjs tests/codex-session-routing.test.mjs tests/codex-session-lifecycle.test.mjs` 通过；`node --check` 通过。
