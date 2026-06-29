# MindCraft Agent 后续重构路线图

> 供 ClaudeCode / CodeX 全局讨论评估。本文基于 R01-R09 已完成后的现状，目标是把后续重构从“继续按行数拆文件”调整为“稳定性优先的架构收口”。

## 1. 当前结论

R01-R09 拆分方向是合理的，可以作为当前稳定版本的架构基线。

已完成的关键收益：

- 测试护栏前置：`test:contract`、IPC 对账、IPC 去重、renderer convergence 契约测试。
- 共享基础设施：agent protocol bridge、settings helper、logger facade、IPC channel registry。
- Renderer 收敛：Tab / History / Metrics / StatusBar 等高频回归点已经共享化。
- Electron host 拆分：`main.js` 已拆出 theme/tray/context menu/fetch image/drag performance 等低风险模块。
- Agent main handler 叶子 IPC 拆分：ClaudeCode / CodeX 已拆出一批低状态 IPC 模块，且没有触碰 stream loop。

当前文件规模：

```text
packages/agent/electron/codexAgent.js   4472 行
packages/agent/electron/claudeAgent.js  3646 行
electron/main.js                         401 行
```

剩余问题不再是“必须继续减少行数”，而是：

- agent electron 侧缺一个稳定聚合边界，后续新增模块容易继续散落 import。
- 部分纯 helper 仍在 `codexAgent.js` / `claudeAgent.js` 内，独立测试不方便。
- 新 IPC channel 还没有完全强制走 registry。
- Skills / config / plugin 仍有重复和存储差异，但涉及更多行为语义，不能混入低风险拆分。

## 2. 总原则

### 2.1 不以行数作为目标

行数下降只是副作用。真正目标是：

- 降低高频改动文件的变更风险。
- 让新功能有清晰落点。
- 让纯函数和无状态 IO 能被独立测试。
- 避免核心运行态跨文件共享可变状态。

### 2.2 三类代码分级

| 类型 | 处理策略 | 示例 |
|------|----------|------|
| 纯函数 / 数据转换 | 可以搬，搬前或搬后补单测 | context window、cost estimate、done payload、tool name normalize |
| 有 IO、无运行态 | 可以搬，但要 characterization tests | JSONL page reader、session file CRUD、TOML reader |
| 有闭包状态 / 生命周期 | 暂不搬 | stream loop、token flush、abort/done ownership、session maps |

### 2.3 永不为了统一而重命名现有 IPC

现有 IPC channel 名称保持兼容。后续可以通过 registry / adapter 约束新增通道，但不在当前阶段做大规模 channel rename。

## 3. 推荐路线

### Phase A：整理 R09 产物的聚合边界

目标：不改行为，只让后续模块有固定入口。

建议新增：

```text
packages/agent/electron/claude/index.js
packages/agent/electron/codex/index.js
```

职责：

- 聚合 R09 已拆出的 leaf IPC 模块。
- 对外只暴露少量注册函数，例如：

```js
registerClaudeLeafIpcs(ipcMain, deps)
registerCodexLeafIpcs(ipcMain, deps)
```

注意：

- 不改任何 IPC channel 名。
- 不迁移 stream loop。
- 不把 leaf IPC 抽成过度通用的 `registerProviderIpc()`。
- 只做 import/registration 边界整理。

验收：

```bash
node --test tests/ipc-handle-dedup.test.cjs tests/ipc-channel-registry.test.cjs
npm run test:contract
```

### Phase B：搬真正低风险的纯 helper

优先从 CodeX 开始，因为 `codexAgent.js` 顶部 helper 更多。

推荐第一批：

| 模块 | 可搬内容 | 风险 |
|------|----------|------|
| `codex/donePayload.js` | `resolveCodexDoneReasonFromError`、`buildCodexAgentDonePayload` | 低 |
| `codex/contextWindow.js` | `getCodexContextWindowForModel`、`estimateCodexCostUsd`、context 估算 | 低 |
| `codex/pageReader.js` | `readFirstLine`、`safeJsonParse`、小型 page utility | 低 |
| `codex/messageTools.js` | `normalizeCodexToolName`、`buildMessageDedupKey` 等纯转换 | 低 |
| `claude/historyReader.js` | `readJsonlPageLinesFromTail`、history turn token annotation | 中低 |

暂缓搬迁：

- `flushActiveTurnTokens` / `collectMessage` / `tryFlushCall`：这些和 token flush 状态、历史分页、turn 归属耦合，不应作为第一批。
- `confGet` / `confSet`：它们依赖 `internalConf` 和官方 `~/.claude/settings.json` 边界，应放到配置收敛阶段。
- `deleteCodexSessionRunIfCurrent` / `shouldEmitCodexSessionTerminalSignals`：虽然已有测试，但属于 run ownership 语义，移动前必须先确认调用链。

