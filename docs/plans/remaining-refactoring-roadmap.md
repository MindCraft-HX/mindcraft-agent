# MindCraft Agent 后续重构路线图

> 供 CodeX 全局讨论评估。涵盖 R09 完成后所有剩余可重构区域，按风险/收益排序。

## 当前状态（R01-R09 完成后）

```
已完成 16 个模块提取 + 6 个 contract tests + 1 个 IPC 去重护栏

codexAgent.js  4473 行  (setup ~2095 行 + 模块级 helpers ~2321 行)
claudeAgent.js 3647 行  (setup ~2815 行 + 模块级 helpers  ~778 行)
─────────────────────────────────────────────────────────
合计           8120 行
```

核心问题不再是 setup 函数太大（R09 已处理），而是：
- **模块级 helper 函数物理上堆在同一文件**（codexAgent 有 2321 行 helper，已从 setup 提出但没搬出去）
- **Skills/Plugin 在两个 agent 里几乎一模一样**（~700 行重复代码）
- **两个 agent 各有一套 settings/config 读写**（Conf vs settings.json）

---

## 区域总览

| 区域 | 当前位置 | 估计行数 | 风险 | 收益 | 建议顺序 |
|------|---------|:---:|:---:|:---:|:---:|
| A. codex 模块级 helper 搬迁 | codexAgent.js 顶部 | ~1800 | 🟢 低 | 🟢 高 | 1 |
| B. claude 模块级 helper 搬迁 | claudeAgent.js 顶部 | ~500 | 🟢 低 | 🟡 中 | 2 |
| C. Skills 去重共享 | 两文件 setup 体内 | ~700 | 🟡 中 | 🟢 高 | 3 |
| D. setup 体剩余 handler 提取 | 两文件 setup 体内 | ~250 | 🟢 低 | 🟡 中 | 4 |
| E. Plugin 管理提取 | codexAgent setup 体内 | ~200 | 🟡 中 | 🟡 中 | 5 |
| F. settings/config 存储收敛 | 两文件各处 | ~300 | 🟡 中 | 🟡 中 | 6 |
| G. 通道命名大一统 | 两文件全部 IPC | — | 🔴 高 | 🟡 中 | 7 (最后) |
| H. 流循环 + 生命周期 | setup 体核心 | ~1500 | ⛔ 不拆 | — | — |

---

## A. codex 模块级 helper 搬迁 🟢

**现状**：codexAgent.js 的 2321 行 helper 函数定义在 setup 函数之前，结构上已经独立，只是物理上堆在同一文件。

**内容拆解**：

| 子模块 | 行数 | 包含函数 |
|--------|:---:|---------|
| `codex/sdkStore.js` | ~150 | `loadCodexSdk`, `resetCodexSdkPromise`, `findGlobalCodexPath`, `isInstallingCodex`, `setInstallingCodex` |
| `codex/contextWindow.js` | ~100 | `getCodexContextWindowForModel`, `toPositiveNumber`, `estimateCodexCostUsd`, context 估算逻辑 |
| `codex/turnMetrics.js` | ~200 | `extractLatestCodexLiveTurnMetricsFromJsonl`, `extractLatestCodexHistoryTurnSnapshot`, metrics 计算 |
| `codex/messageTools.js` | ~200 | `buildMessageDedupKey`, `pushHistoryMessage`, `attachTurnTokensToLastAssistantMessage`, `buildToolMessageFromItem`, `normalizeCodexToolName` 等 |
| `codex/sessionStore.js` | ~150 | `listSessionsByCwd`, `findCodexSessionFileByThreadId`, `deleteCodexSessionRunIfCurrent`, `shouldEmitCodexSessionTerminalSignals` |
| `codex/tokenFlush.js` | ~200 | `flushActiveTurnTokens`, `collectMessage`, `tryFlushCall` (Phase 4 token flush pipeline) |
| `codex/pageReader.js` | ~100 | `readFirstLine`, `safeJsonParse`, `ensureDirSync`, `getSessionLoadLogFile` |
| `codex/donePayload.js` | ~100 | `resolveCodexDoneReasonFromError`, `buildCodexAgentDonePayload` |

**风险**：🟢 零。函数签名不变，只改 import 路径。R09 已验证此模式。

**收益**：
- codexAgent.js 从 4473 → ~2600 行
- 每个 helper 文件 100-200 行，职责单一
- helper 可以独立加单测（当前嵌在 agent 文件里测不了）

---

## B. claude 模块级 helper 搬迁 🟢

