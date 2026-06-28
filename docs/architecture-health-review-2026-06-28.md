# 架构健康审查与重构执行方案 2026-06-28

> 基于全量代码审计与当前代码状态复核的架构评估。供 ClaudeCode + CodeX 双 Agent 对齐后执行。
>
> 审计方法：文件规模统计、重复代码检测、IPC 通道盘点、依赖健康度、测试覆盖率、代码质量扫描、已完成计划复核。
>
> 本文是执行入口，不是一次性大重构授权。执行时必须遵守 `AGENTS.md` / `CLAUDE.md` 的目录边界、数据边界、Token Metrics 红线和会话身份模型。

---

## 0. 给执行 Agent 的硬性说明

这份文档的目标是降低回归率，而不是追求“看起来更干净”的大搬迁。

执行时按以下原则推进：

1. **每个阶段都必须保持行为不变，除非该阶段明确写了行为修复目标。**
2. **先补护栏，再拆模块。** 没有测试或契约扫描保护的拆分，容易把已有会话、metrics、IPC 问题放大。
3. **每次只改一个边界。** 不要在同一个 PR/补丁里同时改 IPC 命名、目录结构、业务逻辑和 UI 行为。
4. **ClaudeCode 与 CodeX 的共享逻辑只能放一份。** 新增共享逻辑优先进入 `packages/agent/src/components/agentCommon/**` 或 `packages/agent/electron/**` 的明确领域模块。
5. **不要把 MindCraft 自有数据写入 `~/.claude`、`~/.codex`、项目 `.claude`、项目 `.codex`。**
6. **Token Metrics 当前回合数据只能走 `normalizer -> TurnStore -> snapshot -> consumer`。** 前端不得解释 provider 原始 usage 字段。
7. **读完整函数再改大文件。** 对 `claudeAgent.js`、`codexAgent.js`、两个 `index.vue` 只做小步、可验证补丁。
8. **如果同一函数连续三次回归，停止打补丁，改为重写边界并补契约测试。**

执行 Agent 每完成一个阶段，应在本文 “执行记录” 中追加日期、改动摘要、验证命令和遗留风险。

---

## 1. 总体判断

**架构方向正确，处于“中等技术债务”阶段。**

核心设计是合理的：

- `packages/agent/` 作为共享 Agent 层。
- `Agent Registry` 以数据驱动新增 Agent 类型。
- `Token Metrics` 已经形成 `normalizer -> TurnStore -> snapshot` 的契约链路。
- `chatKey / cliSessionId / filePath` 三层会话身份模型已经文档化。
- `codeHub` 正在成为 ClaudeCode + CodeX 的统一编程入口。

当前主要问题不是底层方向错，而是执行层面存在三类债务：

1. **巨型文件导致局部修改不可控。**
2. **ClaudeCode / CodeX renderer 与部分 electron 逻辑重复，修一边容易漏另一边。**
3. **测试和 IPC / log 护栏不足，很多错误无法在提交前暴露。**

因此，本方案建议采用“护栏优先、叶子模块先拆、共享逻辑逐步收敛”的路线。

---

## 2. 当前状态复核

### 2.1 巨型文件仍然存在，但行数已有变化

复核时间：2026-06-28。

| 文件 | 当前行数约值 | 风险 |
|------|:----:|------|
| `packages/agent/electron/codexAgent.js` | 4,689 | 极高：IPC 注册、环境检测、Skills、Plugins、配置、Chat 流、CLI 管理、通知混在一起 |
| `packages/agent/electron/claudeAgent.js` | 3,724 | 高：IPC 注册、环境检测、Skills、Plugins、配置、Chat 流、通知混在一起 |
| `packages/agent/src/components/claudeCode/index.vue` | 3,708 | 高：模板、状态、流处理、历史恢复、Tab、工具栏、metrics 生命周期混在一起 |
| `packages/agent/src/components/codeX/index.vue` | 2,963 | 高：模板、状态、流处理、历史恢复、Tab、Session routing 混在一起 |
| `electron/main.js` | 603 | 中：窗口、菜单、IPC、生命周期混在一起 |

原审查中的 16,260 行判断方向仍然成立，但具体行数已经变化。后续执行时应以当前代码为准，不要依赖旧行号。

### 2.2 Renderer Convergence 已部分完成，不能重复执行旧计划

`docs/plan/2026-06-27-renderer-convergence.md` 的 2026-06-28 执行记录显示，以下工作已经完成：

- 新增 `packages/agent/src/components/agentCommon/composables/useAgentMetricsController.js`。
- CodeX status bar metrics 已接入共享 controller。
- ClaudeCode status bar merge/timer/new-turn/reset 已接入共享 controller。
- 新增 `tests/agent-metrics-controller.test.mjs`。
- ClaudeCode / CodeX 重复的 `StatusBarMetrics.vue` 已合并到 `packages/agent/src/components/agentCommon/components/StatusBarMetrics.vue`。
- 新增 renderer convergence contract test，防止重复引入两个 `StatusBarMetrics.vue`。
- CodeX running 状态下 stale history metrics 的若干回归已补测试。

