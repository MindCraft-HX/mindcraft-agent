# Agent Session Identity Registry 人工验收

> 日期：2026-06-18
> 关联任务：T138
> 方案文档：`docs/plan/2026-06-18-agent-session-identity-registry.md`

## 1. 验收目标

确认 ClaudeCode / CodeX 会话身份、标题、恢复和删除行为符合三层模型：

| 层级 | 字段 | 归属 |
|------|------|------|
| UI 会话 | `chat.sessionId` / `chatKey` | MindCraft |
| Provider 会话 | `cliSessionId` / `providerSessionId` | Claude/Codex 官方 |
| Transcript 文件 | `filePath` | Claude/Codex 官方 JSONL |

验收通过标准：

- `chat.sessionId` 不再等于 `cliSessionId/providerSessionId`。
- 关闭项目 Tab 再打开，自定义标题保留。
- 自动修复只改 `{userData}`，不写不删 `~/.claude` / `~/.codex` transcript。
- 重命名只写 MindCraft registry，不再向官方 JSONL 追加 title。
- 继续旧会话会 resume 原 transcript，不新建重复 JSONL。
- 删除底层会话有二级确认。

## 2. 准备

1. 使用真实用户数据前，先备份 Electron `userData` 目录。
2. 重点备份：
   - `{userData}/session-registry/`
   - `{userData}/claude-panel-state.json`
   - `{userData}/codex-panel-state.json`
3. 不要手工改 `~/.claude` / `~/.codex`，验收只观察这些目录是否被 App 非预期写入。
4. 建议准备一个临时测试项目目录，例如 `D:/tmp/mindcraft-session-qa`。

## 3. 基础功能验收

### 3.1 新建会话身份分离

步骤：

1. 打开 ClaudeCode，选择测试项目目录。
2. 新建一个会话，发送一条简单消息。
3. 打开 CodeX，选择同一测试项目目录。
4. 新建一个会话，发送一条简单消息。
5. 查看 `{userData}/claude-panel-state.json` 和 `{userData}/codex-panel-state.json`。

通过标准：

- 每个 chat 都有 `sessionId`。
- 产生底层会话后，每个 chat 也应有 `cliSessionId` 和 `filePath`。
- `sessionId !== cliSessionId`。
- `sessionId` 看起来应是 MindCraft key，例如 `session-...` 或 `codex-session-...`，不是官方 UUID/thread id。

失败判定：

- 新会话出现 `sessionId === cliSessionId`。
- 切换或刷新后同一个底层会话出现多个 UI chat。

### 3.2 自定义标题关闭 Tab 后保留

步骤：

1. 对 ClaudeCode 会话重命名为 `QA Claude Custom Title`。
2. 对 CodeX 会话重命名为 `QA Codex Custom Title`。
3. 关闭对应项目 Tab。
4. 重新打开同一项目目录。

通过标准：

- 两个标题都保持自定义名称。
- registry record 中对应会话应有：
  - `title` 为自定义标题。
  - `titleSource` 为 `user`。

失败判定：

- 关闭项目 Tab 后重开，标题变回首条消息/自动标题。
- 后台刷新后自定义标题被覆盖。

### 3.3 重命名不污染官方 transcript

步骤：

1. 记录 CodeX 会话的 `filePath`。
2. 查看该 JSONL 当前末尾内容。
3. 在 App 里再次重命名 CodeX 会话。
4. 再查看该 JSONL。

通过标准：

- JSONL 不新增新的 `type: "custom-title"` 行。
- `{userData}/session-registry/sessions/<chatKey>.json` 中 title 更新。

ClaudeCode 验证：

- 重命名后应只更新 registry。
- 不依赖 Claude SDK `renameSession()` 写官方 transcript。

失败判定：

- CodeX JSONL 新增 `custom-title`。
- Claude/Codex 官方 transcript 被当作 MindCraft title 存储。

### 3.4 继续旧会话不分裂

步骤：

1. 关闭 App 或关闭项目 Tab 后重新打开项目。
2. 选择刚才的历史会话。
3. 发送一条新消息。
4. 查看官方 JSONL 文件数量和该会话 `filePath`。