**现状**：claudeAgent.js 有 778 行 helper，比 codex 少得多但同样值得搬。

| 子模块 | 行数 | 包含函数 |
|--------|:---:|---------|
| `claude/settingsStore.js` | ~250 | `readSystemSettingsJson`, `writeSystemSettingsJson`, `confGet`, `confSet`, T118 迁移逻辑, `normalizeClaudeEffortLevel` |
| `claude/historyReader.js` | ~150 | `readJsonlPageLinesFromTail`, `buildClaudeHistoryTurnTokensFromEntry`, `annotateClaudeHistoryEntryWithTurnTokens` |
| `claude/sessionHelper.js` | ~100 | session 发现、recent sessions 排序、Model Tier 匹配 |

**风险**：🟢 零。

**收益**：claudeAgent.js 从 3647 → ~3100 行。

---

## C. Skills 去重共享 🟡

**现状**：两个 agent 的 Skills 管理几乎是复制粘贴：

```
codexAgent.js L3613-3830:  Skills 市场、Git clone、enable/disable、marketplace
claudeAgent.js L3367-3550:  Skills 市场、Git clone、enable/disable、marketplace
```

核心差异只有：
- Channel 前缀不同（`codex-skill-*` vs `claude-skill-*`）
- 存储路径不同（CODEX_CONFIG_DIR vs CLAUDE_CONFIG_DIR）
- Skills 命令名不同（codex vs claude CLI）

**方案**：

```js
// shared/skillsIpc.js
function registerSkillsIpc(ipcMain, {
  provider,           // 'codex' | 'claude'
  configDir,          // skills 配置目录
  skillsMarketDir,    // 市场克隆目录
  cliSkillCmd,        // CLI 命令 (如 'codex skill' 或 'claude mcp')
  cloneSkillRepo,     // Git clone 函数 (可共享)
  readInstalledSkills,// 读取已安装列表
  writeInstalledSkills,// 写入已安装列表
  lt,                 // 国际化
}) {
  ipcMain.handle(`${provider}-skill-list`, ...)
  ipcMain.handle(`${provider}-skill-install`, ...)
  ipcMain.handle(`${provider}-skill-uninstall`, ...)
  ipcMain.handle(`${provider}-skill-enable`, ...)
  ipcMain.handle(`${provider}-skill-disable`, ...)
  ipcMain.handle(`${provider}-skill-market`, ...)
}
```

**风险**：🟡 中。差异点需要参数化，如果参数化不够会导致后续维护负担。建议先做 A/B（让两个 agent 文件干净），再做 C（diff 清晰可 review）。

**收益**：
- 消除 ~700 行重复 → ~350 行共享模块（净减 ~350）
- Skills bug 改一处生效两处

---

## D. setup 体剩余 handler 提取 🟢

**现状**：R09 之后两个 setup 函数里还残留少量可以机械搬移的 handler。

| 子模块 | 来源 | 行数 | 通道 |
|--------|------|:---:|------|
| `codex/panelStateIpc.js` | codexAgent setup | ~80 | panel state 持久化 CRUD |
| `codex/configTomlIpc.js` | codexAgent setup | ~60 | CodeX TOML 配置读/写 |
| `claude/permissionIpc.js` | claudeAgent setup | ~40 | 权限策略管理 |

**风险**：🟢 零。纯 CRUD。

---

## E. Plugin 管理提取 🟡

**现状**：codexAgent 里的 Plugin 管理（L3972-4190, ~200 行）涉及：
- marketplace 读取/缓存
- `codex plugin add/remove/list` CLI 调用
- CLI 输出解析（表格解析、fallback 缓存）

**风险**：🟡 中。
- 依赖 CLI 输出格式（格式变化会 break）
- 有模块级缓存（`_pluginListCache`），迁移需保持缓存语义
- 依赖 TOML 解析（需先完成 A 中的 TOML helpers 提取）

**建议**：等 A 和 D 完成后再做。

---

## F. settings/config 存储收敛 🟡

**现状**：两个 agent 各有一套配置读写：

| | CodeX | Claude |
|---|------|--------|
| 存储方式 | `electron-conf` (`mindcraft-codex`) | `internalConf` (Conf + JSON fallback) + `~/.claude/settings.json` |
| 读写函数 | 散落在各处 | `confGet`/`confSet`/`readSystemSettingsJson` |
| 迁移逻辑 | `codex-import-legacy-config` | T118 迁移 |