因此，本文后续不再把 “Renderer Convergence” 当作完整未开始任务，而是拆为剩余收口：

- first-hydrate / active-tab restore 在 ClaudeCode 与 CodeX 之间继续统一。
- footer 和 status bar consumer 增加直接测试。
- 避免把 panel state 脏 metrics 重新喂给当前回合 UI。

### 2.3 测试脚本仍然是最大护栏缺口

当前 `package.json` 的 `npm test` 仍硬编码约 25 个测试文件。

仓库中实际存在约 100 个 `*.test.mjs` / `*.test.cjs` / `*.test.js` 文件，很多 session、metrics、codex、claude、renderer convergence 相关测试未进入默认测试。

风险：

- 重构前看起来“测试通过”，实际只跑了少数测试。
- 边界测试没有成为默认护栏，重复问题会回归。
- 一次性把 `npm test` 改成全量 glob 又可能引爆已知失败或环境依赖测试，影响开发节奏。

结论：测试治理必须前置，但不能粗暴一次性替换默认 `npm test`。

### 2.4 重复逻辑仍需收敛

当前仍可见的重复或半重复点：

| 模块 | 当前状态 | 建议 |
|------|------|------|
| ESM protocol bridge | `claudeAgent.js` / `codexAgent.js` 各有 `_getAgentProtocol()` | 抽到 electron 共享 helper |
| MindCraft settings 读写 | `claudeAgent.js` 内有本地实现，`diagnosticsFileUtils.js` 也有相似能力 | 优先复用 / 扩展 `diagnosticsFileUtils.js`，避免新增第三套 |
| Tab 管理 | `useClaudeTabs.js` / `useCodexTabs.js` 仍分离 | 抽共享 composable，但用 adapter 参数化，不要只靠 `agentType` switch |
| History 恢复 | `useClaudeHistory.js` / `useCodexHistory.js` 仍分离 | 抽共享生命周期与持久化规则，provider 差异外置 |
| Agent stream | 差异较大 | 暂不强行合并，只抽共享小工具和契约测试 |
| IPC channel | preload/main 大量字符串散落 | 建 channel registry + 对账测试 |
| console.log | 主进程和 renderer 仍有存量 | 建 logger facade，新代码禁裸 `console.log`，存量渐进替换 |

---

## 3. 推荐执行顺序

建议顺序如下。不要跳过第 1 阶段直接拆大文件。

### 3.1 Codex 复核建议摘要

Codex 对本方案的复核结论：

**会按本文方向重构，但必须把它当作“重构治理路线”，不是一次性照单全做的大重构清单。**

当前项目最大的风险不是某个模块单独写得不够干净，而是：

1. 边界漂移：ClaudeCode / CodeX / codeHub / host 层职责容易互相渗透。
2. 测试护栏不足：很多 session、metrics、IPC 回归不能在提交前暴露。
3. 双 Agent 逻辑分叉：修 ClaudeCode 不等于修 CodeX，反之亦然。
4. 巨型文件放大风险：局部改动需要理解过多上下文，容易引入旁路回归。

因此，执行时应坚持以下节奏：

1. **先做测试护栏。** 不先拆 `codexAgent.js` / `claudeAgent.js`。没有 `test:contract`、IPC 对账、no-console、脏 panel state metrics 回归测试前，直接拆大文件风险过高。
2. **先抽低风险共享件。** `_getAgentProtocol()`、MindCraft settings helper、logger facade、IPC channel 常量这类改动行为变化小，适合在大拆分前完成。
3. **不做 ClaudeCode / CodeX 的大一统合并。** 共享生命周期、UI consumer 契约和持久化规则；provider stream、SDK/CLI 事件解释、权限模型仍保持 provider-specific adapter。
4. **巨型文件只从叶子模块拆起。** 优先拆 config、skills、plugins、environment。不要第一刀动 chat stream、queue、abort、done、TurnStore 连接点。
5. **Renderer Convergence 只做剩余收口。** metrics controller 和共享 `StatusBarMetrics.vue` 已经存在，不要重做架构。下一步只补 first-hydrate、active-tab restore、footer/statusbar consumer 测试。
6. **依赖升级和 `electron/main.js` 拆分靠后。** 它们有价值，但不是当前 session/metrics/IPC 回归的主因，必须单独执行、单独验证。

推荐执行批次：

| 批次 | 内容 | 原则 |
|:--:|------|------|
| 1 | 测试脚本治理 + contract tests + IPC/no-console 护栏 | 先让回归可见 |
| 2 | protocol bridge、settings helper、logger facade | 低风险共享基础设施 |
| 3 | IPC registry 小范围落地 | 先覆盖新增和高频 channel |
| 4 | Tab / History adapter 化收敛 | 共享生命周期，不吞 provider 差异 |
| 5 | `codexAgent.js` / `claudeAgent.js` 叶子模块拆分 | config/skills/plugins/environment 优先 |
| 6 | Renderer 剩余收口和组件级测试 | 不重做已有 convergence |
| 7 | `electron/main.js` 拆分、Vite 5 升级 | 单独维护窗口处理 |