执行要求：

- 每个模块单独提交。
- 先迁移现有测试 import，再改生产代码 import。
- 保留 `codexAgent.js` / `claudeAgent.js` 的对外测试导出兼容，或同步更新所有测试。

### Phase C：IPC registry 从软约束升级为新增通道硬约束

当前已经有 IPC dedup 和 channel parity，但 registry 仍偏软。

推荐目标：

- 新增 IPC channel 必须登记到 `packages/agent/shared/ipcChannels.js`。
- 新增 preload 暴露必须引用 registry 常量。
- 新增 main handler 注册必须引用 registry 常量。

不要在这一阶段重命名历史 channel。先保证“未来不继续漂移”。

可选实现：

- 增加 contract test：扫描新增/指定目录中的字符串 channel 是否在 registry。
- 先只对新模块和新提交执行硬约束，历史债务保持 warning。

### Phase D：配置存储先统一接口，不统一实现

不要马上把 Claude / CodeX 都迁移到同一个 `configStore`。这会碰到用户配置、官方目录边界和打包兼容性。

推荐先做 adapter：

```text
packages/agent/electron/claude/configAdapter.js
packages/agent/electron/codex/configAdapter.js
```

接口形态：

```js
getRuntimeConfig()
setRuntimeField(key, value)
getProjectSettings(cwd)
setProjectSettings(cwd, settings)
```

底层存储保持不变：

- Claude 继续遵守官方 `~/.claude/settings.json` 与 MindCraft internal config 的边界。
- CodeX 继续使用现有 `electron-conf` / TOML / auth.json 路径。

等 adapter 稳定并有 characterization tests 后，再讨论是否统一 Conf + JSON fallback。

### Phase E：Skills 先共享底层 primitives，不共享 IPC 注册器

不要一开始就写 `registerSkillsIpc(provider, ...)`。这类抽象容易把 provider 差异藏在参数里，后续维护成本反而变高。

推荐先共享底层函数：

```text
packages/agent/electron/shared/skills/
  manifest.js
  catalogCache.js
  installer.js
  marketplace.js
```

可共享能力：

- manifest 读取与校验。
- Git clone fallback。
- target dir 解析。
- atomic copy / uninstall。
- marketplace list normalize。

Claude / CodeX 各自保留自己的 IPC handler 和 channel 名。

等重复逻辑自然减少后，再判断是否需要共享 IPC 注册器。

### Phase F：Plugin / config TOML 继续小步拆

CodeX plugin 管理可以拆，但不是低风险第一批。

前置条件：

- TOML reader/writer 有 characterization tests。
- plugin list 解析有样本测试。
- fallback cache 语义有测试。

建议拆分：

```text
codex/pluginStore.js
codex/pluginCli.js
codex/pluginIpc.js
```

不建议把 Claude Skills、CodeX Skills、CodeX Plugins 合并成一个大 shared module。

### Phase G：通道命名大一统暂不执行

这件事可以保留在长期方向里，但当前不建议执行。

原因：

- 同时影响 main / preload / renderer。
- 没有 E2E 覆盖时，漏改会静默失效。
- 现有兼容 channel 已经工作，不值得为了命名统一承担大面积回归风险。

替代方案：

- 保持历史 channel。
- 新通道走 registry 常量。
- preload 侧逐步建立 provider adapter，让 renderer 少接触原始 channel 名。

## 4. 永不拆区域

以下区域不应从当前文件中强行拆出：

| 区域 | 原因 |
|------|------|
| `codex-agent-query` / `claude-agent-query` stream loop | abort、event emit、metrics polling、session 生命周期和错误处理耦合在同一执行拓扑内。拆分只增加间接层。 |
| `agentSessions` / `codexSessions` 运行态 Map | 被 stream loop 多阶段读写。跨文件共享可变状态比保留本地闭包更危险。 |
| Resume / abort / done 主路径 | 处于 try/catch/finally 和 provider event 顺序边界内，回归代价高。 |
| token flush 主状态机 | 牵涉 turn 归属、history hydration、live metrics，不作为普通 helper 搬迁。 |

## 5. 执行状态（2026-06-29 更新）

所有可控批次已完成。当前版本为 Batch 0-5 全量交付后的稳定基线。