**问题**：
- `electron-conf` 打包后有路径/权限问题，Claude 侧已有 JSON fallback，CodeX 侧没有
- 两边的 get/set 模式不统一

**方案**：提取共享 `shared/configStore.js`，统一 Conf + JSON fallback 模式。

**风险**：🟡 中。涉及持久化存储，改坏了可能丢用户配置。需要先加 characterization tests。

---

## G. 通道命名大一统 🔴

**现状**：

```
CodeX 通道:  codex-get-key, codex-set-key, codex-validate-key, ...
Claude 通道: claude-validate-key, claude-freeze-diag-*, ...
共用通道:   chat-list-sessions, chat-save-session, ...
```

**问题**：
- 语义相同的操作前缀不同（`codex-get-key` vs 如果 Claude 也有就是 `claude-get-key`）
- 共用通道无前缀（`chat-*`），不知道属于哪个 agent
- preload 侧需要维护两套 channel 白名单

**方案选项**：

| 方案 | 描述 | 风险 |
|------|------|:---:|
| 统一前缀 `agent:scope:action` | 如 `agent:codex:config.get-key`, `agent:chat:session.list` | 需要改 preload + renderer，影响面大 |
| 保持现状 + registry 约束 | 不改命名，但用 registry 强制新通道必须注册 | 低风险，但治标不治本 |
| 抽象层包装 | 在 preload 侧加一层 adapter，main 侧不改 | 只改 renderer 调用方式 |

**风险**：🔴 高。
- 改 IPC 通道名需要同时改 main + preload + renderer 三侧
- 没有编译时检查，改漏了就静默失效
- 当前项目没有 E2E 测试覆盖 IPC 调用

**建议**：最后做，且只在有 E2E 测试保护后才动手。

---

## H. 永不拆区域 ⛔

以下代码**永远不会被拆分**：

| 区域 | 原因 |
|------|------|
| `codex-agent-query` / `claude-agent-query` stream loop | 核心执行路径。abort、event emit、metrics polling、session 生命周期全部耦合在一起。拆分只增加间接层，不降低认知复杂度。 |
| `agentSessions` / `codexSessions` 状态管理 | 这些 Map 被 stream loop 的每个阶段读写，提取后需要跨文件共享可变状态，比不拆更危险。 |
| Resume / abort / done 逻辑 | 分散在 stream loop 的 try/catch/finally 中，拆开会破坏错误处理拓扑。 |

---

## 推荐执行顺序

```
第 1 批（零风险，立即收益）
  A1-A8: codex 模块级 helper 搬迁
  B1-B3: claude 模块级 helper 搬迁
  D1-D3: setup 体剩余 handler 提取
  → 预计 -2300 行从 agent 文件移除，+14 个新模块

第 2 批（中等风险，需先完成第 1 批）
  C1-C2: Skills 共享化
  → 消除 ~350 行重复

第 3 批（中等风险，需 characterization tests）
  E: Plugin 管理提取
  F: 配置存储收敛
  → 最后的结构优化

第 4 批（高风险，需 E2E tests）
  G: 通道大一统
  → 仅在有充分测试覆盖后考虑
```

---

## 预期终态

```
第 1 批完成后:
  codexAgent.js  ~2600 行 (imports 150 + helpers 400 + setup ~2050)
  claudeAgent.js ~3100 行 (imports 100 + helpers 200 + setup ~2800)

第 2 批完成后:
  codexAgent.js  ~2300 行
  claudeAgent.js ~2900 行

第 3 批完成后:
  codexAgent.js  ~2000 行 (stream loop ~800 + lifecycle ~400 + remaining ~800)
  claudeAgent.js ~1700 行 (stream loop ~700 + lifecycle ~300 + remaining ~700)

硬地板（永不拆）:
  stream loop + lifecycle ≈ 1500 行/文件
  两个 agent 文件各自 ~2000 行就是最优态
```

---

## 未覆盖的风险

1. **没有 E2E 测试** — 所有验证靠 contract tests + 人工。第 4 批（通道大一统）在没有 E2E 的情况下不应启动。
2. **Preload 通道白名单** — 目前 preload 侧用白名单暴露 IPC 通道。新增通道需要同步更新 preload，漏了就是静默失效。
3. **Renderer 侧耦合** — 部分 Vue composable 直接 import electron 模块路径（如 `normalizeReasoningEffort.cjs`）。跨目录移动文件可能破坏这些引用。
4. **electron-conf 平台兼容性** — 打包后路径/权限问题只在 Windows 打包环境复现，macOS 开发环境不可见。