执行方式必须是小步、可回滚、可测试的垂直切片。不要用“大一统式”重构处理这个项目。

| 阶段 | 事项 | 预估 | 收益 | 风险 |
|:--:|------|:---:|------|:--:|
| 1 | 测试与架构护栏前置 | 0.5-1 天 | 让后续重构有可验证边界 | 低 |
| 2 | 共享基础设施：protocol bridge、settings helper、logger facade | 0.5-1 天 | 消除低风险重复，统一日志入口 | 低 |
| 3 | IPC channel registry + preload/main 对账测试 | 1 天 | 消灭 channel 拼写静默失败 | 中低 |
| 4 | Tab / History composable 收敛 | 1 天 | 消除 renderer 生命周期重复 | 中 |
| 5 | 巨型 electron 文件 Phase 1：拆叶子模块 | 2-3 天 | 降低 `codexAgent.js` / `claudeAgent.js` 修改风险 | 中 |
| 6 | Renderer Convergence 剩余收口 | 1-2 天 | 解决 first-hydrate / active-tab restore 分叉 | 中 |
| 7 | `electron/main.js` 拆分 | 0.5 天 | host 入口可读性提升 | 低 |
| 8 | Vite 5 升级 | 0.5-1 天 | 解除生态落后和 Sass legacy warning | 中低 |

---

## 4. 阶段 1：测试与架构护栏前置

### 4.1 目标

在开始大规模移动代码前，先让关键边界可以被命令验证。

本阶段不做业务行为重构。

### 4.2 推荐改动

在 `package.json` 中新增测试脚本，而不是立即替换现有 `test`：

```json
{
  "scripts": {
    "test": "保留现有硬编码列表，短期不动",
    "test:all": "node --test \"tests/**/*.test.{mjs,cjs}\" \"packages/agent/electron/**/*.test.js\" \"packages/agent/electron/**/*.test.cjs\"",
    "test:contract": "node --test tests/agent-*.test.mjs tests/agent-*.test.cjs tests/*boundary*.test.cjs tests/*convergence*.test.mjs tests/*metrics*.test.mjs tests/*metrics*.test.cjs tests/*session*.test.mjs tests/*session*.test.cjs packages/agent/electron/tokenMetrics/*.test.cjs"
  }
}
```

注意：

- Windows shell 对 glob 的展开行为和 POSIX 不同，Node test runner 是否能直接吃这些 glob 需要本地验证。
- 如果 glob 在 Windows 下不稳定，改成一个 `tests/run-contract-tests.cjs` 小脚本，用 Node 自己扫描文件后调用 `node --test`。
- 不要在本阶段为了让 `test:all` 通过而顺手重写业务逻辑。先记录失败清单。

### 4.3 必补测试

#### 4.3.1 IPC channel 对账测试

新增测试建议：

```text
tests/ipc-channel-registry.test.cjs
```

测试目标：

- 扫描 preload 暴露的 `ipcRenderer.invoke/send/on` channel。
- 扫描 main/electron 侧 `ipcMain.handle/on` channel。
- 扫描 registry 中声明的 channel。
- 校验新增 channel 必须在 registry 中出现。
- 校验 registry 中标记为 required 的 preload channel 必须有 main handler。

第一阶段可以只做 “registry 中 channel 与新代码一致” 的软约束，不要立刻要求所有历史 channel 全部迁移。

#### 4.3.2 主进程 no-console 测试

新增测试建议：

```text
tests/no-console-main-process.test.cjs
```

测试目标：

- 禁止新增 `packages/agent/electron/**`、`electron/**` 中的裸 `console.log`。
- 允许测试文件中的 `console.log`。
- 允许带白名单注释的历史 log，但白名单必须集中维护，不能散落。

建议策略：

- 第一阶段只检查新增 logger 相关目录和后续改到的文件。
- 第二阶段逐步扩大范围。

#### 4.3.3 Panel state 脏 metrics 回归测试

已有相关测试，但建议补一个更明确的 renderer consumer 层测试：

```text
tests/statusbar-dirty-panel-state.test.mjs
```

测试目标：

- 构造带 `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens/durationMs/costUsd` 的旧 panel state。
- 恢复 session。
- 断言当前回合 StatusBar 不直接显示这些旧字段。
- 断言 footer/history 只消费 final/history snapshot。

### 4.4 验收命令

本阶段完成后至少运行：

```powershell
npm test
npm run test:contract
```

如果新增了 `test:all`，可以运行但不要求立刻全绿：

```powershell
npm run test:all
```

若 `test:all` 失败，需要把失败测试、失败原因、是否环境依赖记录到本文执行记录中。

---

## 5. 阶段 2：共享基础设施

### 5.1 目标

先抽取低风险、几乎纯函数/纯包装的重复逻辑，为后续大文件拆分降低阻力。

### 5.2 抽取 Agent Protocol bridge

当前：

