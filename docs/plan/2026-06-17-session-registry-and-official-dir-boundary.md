# Session Registry 与官方 Agent 目录边界重构规划

> 创建：2026-06-17
> 状态：规划中
> 原则：官方 transcript/config 不搬；MindCraft 自有数据迁回 `userData`；读旧写新，分阶段验证。

## 背景

MindCraft 同时集成 Claude Code 和 CodeX。两者都有自己的官方数据目录：

- Claude Code：`~/.claude/`
- CodeX：`~/.codex/`

这些目录应该只承载官方 CLI/SDK 能识别的数据，例如 transcript、settings、skills、plugins、MCP 配置和认证状态。MindCraft 自己的 UI 状态、会话标题、模型选择、session instruction、编排元数据等不应该写进去。

历史上为了快速开发，部分 MindCraft 自有数据被写入官方目录或官方 transcript 附近，例如 CodeX panel state 和 Claude `.meta.json` sidecar。这会带来几个问题：

- 官方 CLI 升级或清理时可能误伤 MindCraft 数据。
- MindCraft 数据和官方 transcript 混在一起，边界不清，后续维护容易误判。
- 迁移、备份、排障时不知道哪些文件属于 MindCraft，哪些属于官方工具。
- 上层 agent 编排、多 session instruction、角色化 session 等能力需要稳定的 MindCraft 自有 registry，不能依赖 provider 目录。

## 当前边界盘点

### 应保留在官方目录的数据

这些是 provider/CLI 的事实来源，不迁移：

| 数据 | 位置 | 原因 |
|------|------|------|
| Claude transcript JSONL | `~/.claude/projects/<cwd-hash>/*.jsonl` | Claude Code 官方会话历史，resume 依赖 |
| CodeX transcript JSONL | `~/.codex/sessions/*.jsonl` | CodeX 官方 thread 历史，resumeThread 依赖 |
| Claude settings | `~/.claude/settings.json` | Claude Code 官方 settings schema |
| CodeX config/auth | `~/.codex/config.toml`, `~/.codex/auth.json` | Codex CLI 官方配置/认证 |
| 官方 skills/plugins | `~/.claude/*`, `~/.codex/*`, 项目 `.claude/.codex` | 官方工具加载入口 |

### 应迁回 MindCraft `userData` 的数据

| 数据 | 当前位置 | 目标位置 | 风险 |
|------|----------|----------|------|
| CodeX panel state | `~/.codex/codex-panel-state.json` | `{userData}/codex-panel-state.json` 或 registry | 低 |
| Claude per-session model sidecar | `~/.claude/projects/<cwd-hash>/<cliSessionId>.meta.json` | `{userData}/session-registry/sessions/<chatKey>.json` | 中 |
| session instruction | 新功能 | `{userData}/session-registry/instructions/*.json` | 低 |
| chat title/description/角色/编排元数据 | 分散在 panel state | `{userData}/session-registry/sessions/*.json` | 中 |
| 诊断日志 | 部分仍在 `~/.claude` | `{userData}/diagnostics/` | 低 |

## 目标架构

新增 MindCraft-owned session registry：

```text
{userData}/session-registry/
  index.json
  sessions/
    <chatKey>.json
  instructions/
    <instructionId>.json
```

### session record

```json
{
  "schemaVersion": 1,
  "chatKey": "session-1-...",
  "agent": "claude",
  "projectId": "project-...",
  "cwd": "D:/repo",
  "title": "客户A功能开发",
  "description": "按客户A宏映射处理需求",
  "provider": {
    "cliSessionId": "uuid-or-thread-id",
    "filePath": "C:/Users/.../.claude/projects/.../uuid.jsonl"
  },
  "runtime": {
    "model": "claude-sonnet-...",
    "effort": "medium",
    "reasoningEffort": null
  },
  "instruction": {
    "enabled": true,
    "instructionId": "instruction-xxx"
  },
  "createdAt": 0,
  "updatedAt": 0
}
```

### instruction record

```json
{
  "schemaVersion": 1,
  "id": "instruction-xxx",
  "title": "客户A宏映射",
  "description": "客户A固件需求开发上下文",
  "content": "本会话只按客户A配置解释代码...",
  "attachments": [
    {
      "type": "markdown",
      "path": "D:/repo/docs/customer-a-macros.md"
    }
  ],
  "createdAt": 0,
  "updatedAt": 0
}
```

## 映射原则

MindCraft 的会话身份分三层：

| 层 | 字段 | 归属 | 说明 |
|----|------|------|------|
| UI 会话 | `chatKey` / legacy `chat.sessionId` | MindCraft | UI、panel state、registry 主键 |
| Provider 会话 | `cliSessionId` / CodeX thread id | 官方 Agent | resume / transcript 文件名 |
| 磁盘 artifact | `filePath` | 官方 Agent | JSONL 真实路径，只读/删除时使用 |

规则：

- UI 状态只以 `chatKey` 为主键。
- provider resume 只使用 `cliSessionId`。
- 删除官方 transcript 时，必须同步清理 registry 中对应映射；不能只删 UI。
- registry 可引用官方 `filePath`，但不能把 MindCraft 自有数据写到 `filePath` 旁边。
- 如果扫描发现官方 JSONL 存在但 registry 缺失，可以按旧逻辑重建最小 session record。