```text
✅ Batch 0：稳定观察 + 文档同步
✅ Batch 1：R09 产物整理 (claude/index.js, codex/index.js) — commit cae7940
✅ Batch 2：纯 helper 搬迁 (donePayload, contextWindow, pageReader, messageTools, historyReader) — 199 tests
✅ Batch 3：IPC registry 硬约束 (227 channel baseline) — 204 tests
✅ Batch 4：Skills primitives (marketplace.js, scanner.js) — 204 tests
✅ Batch 5：Plugin/TOML 提取 (cliExecutor.js, configTomlPreserve.js, TOML handlers→configIpc.js) — 229 tests
⏸  长期保留：IPC channel 命名统一（需要 E2E 覆盖后再评估）
```

### Batch 5 执行记录

| 子批次 | 内容 | 新文件 | 测试 | Commit |
|---|---|---|---|---|
| 5a | CLI executor 去重 | `shared/cliExecutor.js` | +13 | `c1610db` |
| 5c | TOML IPC 合并 | `codex/configTomlPreserve.js` | +12 | `3d166d9` |
| 5b | Plugin lifecycle IPC | 跳过 | — | ROI 过低 |
| P3 | 死导入清理 | — | — | `bbbb509` |

### 当前验证基线 (2026-06-29)

| 度量 | 值 |
|---|---|
| 合约测试 | 49 文件 pass / 0 fail |
| 全量测试 | 120 pass / 0 fail / 1 skip |
| IPC dedup | ✅ |
| IPC registry 硬约束 | ✅ |
| 导入完整性验证 | ✅ (+62 assertions, agent-import-integrity.test.cjs) |
| 新增 characterization tests | +25 (Batch 5) |

### Smoke test 发现问题

| 问题 | 严重度 | 修复 |
|---|---|---|
| `codexAgent.js` 缺少 `createCliExecutor` import | P0（启动崩溃） | `8e17150` |
| `node --check` 无法检测此类 bug | 工具链缺口 | 新增 `agent-import-integrity.test.cjs` |

### 后续建议

1. ✅ ~~新版实际使用 smoke test~~ — 已完成，发现并修复 1 个 P0 导入缺失
2. 长期 IPC 统一：先补 E2E（至少 preload/main 端到端启动验证），再单独开新阶段评估

## 6. 验证基线

每个 batch 至少运行：

```bash
node --test tests/ipc-handle-dedup.test.cjs tests/ipc-channel-registry.test.cjs
npm run test:contract
npm test
```

如果涉及 CodeX session / run ownership：

```bash
node --test tests/codex-session-run-ownership.test.cjs tests/codex-session-terminal-ownership.test.cjs tests/codex-turn-tokens.test.cjs
```

如果涉及 Claude history / session：

```bash
node --test tests/claude-pending-session-binding.test.mjs tests/history-hydration-authority.test.mjs
```

如果涉及配置存储：

```bash
node --test packages/agent/electron/codexRuntimeConfig.test.js tests/codex-provider-toml.test.mjs
```

## 7. 当前状态

```text
codexAgent.js   约 4400 行（原始 ~4472 → Batch 2-5 移除 ~70）
claudeAgent.js  约 3600 行（原始 ~3646 → Batch 2-5 移除 ~45）
electron/main.js  401 行（R07 已拆）
```

新增共享/叶子模块：

```text
packages/agent/electron/shared/
  skills/marketplace.js     — 统一 marketplace API 客户端
  skills/scanner.js         — 统一技能目录扫描
  cliExecutor.js            — CLI 执行器工厂 (Windows shim)
packages/agent/electron/codex/
  configIpc.js              — 配置 + TOML 文件 IPC (R09 + Batch 5c)
  configTomlPreserve.js     — TOML section 保留 (Batch 5c)
  donePayload.js / contextWindow.js / pageReader.js / messageTools.js  — Batch 2
  environmentIpc.js / apiIpc.js / gitDiffIpc.js  — R09
packages/agent/electron/claude/
  historyReader.js          — JSONL page reader + turn annotation (Batch 2)
  apiIpc.js / freezeDiagIpc.js / webSearchIpc.js / uiUtilsIpc.js / chatPersistenceIpc.js  — R09
```

合理终态判断：当前已到达自然边界。继续拆会碰到 stream loop / lifecycle 状态机，风险超过收益。

## 8. 决策建议

当前新版已经切换并进入测试，且目前反馈正常。因此：

1. 当前 R01-R09 阶段可以收口。
2. 近期只做文档同步和轻量边界整理，不做新一轮大拆分。
3. 后续如继续重构，从 Batch 1 / Batch 2 开始，小步提交、小步验证。
4. 不以“再减少多少行”为目标，以“降低未来改动风险”为目标。