- `packages/agent/electron/claudeAgent.js` 有 `_getAgentProtocol()`。
- `packages/agent/electron/codexAgent.js` 有 `_getAgentProtocol()`。

建议新增：

```text
packages/agent/electron/agentProtocolBridge.js
```

导出：

```js
async function getAgentProtocol()
module.exports = { getAgentProtocol }
```

要求：

- 保持 lazy import 行为不变。
- 不改变调用点 await / then 语义。
- 不改变 `agentProtocol.mjs` 的导出。
- 不把 renderer 逻辑引入 electron helper。

执行步骤：

1. 新增 helper。
2. ClaudeCode 替换 `_getAgentProtocol()` 调用。
3. CodeX 替换 `_getAgentProtocol()` 调用。
4. 删除两个文件内的重复函数。
5. 跑相关测试。

验收：

```powershell
npm run test:contract
node --test tests/agent-protocol.test.mjs tests/agent-event-emit.test.mjs tests/agent-notification-gate.test.mjs
```

### 5.3 收敛 MindCraft settings helper

当前：

- `claudeAgent.js` 内有 `readMindCraftSettings()` / `writeMindCraftSettings()`。
- `packages/agent/electron/diagnosticsFileUtils.js` 已有类似函数。

建议：

- 优先扩展 `diagnosticsFileUtils.js` 或改名为更通用的配置文件 helper。
- 不要新增第三套 `settings.js`，除非确认 `diagnosticsFileUtils.js` 职责无法承载。

推荐方向：

```text
packages/agent/electron/mindcraftSettings.js
```

或保留现文件：

```text
packages/agent/electron/diagnosticsFileUtils.js
```

导出能力至少包括：

```js
readMindCraftSettings(options)
writeMindCraftSettings(settings, options)
getDiagnosticsEnabled(options)
setDiagnosticsEnabled(enabled, options)
```

要求：

- 写入位置必须是 MindCraft 自有配置位置，不得写 `~/.claude/settings.json`。
- API key、token、auth 信息不得打 log。
- 保持历史 diagnostics 行为不变。

验收：

```powershell
node --test packages/agent/electron/diagnosticsFileUtils.test.js
npm run test:contract
```

### 5.4 Logger facade

不要只新增裸 `logger.js` 后让代码自由调用。建议设计为 facade：

```text
packages/agent/shared/logger.js
```

建议接口：

```js
const logger = createLogger(scope)

logger.debug(...)
logger.info(...)
logger.warn(...)
logger.error(...)
```

最低要求：

- `error` 默认始终输出。
- `warn` 默认输出。
- `info` 在 dev 或 diagnostics enabled 时输出。
- `debug` 仅 dev / `LOG_LEVEL=debug` / diagnostics enabled 时输出。
- 必须脱敏常见敏感字段：`apiKey`、`key`、`token`、`authorization`、`password`、`secret`。
- 不能打印 API key 前缀、长度或 hash，除非有明确安全评估。

与 diagnostics 的关系：

- logger facade 可以独立存在。
- diagnostics enabled 应影响 logger 输出级别。
- 不要让业务模块直接依赖 diagnostics 文件细节。

迁移策略：

- 新代码必须用 logger。
- 改到的主进程文件顺手替换裸 `console.log`。
- 存量不要求一次清零。

验收：

```powershell
npm run test:contract
node --test tests/no-console-main-process.test.cjs
```

---

## 6. 阶段 3：IPC channel registry

### 6.1 目标

防止 preload/main channel 拼写错误、漏注册、重复注册导致静默失败。

### 6.2 重要决策：先用 JS，不先引入 TS

结论：**第一阶段使用 JS registry，不引入 TypeScript。**

原因：

- 当前项目 JS 为主。
- 为了 IPC registry 引入 TS 编译链会扩大重构面。
- IPC 最大风险是字符串散落和 preload/main 不一致，JS registry + 测试已经能覆盖大部分风险。

后续如果项目整体 TS 化，再把 registry 升级为 TS 类型联合。

### 6.3 文件建议

新增：

```text
packages/agent/shared/ipcChannels.js
```

建议结构：

```js
const CLAUDE_CHANNELS = Object.freeze({
  GET_KEY: 'claude-get-key',
  SET_KEY: 'claude-set-key',
  CHAT_SEND: 'claude-chat-send'
})

const CODEX_CHANNELS = Object.freeze({
  GET_KEY: 'codex-get-key',
  CHAT_SEND: 'codex-chat-send'
})

const CORE_CHANNELS = Object.freeze({
  GET_SETTING: 'get-setting',
  SET_SETTING: 'set-setting'
})

module.exports = {
  CLAUDE_CHANNELS,
  CODEX_CHANNELS,
  CORE_CHANNELS
}
```

注意：

- 第一阶段不要顺手把历史 channel 改名为 `claude:chat:send`。
- channel 值保持现状，先消灭散落字符串。
- 如果未来要改命名格式，单独做兼容迁移。

### 6.4 迁移顺序

推荐只迁移近期会改到的 channel，不要求一次搬完 120+ 个。

顺序：

