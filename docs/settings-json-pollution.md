# `~/.claude/settings.json` 污染分析

> 创建：2026-06-15 | 最后更新：2026-06-16 (v3)
> 关联：v1.0.7+ ClaudeCode 工具栏多模块异常
> Schema 来源：`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` Settings interface（权威来源，非网络文档）
> **状态**：T118/T119 实施完成

## 验证方法

所有字段判定依据 **SDK 源码类型定义**（`sdk.d.ts:3493~4789` `Settings` interface），而非网络文档。网络文档可能不完整或滞后。

## 问题定性

`~/.claude/settings.json` 是 **Claude Code SDK 的配置文件**。App 代码有多个路径将非 SDK 字段写入此文件，导致 SDK 读取到预期之外的配置。

## 证据：用户实际文件 vs SDK 源码

```
C:\Users\hanso\.claude\settings.json (2026-06-15)
SDK 版本：@anthropic-ai/claude-agent-sdk v0.2.117
```

| 字段 | 值 | SDK Settings interface | 判定 |
|------|-----|------------------------|------|
| `env.*` | API keys/URLs | ✅ | SDK 字段 |
| `model` | `"sonnet"` | ✅ | SDK 字段（tier 别名） |
| `enabledPlugins` | `{...}` | ✅ | SDK 字段 |
| `skipWebFetchPreflight` | `true` | ✅ | SDK 字段 |
| `language` | `"zh-CN"` | ✅ 字段存在 (L4509) | **语义冲突：SDK 用它做 Claude 回复语言 + 语音听写语言，App 用它做 UI 语言** |
| `effortLevel` | `"max"` | ⚠️ 两处不一致 (见下文) | **风险项：Settings interface 仅 `low/medium/high/xhigh`，但 `EffortLevel` type 含 `max`。三处定义不一致，保守做法用 `xhigh`。** |
| `autoCompactWindow` | `200000` | ✅ 字段存在 (L4632) | **合法 SDK 字段**（原文档误判为 APP 专属） |
| `theme` | `"dark-daltonized"` | ❌ 不存在 | **APP 专属**（已修复：theme 存 `theme.json`） |
| `permissionPolicy` | `"ask"` | ❌ 不存在 | **APP 专属**（SDK 用 `permissions.allow/deny/ask` 数组 + `permissions.defaultMode`） |

### `effortLevel: "max"` 详细分析

SDK 源码中三处定义不一致：

| 位置 | 行号 | 类型 | 包含 `max`？ |
|------|:---:|------|:---:|
| `Settings.effortLevel` | L4628 | `'low' \| 'medium' \| 'high' \| 'xhigh'` | ❌ |
| `EffortLevel` (类型别名) | L462 | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'` | ✅ |
| model config `effort` | L87 | `('low' \| ... \| 'max') \| number` | ✅ |

`Settings` interface（持久化到 settings.json 的格式）不含 `max`，但运行时 `EffortLevel` 类型含 `max`。当前写入 `max` 的行为在 settings.json 层面处于官方 schema 的空白地带。**已统一为 `xhigh`** 以消除歧义。

### 关键更正：`autoCompactWindow` 是合法 SDK 字段

**原文档（v1）错误判定为 APP 专属**。SDK 源码 L4632：
```typescript
/**
 * Auto-compact window size
 */
autoCompactWindow?: number;
```

该字段通过 `writeGlobalSettings()` 写入 settings.json 是**正确行为**，SDK 原生读取。CLAUDE.md 中相关禁令已修正。

## 修正后的污染清单

### 真正需迁出的字段（5 个）→ 全部已迁移

| 字段 | 污染类型 | SDK 存在？ | 目标存储 | 状态 |
|------|:---:|:---:|------|:---:|
| `permissionPolicy` | 字段污染 | ❌ | `claude-internal.json` | ✅ |
| `pathToClaudeCodeExecutable` | 字段污染 | ❌ | `claude-internal.json` | ✅ |
| `theme` | 字段污染 | ❌ | `theme.json` | ✅ |
| `gitMirrorUrl` (CodeX 侧) | 字段污染 | ❌ | `claude-internal.json` | ✅ |
| `language` | **语义冲突** | ✅ | App UI 语言迁出，SDK 回复语言保留 | ✅ |

### 值纠正（1 个）→ 已修正

| 字段 | 当前 | 目标 | 理由 | 状态 |
|------|------|------|------|:---:|
| `effortLevel` | `"max"` | `"xhigh"` | `Settings` interface 不含 `max`，走安全路线 | ✅ |

### 保留不动（1 个）

| 字段 | 说明 |
|------|------|
| `autoCompactWindow` | SDK 合法字段，当前实现正确 |