通过标准：

- 新消息写入原 `filePath`。
- 没有为同一 UI 会话新建第二个 JSONL。
- 侧栏没有出现重复会话。

失败判定：

- 发送后出现一个同名/近似同名新会话。
- 原会话和新会话内容互串。

## 4. 自动修复验收

### 4.1 旧污染数据自动修复

适用场景：

- 老用户数据中存在 `chat.sessionId === cliSessionId`。
- registry 中同一 provider 对应多个 record。
- panel state 中仍保存 provider id 作为 `sessionId`。

步骤：

1. 启动 App 并打开 ClaudeCode / CodeX panel。
2. 查看 `{userData}/session-registry-backups/`。
3. 找到最新备份目录，打开 `repair-report.json`。
4. 再查看 panel state 和 registry record。

通过标准：

- 如果存在污染，会生成备份目录。
- 备份目录包含修复前的 `session-registry` 和相关 panel state。
- `repair-report.json` 记录修复项。
- 修复后 panel state 中污染的 `sessionId` 改为 MindCraft `chatKey`。
- registry 中同一 provider 只剩一个 canonical record。

失败判定：

- 修复没有备份。
- 修复触碰或删除了 `~/.claude` / `~/.codex` JSONL。
- 修复后同一 provider 仍有多个有效 record。

### 4.2 跨 Agent 不误修

步骤：

1. ClaudeCode 和 CodeX 同时打开同一项目。
2. 分别确认两个 agent 都有自己的会话。
3. 关闭并重开项目 Tab。

通过标准：

- Claude 的 registry record 不会改写 CodeX panel 的 `sessionId`。
- CodeX 的 registry record 不会改写 Claude panel 的 `sessionId`。
- 两边标题和内容互不覆盖。

失败判定：

- 一个 agent 的会话 title/content 出现在另一个 agent 的侧栏或 panel state。

## 5. 删除语义验收

### 5.1 取消二级确认

步骤：

1. 选择一个已有 `filePath` 的历史会话。
2. 点击删除。
3. 第一次确认选择确认。
4. 第二次“永久删除底层官方会话历史”确认选择取消。

通过标准：

- UI 会话不被删除。
- 官方 JSONL 仍存在。
- registry record 仍存在。

### 5.2 确认永久删除

步骤：

1. 重复删除操作。
2. 第二次确认选择删除。

通过标准：

- 官方 JSONL 被删除。
- registry record 被删除。
- 刷新/重开项目后该会话不再出现。

失败判定：

- 没有二级确认就删除了官方 transcript。
- 删除后刷新又出现同一会话。

## 6. 重点文件检查

验收时主要看这些文件：

| 文件 | 检查点 |
|------|--------|
| `{userData}/session-registry/index.json` | `providers` 是否映射到唯一 `chatKey` |
| `{userData}/session-registry/sessions/<chatKey>.json` | `titleSource`、`provider.cliSessionId`、`provider.filePath` |
| `{userData}/claude-panel-state.json` | `sessionId !== cliSessionId` |
| `{userData}/codex-panel-state.json` | `sessionId !== cliSessionId` |
| `{userData}/session-registry-backups/<timestamp>/repair-report.json` | 自动修复报告 |
| 官方 JSONL transcript | 重命名不新增 MindCraft title；删除时才被删除 |

## 7. 已跑自动化验证

开发侧已通过：

```powershell
node --test packages/agent/electron/sessionRegistry.test.js tests/codex-session-summary.test.cjs tests/session-title-utils.test.cjs tests/claude-session-identity.test.mjs tests/claude-history-restore-import.test.cjs tests/claude-history-selection.test.mjs tests/claude-session-refresh-guard.test.mjs tests/codex-session-routing.test.mjs tests/codex-session-lifecycle.test.mjs
node --check packages/agent/electron/sessionRegistry.js packages/agent/electron/sessionInstructionIpc.js packages/agent/electron/codexAgent.js packages/agent/electron/claudeAgent.js
```

人工验收仍必须覆盖真实 App 行为，尤其是关闭项目 Tab、重开目录、继续历史会话和删除确认。