1. 先迁移新增/修改中的 channel。
2. 再迁移 Agent bridge 高频 channel。
3. 最后迁移 host-level channel。

每迁移一组，必须同时改：

- `packages/agent/preload/index.js`
- `packages/agent/electron/**`
- 如涉及 host，则改 `electron/preload.js` / `electron/main.js` / `electron/mainModules/**`
- 对应测试白名单或 registry test

### 6.5 注册 helper

可选新增：

```text
packages/agent/electron/registerIpcHandler.js
```

目标：

- 防重复注册。
- 在 dev/test 下对未知 channel 报警或抛错。
- 统一 handler 包装错误日志。

不要在第一阶段强制所有 `ipcMain.handle/on` 都通过 helper。先给新代码用。

### 6.6 验收

```powershell
npm run test:contract
node --test tests/ipc-channel-registry.test.cjs
```

手工检查：

- 新增 channel 不应再出现裸字符串。
- preload 暴露能力和 main handler 成对出现。
- 没有重命名历史 channel 导致旧 renderer 调用失效。

---

## 7. 阶段 4：Tab / History composable 收敛

### 7.1 目标

消除 ClaudeCode / CodeX renderer 中 Tab 管理和历史恢复的重复生命周期逻辑。

本阶段不合并完整页面，不合并 provider stream。

### 7.2 不建议只用 `agentType` switch

不要设计成：

```js
useAgentHistory({ agentType: 'claude' })
```

然后在共享 composable 内部写大量：

```js
if (agentType === 'claude') ...
else if (agentType === 'codex') ...
```

这种方式短期省事，长期会把重复逻辑换成一个巨大的共享分支函数。

### 7.3 推荐 adapter 化接口

建议：

```text
packages/agent/src/components/agentCommon/composables/useAgentTabs.js
packages/agent/src/components/agentCommon/composables/useAgentHistory.js
```

示例接口：

```js
useAgentTabs({
  providerId,
  tabs,
  activeTabId,
  createEmptyTab,
  normalizeTab,
  onActivateTab,
  onCloseTab,
  persistTabs
})
```

```js
useAgentHistory({
  providerId,
  storageKey,
  projects,
  normalizeProject,
  normalizeTab,
  sanitizePanelState,
  loadProviderHistory,
  savePanelState,
  getLastProjectCwd,
  setLastProjectCwd
})
```

共享 composable 负责：

- tab activate / close / reorder 的通用规则。
- active tab 同步。
- panel state 读写节流 / flush。
- 历史恢复入口顺序。
- 防止 current-turn metrics 字段被持久化。

provider adapter 负责：

- ClaudeCode / CodeX 的 tab shape 差异。
- provider session id 字段映射。
- transcript/filePath 恢复方式。
- provider 独有的 project cwd / sandbox / permission 状态。

### 7.4 禁止事项

- 不要把 ClaudeCode 和 CodeX 的完整页面合并成一个 Vue 文件。
- 不要在本阶段改 provider stream event 解释。
- 不要把 `chatKey`、`cliSessionId`、`filePath` 混成一个字段。
- 不要在 panel state 保存 current-turn token 字段。

### 7.5 建议执行步骤

1. 为现有 `useClaudeTabs.js`、`useCodexTabs.js` 写最小 characterization tests。
2. 新增 `useAgentTabs.js`，先让 CodeX 接入。
3. 跑测试和手工验证 CodeX tab 行为。
4. 再让 ClaudeCode 接入。
5. 新增 `useAgentHistory.js`，先抽共享 sanitize / persist / load shell。
6. 分别接入 CodeX 和 ClaudeCode。
7. 删除被替代的重复函数，保留 provider adapter 文件。

### 7.6 验收命令

```powershell
npm run test:contract
node --test tests/codehub-active-tab-sync.test.mjs tests/codehub-tab-order.test.mjs tests/history-hydration-authority.test.mjs tests/history-load-safety.test.mjs
```

手工验收：

- 新建 ClaudeCode session，切换 tab，刷新后仍能恢复。
- 新建 CodeX session，切换 tab，刷新后仍能恢复。
- 独立窗口入口 `#/main/claudeCode`、`#/main/codex` 仍能回到 codeHub 对应 agent。
- 运行中 session 切 tab 后，回到原 tab 不丢 live 状态。
- 历史 session 首次点击就显示正确历史，不需要第二次点击。

---

## 8. 阶段 5：巨型 electron 文件拆分 Phase 1

### 8.1 目标

降低 `codexAgent.js` / `claudeAgent.js` 的修改风险。

第一阶段只拆叶子模块，不拆主流式编排核心。

### 8.2 推荐边界

#### CodeX

目标结构：

```text
packages/agent/electron/codex/
  configManager.js
  skillsManager.js
  pluginManager.js
  environment.js
  cliRuntime.js
  ipcHandlers.js
```

第一阶段优先拆：

1. `configManager.js`
2. `skillsManager.js`
3. `pluginManager.js`
4. `environment.js`

暂缓拆：