## 分阶段迁移

### Phase 0：规则和文档

- `AGENTS.md` / `CLAUDE.md` 增加官方目录边界红线。
- `docs/` 重新纳入 git，避免架构文档丢失。
- 注册 TODO，明确迁移顺序和验收标准。

### Phase 1：低风险迁移 CodeX panel state

状态：✅ 已完成（2026-06-17）

目标：

- 新路径：`{userData}/codex-panel-state.json`
- 读取顺序：新路径 → 旧 `~/.codex/codex-panel-state.json`
- 写入顺序：只写新路径
- 不删除旧文件

实现：

- `packages/agent/electron/codexPanelStatePaths.js` 统一定义新旧路径。
- `codex-load-code-panel-state` 优先读取 `{userData}/codex-panel-state.json`，旧文件存在且新文件不存在时自动导入到新路径。
- `codex-save-code-panel-state` / sync 保存只写新路径。
- 首页最近项目读取同样使用新路径优先、旧路径 fallback。
- 新增 `codexPanelStatePaths.test.js`，并纳入 `npm test`。

验收：

- 重启应用后 CodeX 项目和会话仍恢复。
- 旧路径存在时可自动导入。
- 新建/重命名/删除 chat 后只更新新路径。

### Phase 2：建立 session registry 基础

状态：✅ 已完成（2026-06-17）

目标：

- 新增主进程模块：`sessionRegistry.js`
- 支持 get/upsert/delete session record。
- Claude/CodeX panel state 仍保留 UI 展示字段，但 provider 映射开始同步写 registry。

实现：

- 新增 `packages/agent/electron/sessionRegistry.js`，registry 根目录为 `{userData}/session-registry/`。
- `sessions/<chatKey>.json` 保存 `chatKey`、agent、project/cwd、title/description、`provider.cliSessionId/filePath`、runtime model/effort/reasoningEffort、instruction 绑定。
- `index.json` 保存轻量索引，便于后续按 chatKey/provider 映射查找。
- Claude/CodeX 保存 panel state 后旁路同步 registry；现有 panel state 仍是 UI 恢复来源。
- Claude/CodeX 删除官方 JSONL transcript 后，按 provider `filePath` 清理 registry record。
- 新增 `sessionRegistry.test.js`，覆盖 record 构建、panel state 同步、按 filePath 删除。

风险控制：

- Phase 2 不读取 registry 参与 resume，不改变现有恢复主路径。
- registry 写入失败只记录 warn，不应阻断 panel state 保存。
- 不移动、不重命名、不批量删除官方 JSONL transcript。

验收：

- 新建 Claude/CodeX 会话后 registry 有 `chatKey → cliSessionId/filePath`。
- resume 仍走现有逻辑，不改变用户行为。
- scan/adoption/done 并发不产生重复 registry record。

### Phase 3：迁移 Claude `.meta.json` sidecar

目标：

- 新写入的 per-session model/effort 存 registry。
- 读取顺序：registry → 旧 `.meta.json` → 默认配置。
- 删除 chat 时删除 registry record；旧 `.meta.json` 可选清理，但不能作为唯一状态来源。

验收：

- 已有带 `.meta.json` 的旧会话仍能显示模型/effort。
- 新会话不再创建 `.meta.json`。
- 删除会话后 registry 不残留。

### Phase 4：Session Instruction

目标：

- instruction 存 `{userData}/session-registry/instructions/*.json`
- chat record 只保存 `instructionId` 和 `enabled`
- Claude 注入 `systemPrompt`
- CodeX 以固定上下文块拼到 prompt 前

验收：

- 同一个 instruction 可复用多个 session。
- 中途修改 instruction 后，下次发送生效。
- 附件 `.md` 发送前读取最新内容。
- 附件路径做 realpath 边界/存在性检查，不读敏感路径。

### Phase 5：诊断日志和残留整理

目标：

- MindCraft 诊断日志统一写 `{userData}/diagnostics/`
- 清理新增写入官方目录的代码路径。
- 保留官方 settings/config 的合法修复入口。

验收：

- `rg "~/.claude|~/.codex"` 所有写路径都有明确注释：官方 schema 写入 / 官方 transcript / legacy fallback。

## 风险控制

- 不迁移官方 JSONL transcript。
- 不批量删除旧文件。
- 每个 Phase 独立提交和验证。
- 先读旧写新，再观察至少一个版本。
- 任何 registry 缺失都必须能 fallback 到现有扫描逻辑。
- 删除逻辑必须同时考虑 UI、registry、官方 transcript，不允许只删一边。

## 后续上层 Agent 编排

Session registry 是后续 orchestration 的基础。未来上层 agent 可以创建或选择多个 session：

- 规划 session：CodeX + 高推理模型 + 需求/架构 instruction
- 执行 session：ClaudeCode + 客户宏映射 instruction
- Review session：CodeX/Claude + review checklist instruction
- 打包部署 session：固定 release/deploy instruction

这要求 MindCraft 有自己的 session 元数据层，而不是把这些编排信息塞到 Claude/CodeX 官方目录。