---

## 已实施（T118/T119，2026-06-16）

### 1. `permissionPolicy` → `internalConf.set('claudePermissionPolicy', val)` ✅

- **调用链**：APISetting.vue → `claudeSetPermissionPolicy` IPC → `confSet` → `internalConf`
- **SDK 对比**：SDK 使用 `permissions.allow/deny/ask` 数组 + `permissions.defaultMode`，无 `permissionPolicy` 字段
- **实施**：`confSet` 中 `internalConf.set('claudePermissionPolicy', val); return`，不碰 settings.json

### 2. `language` → `internalConf.set('claudeLanguage', val)` ✅

- **调用链**：APISetting.vue → `claudeSetLanguage` IPC → `confSet` → `internalConf`
- **问题**：字段名合法，但 App 用它做 UI 语言（zh-CN/en-US），SDK 用它做 Claude 回复语言 + 语音听写语言。写入同一字段互相干扰。
- **实施**：`confSet` 中 `internalConf.set('claudeLanguage', val); return`，与 SDK `language` 字段分离

### 3. `pathToClaudeCodeExecutable` → `internalConf.set('claudeExecutablePath', val)` ✅

- **调用链**：APISetting.vue → `claudeSetExecutablePath` IPC → `confSet` → `internalConf`
- **SDK 对比**：无此字段
- **实施**：`confSet` 中 `internalConf.set('claudeExecutablePath', val); return`

### 4. `autoCompactWindow` → 无需改动 ✅

- **原判定（v1）**：误判为 APP 专属
- **更正（v2）**：SDK 原生字段 (`sdk.d.ts:4632`)，当前实现正确，保留

### 5. `effortLevel` → 修正为 `xhigh` ✅

- **调用链**：SelectModel.vue / useSlashCommands.js → `claudeSetEffortLevel` IPC → `confSet` → `s.effortLevel`
- **实施**：全代码 `max`→`xhigh`（SelectModel, ProviderForm, APISetting, SlashPopup, useSlashCommands 共 7 处），handler 白名单同步，旧值 `max` 启动时自动升迁

### 6. `theme` → 启动迁移清理 ✅

- 当前代码已正确使用 `%APPDATA%/mindcraft-agent/theme.json`
- **实施**：启动迁移自动删除 settings.json 中旧 theme

### 7. `gitMirrorUrl` → `internalConf.set('gitMirrorUrl', val)` ✅

- **位置**：`codexAgent.js` `getGitMirrorUrl()` 改为从 `claude-internal.json` 读取，fallback settings.json

### 8. 死代码清理 ✅

- `APISetting.vue` `writeSettingsJson()` — 已删除
- `claudeAgent.js` `claude-write-settings-json` IPC handler — 已删除
- `preload/index.js` `claudeWriteSettingsJson` bridge — 已删除

### 9. 补全 API ✅

- `claude-set-model` / `claude-set-selected-tier` IPC handlers — 已注册
- `preload/index.js` `claudeSetModel` / `claudeSetSelectedTier` bridges — 已注册

### 10. 一次性启动迁移 ✅

- 启动时读取 settings.json → 迁移 app 专属字段到 `claude-internal.json` → 修正 `effortLevel:max→xhigh` → 写回干净的 settings.json
- 幂等：第二次启动 internalConf 已有值，跳过全部迁移

### 11. confGet 回退链 ✅

```
internalConf.get('claudePermissionPolicy') → s.permissionPolicy → 'ask'
internalConf.get('claudeLanguage')          → s.language          → 'zh-CN'
internalConf.get('claudeExecutablePath')    → s.pathToClaudeCodeExecutable → ''
```

---

## 正确架构

```
App 专属配置 → claude-internal.json（internalConf）
             或 app-settings.json（settingsStore）
             或 theme.json（主题）

SDK 配置     → ~/.claude/settings.json
              仅写入 SDK Settings interface 支持的字段
```

**关键原则**：
- 不写入 SDK Settings interface 不存在的字段
- 写入 SDK 字段时使用 SDK 认可的值域
- `language` 字段语义冲突：App UI 语言已迁到 `claude-internal.json`，与 SDK 的回复语言分离
- 所有对 `~/.claude/settings.json` 的读写通过统一入口（`confSet`/`confGet`），禁止新增直接读写路径

## 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1 | 2026-06-15 | 初版，基于网络文档 |
| v2 | 2026-06-16 | 基于 `sdk.d.ts` 重新验证；纠正 `autoCompactWindow` 判定；纠正 `effortLevel:max` 判定 |
| v3 | 2026-06-16 | T118/T119 实施完成：所有污染字段已迁移，effortLevel 已修正，死代码已清理，API 已补全 |