- Chat stream 主循环。
- `runStreamed` / queue / abort / done 相关核心编排。
- TurnStore 连接点。

#### ClaudeCode

目标结构：

```text
packages/agent/electron/claude/
  configManager.js
  skillsManager.js
  pluginManager.js
  environment.js
  ipcHandlers.js
```

第一阶段优先拆：

1. settings / provider config 读写。
2. skills / plugins 管理。
3. environment check。

暂缓拆：

- `query()` async generator 主循环。
- hook / permission / task event 编排。
- done / terminal event 处理。

### 8.3 拆分方式

推荐 facade 方式：

- 原 `codexAgent.js` / `claudeAgent.js` 的对外导出不变。
- 新模块先由原文件 require。
- 不改变 IPC channel。
- 不改变返回对象 shape。
- 不改变错误消息文案，除非测试明确覆盖。

每拆一个模块，执行：

1. 移动代码。
2. 保持原调用签名。
3. 补模块级测试或 characterization test。
4. 跑 contract tests。
5. 再继续下一模块。

### 8.4 验收命令

按改动范围选择：

```powershell
npm run test:contract
node --test packages/agent/electron/codexRuntimeConfig.test.js packages/agent/electron/codexPanelStatePaths.test.js
node --test packages/agent/electron/skillsSecurity.test.js packages/agent/electron/skillsCatalogCache.test.js
node --test packages/agent/electron/pluginState.test.js
```

手工验收：

- ClaudeCode 环境检查正常。
- CodeX 环境检查正常。
- skills 列表、安装、读取正常。
- plugins 列表、安装、启用/禁用正常。
- CodeX 新建对话、继续对话、abort 正常。
- ClaudeCode 新建对话、继续对话、permission prompt 正常。

---

## 9. 阶段 6：Renderer Convergence 剩余收口

### 9.1 当前已完成部分

不要重复做以下事项：

- 不要重新创建第二个 `StatusBarMetrics.vue`。
- 不要重新实现一个新的 metrics controller。
- 不要绕过 `useAgentMetricsController.js` 写 provider 独立 status bar state machine。

### 9.2 剩余目标

继续收口：

1. first-hydrate 行为。
2. active-tab restore 行为。
3. footer 与 status bar consumer 的测试。
4. 脏 panel state metrics 防复活。

### 9.3 目标契约

Renderer consumers 必须遵守：

```text
session-owned snapshot first
active-tab visibility second
```

含义：

- metrics 永远归属于一个稳定 session record。
- active tab 只决定哪个 session record 可见。
- live/final/context 样本先更新 session record。
- StatusBar 渲染 active session 当前 snapshot view。
- Footer / TokenMetaRow 只渲染消息上绑定的 finalized snapshot。

### 9.4 必补测试

建议新增或扩展：

```text
tests/renderer-first-hydrate.test.mjs
tests/statusbar-footer-consumer-contract.test.mjs
tests/statusbar-dirty-panel-state.test.mjs
```

覆盖：

- 历史 session 首次进入即可显示最新 final snapshot。
- 切换 active tab 不触发错误的数据所有权迁移。
- context-only sample 不能覆盖 finalized turn tokens。
- footer 和 status bar 消费同一 snapshot contract，但 UI 语义不同。
- 脏 panel state 不会复活 current-turn tokens。

### 9.5 验收

```powershell
npm run test:contract
node --test tests/agent-metrics-controller.test.mjs tests/renderer-convergence-contract.test.mjs tests/history-hydration-authority.test.mjs
```

手工验收：

- 打开历史 ClaudeCode session，首次进入 status bar / footer / context 不矛盾。
- 打开历史 CodeX session，首次进入 status bar / footer / context 不矛盾。
- 运行中切 tab，返回后当前回合 in/out/cache 不被上一轮覆盖。
- 刷新窗口后，不显示 panel state 旧 token 作为当前回合 token。

---

## 10. 阶段 7：`electron/main.js` 拆分

### 10.1 目标

降低 host 桌面入口复杂度。

### 10.2 推荐结构

```text
electron/main/
  index.js
  windows.js
  menu.js
  appLifecycle.js
  hostIpc.js
```

迁移后根入口可保留：

```text
electron/main.js
```

作为薄入口：

```js
require('./main')
```

或在 package `main` 可控时再改到 `electron/main/index.js`。

### 10.3 注意事项

- 不要改变 dev 白屏排障依赖的 `[main] route check:` 日志，除非替换为 logger 后仍默认可见。
- 不要破坏 dev 模式三层防僵尸逻辑。
- 不要改变独立窗口入口。
- 不要改变 auto update channel。

### 10.4 验收

```powershell
npm run test:contract
node --test tests/electron-window-icon-paths.test.cjs tests/md-routing.test.cjs tests/auto-update-check-dedup.test.cjs tests/auto-update-install-exit.test.cjs
```

手工验收：

- `npm run dev` 后主窗口正常。
- 路由为 `#/main/codeHub`。
- 打开 ClaudeCode 独立窗口正常。
- 打开 CodeX 独立窗口正常。
- 关闭窗口 dev 进程退出行为不变。

---

## 11. 阶段 8：Vite 5 升级

### 11.1 当前判断

Vite 4.4.6 已落后。升级有价值，但不应挡在架构护栏和核心拆分前面。

建议先升 Vite 5，不直接跨到 Vite 6。

### 11.2 执行要求

- 单独分支 / 单独补丁做依赖升级。
- 不和业务重构混在一起。
- 先跑 build，再跑 Electron 手工验收。
- 记录 Sass warning 是否消失或变化。

### 11.3 验收

```powershell
npm run build
npm run test:contract
```

手工验收：

- dev 页面无白屏。
- codeHub 正常。
- ClaudeCode / CodeX 页面正常。
- mdViewer 正常。
- 打包流程仍按 `docs/build-and-deploy.md`，不要使用有问题的 `build.js --version` 路径。

---

## 12. 关键问题结论

### 12.1 IPC registry 用 TypeScript 还是 JS？

结论：**先用 JS。**

理由：

- 当前项目 JS 为主。
- JS registry + 对账测试足以先解决拼写和漏注册问题。
- TS 化会引入构建链变更，不适合作为 IPC 治理第一步。

### 12.2 巨型文件拆分要不要边拆边补测试？

结论：**边拆边补 characterization tests。**

不要“先拆完再补”。拆分过程中最容易发生导出 shape、错误返回、IPC handler 行为漂移。

### 12.3 Logger 要不要接入 `diagnostics.js`？

结论：**logger 独立 facade，但受 diagnostics enabled 影响。**

业务模块只依赖 logger，不直接依赖 diagnostics 文件细节。

### 12.4 Tab / History 用 `agentType` 还是其他参数化？

结论：**用 adapter 参数化，不用共享函数内部大 switch。**

`agentType` 可以作为标识传入，但不应成为共享 composable 内的主要分支机制。

### 12.5 Renderer Convergence 是否与 Tab/History 合并推进？

结论：**不要合并成一个大任务。**

Renderer Convergence 已部分完成。剩余收口应放在测试护栏之后推进；Tab/History 是相邻但独立的生命周期收敛任务。

---

## 13. 做得好的设计，继续保持

| 设计 | 说明 |
|------|------|
| `@mindcraft/agent` 共享包 | 导出边界清晰（`.`、`./render`、`./electron`、`./preload`），是去重基础 |
| Token Metrics 管道 | `normalizer -> TurnStore -> snapshot` 契约链路清晰 |
| Agent Registry | `agentRegistry.js` / `AGENT_DEFINITIONS` 支撑新增 Agent 类型 |
| Agent Protocol 事件总线 | `agentProtocol.mjs` + `agentNotificationGate.mjs` 已统一通知通路 |
| 快捷键系统 | `useShortcutStore.js` 有配置、机制、注册和 modal/focus 防护 |
| Pinia stores | 主要 store 职责清晰，IPC + localStorage 持久化稳定 |
| Session 身份模型 | `chatKey` / `cliSessionId` / `filePath` 三层清晰 |
| AGENTS.md / CLAUDE.md | 硬边界、排障路由、数据红线全部文档化 |

---

## 14. 执行记录

### 2026-06-28 执行（ClaudeCode 代理，8 阶段连续执行）

**R01 ✅ Phase 1: 测试与架构护栏前置**
- 新增 `tests/run-contract-tests.cjs` — Windows 兼容的合约测试 runner（程序化扫描替代 shell glob）
- `package.json` 新增 `test:contract` / `test:all` 脚本
- 新增 `tests/ipc-channel-registry.test.cjs` — IPC 通道对账测试（preload↔main，软执行）
- 新增 `tests/no-console-main-process.test.cjs` — 禁止 main 进程裸 console.log（基线记录，软执行）
- 新增 `tests/statusbar-dirty-panel-state.test.cjs` — StatusBar 脏 panel state 防护
- 验证：`npm run test:contract` 29 文件 154 tests 全通过

**R02 ✅ Phase 2: 共享基础设施**
- 创建 `packages/agent/electron/agentProtocolBridge.js` — ESM 懒加载桥接，消除 claudeAgent/codexAgent 重复的 `_getAgentProtocol()`
- 收敛 `getMindCraftSettingsPath/readMindCraftSettings/writeMindCraftSettings` → 统一从 `diagnosticsFileUtils.js` 导入
- 创建 `packages/agent/shared/logger.js` — 日志 facade（createLogger），级别控制，敏感字段脱敏

**R03 ✅ Phase 3: IPC channel registry**
- 创建 `packages/agent/shared/ipcChannels.js` — 三组冻结 channel 常量：CLAUDE（43）、CODEX（35）、CORE（27）
- ALL_CHANNELS Set 用于验证
- 命名规范文档化：`claude:<verb>-<noun>` / `codex:<verb>-<noun>` / `core:<verb>-<noun>`

**R05 ✅ Phase 5: 巨型文件拆叶子模块**
- **codexAgent.js**: 5103 → 4834 行（-269 行, -5.3%）
  - 新建 `packages/agent/electron/codex/configManager.js`（279 行）— TOML 解析器、provider config、runtime config、sandbox 模式，依赖注入 factory
  - 新建 `packages/agent/electron/codex/environment.js`（159 行）— `findGlobalCodexPath`、`loadCodexSdk`、install guard
- **claudeAgent.js**: 3935 → 3791 行（-144 行, -3.7%）
  - 新建 `packages/agent/electron/claude/environment.js`（166 行）— `findSystemClaude`、`loadClaudeAgentSdk`、`getEnvWithNodePath`、install guard、conf ref 注入
- 验证：`npm run test:contract` 154 tests 全通过（2 次验证，每次提取后均通过）

**R07 ✅ Phase 7: electron/main.js 拆分（部分）**
- main.js: 655 → 616 行（-39 行）
- 新建 `electron/themeStore.js`（44 行）— theme 持久化（load/save/validate）
- 新建 `electron/tray.js`（47 行）— 系统托盘（create/configure/click handlers）
- 验证：`npm run test:contract` 154 tests 全通过

**R08 ✅ Phase 8: Vite 5 升级**
- vite: 4.4.6 → 5.4.21
- @vitejs/plugin-vue: 4.4.0 → 5.2.x
- vite-plugin-electron: 0.29.0（保持，兼容 Vite 5）
- `npx vite build` 构建成功（renderer 24.77s + main 35ms + preload 21ms）
- 验证：`npm run test:contract` 154 tests 全通过

**遗留 & 待办**
- R04（Tab/History composable 收敛）：顺延。真实阻塞点是 renderer 侧 tab/history/hydrate 生命周期耦合深，不是主进程 handler 行数本身；后续改为专项小步推进。
- R06（Renderer Convergence 剩余收口）：顺延。测试可先行，实际实现依赖 R04 shared helper/composable 稳定后推进。
- R07（main.js 更深拆分）：contextMenu、scattered IPC handlers 仍可提取
- `setupCodexSdkHandlers()` (~2463 行) 和 `setupClaudeHandlers()` (~2963 行) 过于耦合，另立 R09 main handler setup 拆分专项；不要混入 R04/R06 renderer 收敛。

**2026-06-28 晚间决策：冻结当前阶段，先验收后打包**

当前已完成 R01/R02/R03/R05/R07/R08。不要为了完成原 8 阶段计划继续强拆 R04/R06；先将当前代码进入验收窗口，稳定后按 `docs/build-and-deploy.md` 打包。

验收优先级：
- 自动验证：`npm run test:contract`、`npm test`、`npm run build`。
- Dev 冒烟：`npm run dev` 启动不白屏；ClaudeCode / CodeX 主入口可打开；Vite 5 升级后 HMR 和 Electron preload/main 正常。
- Agent 冒烟：ClaudeCode / CodeX 各跑新会话、继续会话、abort、queued/pending 输入、历史恢复、active tab 切换。
- 配套能力：skills/plugins 管理、环境检查、主题/托盘、外部链接、文档浏览、会话指令基础路径。

R04 后续拆分建议：
- R04a：只补 characterization tests，不改行为。
- R04b：只抽纯函数/helper，例如 active tab resolve、close 后下一个 tab 选择、tab normalize、panel state sanitize、history hydrate authority。
- R04c：先让 CodeX 接共享 helper/composable。
- R04d：再让 ClaudeCode 接入。

R06 后续拆分建议：
- 先补 first-hydrate、active-tab restore、footer/statusbar consumer、脏 panel state metrics 防复活测试。
- 实现收口等 R04 shared helper/composable 稳定后再做。

R09 后续拆分建议：
- 单独处理 `setupClaudeHandlers()` / `setupCodexSdkHandlers()`。
- 按 IPC 组拆注册边界：config、skills、plugins、session-instruction、environment。
- stream / queue / abort / done 主循环继续暂缓，不在第一轮 handler 拆分中触碰。

**变更文件清单**
| 文件 | 变化 | 
|------|------|
| `tests/run-contract-tests.cjs` | 新建 |
| `tests/ipc-channel-registry.test.cjs` | 新建 |
| `tests/no-console-main-process.test.cjs` | 新建 |
| `tests/statusbar-dirty-panel-state.test.cjs` | 新建 |
| `packages/agent/electron/agentProtocolBridge.js` | 新建 |
| `packages/agent/shared/logger.js` | 新建 |
| `packages/agent/shared/ipcChannels.js` | 新建 |
| `packages/agent/electron/codex/configManager.js` | 新建 |
| `packages/agent/electron/codex/environment.js` | 新建 |
| `packages/agent/electron/claude/environment.js` | 新建 |
| `electron/themeStore.js` | 新建 |
| `electron/tray.js` | 新建 |
| `packages/agent/electron/codexAgent.js` | 5103→4834 行 |
| `packages/agent/electron/claudeAgent.js` | 3935→3791 行 |
| `electron/main.js` | 655→616 行 |
| `package.json` | scripts + vite/plugin-vue 版本 |
