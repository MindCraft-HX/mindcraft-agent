# MindCraft Agent 架构契约

> 最后更新：2026-07-05
> 目的：给后续开发和排障提供稳定的项目架构入口。历史任务、SDK 字段表、Token 细节不再堆在本文，按文档路由进入专题文档。

## 1. 项目定位

`mindcraft-agent` 是轻量级多 Agent 集成平台，不是 `mindcraft-electron` 的裁剪版。当前核心能力：

- ClaudeCode 编程 Agent
- CodeX 编程 Agent
- codeHub 双 Agent 容器与项目/会话管理
- 文档浏览与轻量 Chat
- 桌面端 Electron 打包与本地文件系统能力

## 2. 目录边界

```text
packages/agent/
  electron/        Agent 主进程实现、provider SDK/CLI 适配、token metrics domain
  preload/         Agent preload bridge
  src/             Agent renderer，ClaudeCode / CodeX / codeHub / shared components

src/
  host 应用层：路由、导航、host-only 页面、非 Agent 业务

electron/
  桌面运行时：窗口、菜单、根 preload、打包接线、host-level IPC

tests/
  回归测试与架构契约测试

docs/
  项目知识库，默认纳入 git
```

硬规则：

- Agent 功能优先改 `packages/agent/**`。
- host 壳层、主路由、窗口接线才改 `src/**` 或根 `electron/**`。
- 共享逻辑只能有一份。ClaudeCode / CodeX 重复逻辑应收敛到 `agentCommon/**` 或 `packages/agent/electron/**` 的明确领域模块。
- `packages/agent` 禁止依赖 host-only 业务。

## 3. 运行时分层

### 3.1 Main

根 `electron/main.js` 负责桌面壳接线，并注册共享 Agent IPC：

```js
const { registerAgentIPCs, resetCodexRuntime } = require("../packages/agent/electron")
```

`packages/agent/electron/**` 才是 ClaudeCode / CodeX 的 provider 适配和运行态主逻辑。

### 3.2 Preload

根 `electron/preload.js` 暴露 host bridge，并通过共享 preload 暴露 Agent bridge：

```js
const { createAgentBridge } = require("../packages/agent/preload")
```

新增 renderer 能力时，优先检查是否属于 Agent bridge；不要在 host preload 里绕开共享边界。

### 3.3 Renderer

最终编程入口是：

```text
#/main/codeHub
```

兼容入口：

```text
#/main/claudeCode -> #/main/codeHub?agent=claudeCode
#/main/codex      -> #/main/codeHub?agent=codex
```

`src/router.js` 通过 `@mindcraft/agent` 加载共享 Agent 容器。独立窗口仍依赖这些兼容入口，改 codeHub 路由时必须回归独立窗口。

## 4. 数据归属

### 4.1 官方目录

| Provider | 官方目录 | 只应存放 |
|----------|----------|----------|
| ClaudeCode | `~/.claude/` | transcript JSONL、settings、skills、plugins、MCP、认证和官方运行状态 |
| CodeX | `~/.codex/` | transcript JSONL、config/auth、skills/plugins、官方运行状态 |

MindCraft 自有数据禁止写入官方目录，也禁止写到官方 transcript 旁边作为 sidecar。

### 4.2 MindCraft 自有数据

MindCraft 自有数据包括：

- panel state
- chat/session title、description
- session instruction
- 模型/effort 选择
- `chatKey -> providerSessionId -> filePath` 映射
- 编排元数据
- 诊断日志
- 缓存和 UI 状态

目标位置：

- 通用 UI / 配置状态：`app.getPath('userData')` 或 app 自己的 Conf 文件
- 会话级 registry：`{userData}/session-registry/`
- 会话 draft：以 session-registry 为事实来源，renderer 可用两级内存缓存降低切 tab I/O
- 本地私密/临时文档：`docs/local/`、`docs/private/`、`docs/tmp/`

允许读取官方 transcript/config 建立映射；不允许新增官方目录 sidecar。历史遗留 sidecar 采用读旧写新，分阶段迁移。

## 5. 会话身份模型

每个会话有三层身份：

| 层 | 字段 | 归属 | 用途 |
|----|------|------|------|
| UI 会话 | `chatKey`，legacy 字段常为 `chat.sessionId` | MindCraft | tab、panel state、registry 主键 |
| Provider 会话 | `cliSessionId` / thread id | 官方 SDK/CLI | resume、官方会话定位 |
| Transcript 文件 | `filePath` | 官方 SDK/CLI | JSONL 读取、历史恢复、删除 |

规则：

- 不要把 `chatKey` 当 provider session id。
- 不要把 `cliSessionId` 当 UI tab id。
- 不要用 `filePath` 承载 MindCraft 自有元数据。
- 会话相关 bug 先读 `docs/session-pitfalls.md`，再动代码。
- A user title write must persist its `chatKey -> cliSessionId/filePath` binding in the same SQLite transaction. Startup may backfill only explicit legacy user renames from panel state; scan-derived panel titles are never authoritative.
- SQLite `sessions/session_bindings/session_runtime` is authoritative for session identity and runtime. Legacy session-registry identity fields are read-only fallback and must not overwrite SQLite or panel state.
- CodeHub tab existence comes only from the current profile's SessionIndex. Provider panels may patch runtime fields after mount; localStorage may select/order known IDs but must not switch tab implementations or read provider legacy directories such as `~/.codex`.
- panel cache 只能补缺 UI 状态或 runtime 空洞；不能把旧的 model/effort/reasoningEffort 写回覆盖 provider authoritative state。
- Claude active-provider defaults are `selectedTier + tierModels + effortLevel` from the SQLite provider row. Main projects them as one derived `app-settings` runtime snapshot and one official settings write before SDK reset, then notifies renderer surfaces. New chats and unsent drafts copy those defaults; provider activation may update the current Claude chat, but must not rewrite unrelated historical session runtime metadata.
- draft 文本可以走 renderer 两级内存缓存，但最终仍应落到 session-registry；不要恢复到每次切 tab 都读写磁盘，也不要用 panel state 做逐键持久化。

关键异步事实：

- `onAgentDone` 不保证触发。
- scan、done、history load、panel save 可能并发。
- 主进程 runtime Map 是所有窗口共享的。
- reset runtime 会影响所有窗口。

## 5.1 Renderer 性能边界

重构后 renderer 热路径已有专门约束，后续改 ClaudeCode / CodeX / codeHub 时必须保留：

- ProjectTabs / CodeHub tab summary 只能暴露 UI 需要的轻量字段，禁止把完整 project / chats / messages 通过 `{ ...p }` 或等价方式塞入 tab summary。
- ClaudeCode 与 CodeX 的 tab summary 派生优先复用共享 helper；不要重新引入两套遍历全部消息的 computed。
- session/tab 激活后使用 scheduled refresh 和 per-project cooldown；不要在每次 tab activation 上直接触发全量 session scan。
- textarea autosize、scroll restore、metrics refresh 等高频操作应合并到 rAF / scheduled task；不要在输入或切换路径做同步 layout + 磁盘 I/O。
- 性能探针和 debug 日志必须通过显式 flag 打开，禁止默认 dev console 噪音回潮。
- project/session activation 同步段只能更新 active id、显示已有内存状态、启动当前 session 首屏加载、focus/scroll；不得等待完整 metrics、完整 project scan、registry 批量写入或非当前 session 后台任务。
- 缓存命中路径必须保持轻量。provider scan cache 只能缓存 provider raw summary；registry 派生字段应在独立读/merge 阶段处理，避免 cache hit 继续隐式 upsert 大量 session record。
- 新增缓存必须登记 owner/key/value/invalidation/limit/stale policy/mutation policy。禁止未登记的临时 Map 进入切换热路径。

这些规则是当前性能与缓存边界；历史实施计划不作为公开文档维护。

## 5.2 缓存与本地派生数据边界

缓存可以用于本地派生数据，但不能成为新的隐式事实源。新增或修改缓存前必须满足：

- 写清 owner、key、value、source of truth、invalidation、limit/TTL/signature、mutation policy。
- 文件派生缓存优先使用 `packages/agent/electron/shared/localDerivedCache.js` 的 `createFileDerivedCache()`；签名至少包含 `mtimeMs`，聚合类优先同时包含 `size`。
- in-flight dedup 优先使用 `trackDedup()` 或同等 timeout cleanup + identity guard，避免 promise 卡死后永久占用 dedup slot。
- cache hit 路径必须只读：禁止写 session registry、panel state、官方目录，禁止触发重型 scan/IPC。
- provider scan cache 只缓存 provider raw summary；registry 派生字段通过独立 read/merge 合并，不能让 cache hit 路径继续隐式 upsert。
- 不引入全局 Redis 式缓存服务，不把当前 live turn metrics 当历史缓存回灌。

新增缓存时应在本架构文档或相关稳定契约中记录边界与失效规则。

## 6. 消息来源与持久化

消息有两类来源：

| 来源 | 场景 | 说明 |
|------|------|------|
| 内存流式消息 | 会话运行中 | 实时，但 crash/刷新可能丢 |
| 官方 JSONL | 历史恢复 / 刷新 | 持久，但可能滞后 |

panel state 不应保存有官方 JSONL 的完整 messages。已有 `filePath` 时，历史内容应以官方 transcript 为事实来源；panel state 只保留 UI 所需状态和映射。

系统上下文、AGENTS/CLAUDE 指令泄漏的剥离统一走 `stripSystemContextTags()`，不要新增局部白名单。

## 7. Token Metrics 架构

Token metrics 已进入独立领域层，不再允许 UI 或历史恢复各自解释 provider 字段。

标准链路：

```text
provider raw event/jsonl
  -> provider adapter
  -> normalizer
  -> TurnStore
  -> snapshot
  -> StatusBar / TokenMetaRow / history / home aggregate
```

UI 统一语义：

| UI 字段 | 含义 |
|---------|------|
| `in` | 当前回合输入侧成本 token：常规输入 + cache creation |
| `out` | 当前回合输出 token |
| `cache` | 当前回合 cache read token |
| `context` | 当前上下文占用，独立于当前回合 `in/out/cache` |

硬规则：

- 前端禁止直接解释 `input_tokens`、`cached_input_tokens`、`cache_read_input_tokens` 等 provider 原始字段。
- `StatusBarMetrics` 当前回合 token 只能来自 TurnStore live/final snapshot。
- 消息 footer 只能来自 final/history snapshot。
- JSONL/session aggregate 可以用于历史、首页、context 对账，但不得作为 StatusBar 当前回合 `in/out/cache`。
- Panel state 不得持久化当前回合 token 字段，否则刷新后会把脏数据重新喂给 UI。
- 动态数字只在真实样本之间动画，没有中间样本就不伪造增长。

详细契约见：

- `docs/token-metrics-contract.md`
- `docs/token-metrics.md`
- `packages/agent/electron/tokenMetrics/**`
- `tests/*token*`

## 8. SDK 与官方能力

Codex 的运行生命周期、transcript 最终一致性和外部 CLI 迁移契约见
`docs/codex-runtime-lifecycle.md`。逻辑 terminal 事件、transport 关闭和
`agent_done` 是三个不同的边界，不能用一个布尔值替代。

开发 SDK 相关功能前先查：

- `docs/sdk-feature-gaps.md`
- ClaudeCode 类型定义：`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
- CodeX 外部 CLI：configured executable plus `codex --version` and `codex exec --help`

基本差异：

| 维度 | ClaudeCode | CodeX |
|------|------------|-------|
| 主入口 | `query()` async generator | `CodexCliClient.startThread()` / `resumeThread()` → `codex exec --json` |
| 会话管理 API | list/get/delete/fork 等较多 | 基本依赖 CLI/transcript |
| 运行时控制 | Query 上有多种控制方法 | MindCraft-owned child process + JSONL event stream |
| Hook | 有 hook 系统 | 无同等级 hook |
| 权限 | `permissionMode` + `canUseTool` | `sandboxMode` + `approvalPolicy` |

不要根据旧文档或记忆新增字段；必须核对本地 `.d.ts`。

## 9. Provider 配置与 settings 红线

`~/.claude/settings.json` 是 ClaudeCode SDK 官方配置文件，只能写 SDK schema 支持字段。

App 专属字段必须写入 MindCraft 自有配置，例如 `claude-internal.json` 或 userData 下其他文件。

已确认必须从官方 settings 写入路径剥离的 MindCraft 字段：

- `gitMirrorUrl`
- `memoryInjectMode`

读写官方 settings 前必须经过 sanitizer；配置导入、保存和迁移逻辑都不能把这些字段重新写回 `~/.claude/settings.json`。

历史污染和合法字段清单见：

- `docs/settings-json-pollution.md`

## 10. 运行时告警路由

常见告警不要混入 token metrics 修复：

| 告警 | 初步归类 |
|------|----------|
| `ReferenceError: scrollBottom is not defined` | renderer 组件事件 handler 作用域/命名问题，优先查对应 `index.vue` 完整函数 |
| `[codex-proxy] stream: natural end (no [DONE])` | 上游 SSE 自然结束，需结合后续 `turn.completed` 判断，不等于错误 |
| Vue `Unhandled error during execution of component event handler` | 通常是 handler 内异常的外层表现，先定位后续具体 error |

这些问题应各自建任务或补测试，不应顺手混在 metrics 逻辑里修。

## 11. 文档与测试路由

| 领域 | 文档 | 测试 |
|------|------|------|
| 会话陷阱 | `docs/session-pitfalls.md` | `tests/*session*`, `tests/*runtime*` |
| Token metrics | `docs/token-metrics-contract.md`, `docs/token-metrics.md` | `tests/*token*`, `tests/*metrics*` |
| SDK 能力 | `docs/sdk-feature-gaps.md` | 按具体 adapter 增补 |
| settings 污染 | `docs/settings-json-pollution.md` | 配置读写相关测试 |
| dev 白屏 | 检查 `[main] route check:`、路由状态和启动脚本 | 路由/启动脚本测试 |
| 打包部署 | `docs/build-and-deploy.md` | build 手工验收 |

新架构决策应同时更新对应 docs 和测试。不要把长期知识只留在对话里。

## 12. 当前复盘：为什么 Token Metrics 反复修错

本轮反复修错不是因为“重构一定错”，而是重构边界漏了一个实际数据源：

- 已经收敛了 provider raw usage、normalizer、TurnStore、JSONL/history 的大部分边界。
- 但最下方 StatusBar 仍可能从 renderer 恢复的 `tab.metrics` 读取 panel state 旧值。
- panel state 曾持久化当前回合 token 字段，刷新后会绕过 TurnStore，把历史脏 `in/cache/out` 重新灌进 UI。
- 之前测试覆盖了 TurnStore、JSONL、final usage，却没有覆盖“脏 panel state 恢复”这个 consumer/source。
- 文档没有明确写出 panel state 禁止持久化当前回合 token 字段，导致后续修复继续围绕 provider 和 JSONL 打补丁。

修复方向已经写入 `docs/token-metrics-contract.md`：panel state 只能保存 UI/session 状态，不保存 current-turn token 字段。后续若同类问题复发，优先检查是否有新 consumer 绕过 `normalizer -> TurnStore -> snapshot`。

## 13. 打包

完整流程见 `docs/build-and-deploy.md`。快速原则：

- 不走有问题的 `build.js --version`。
- 版本号用 `npm version x.x.x --no-git-tag-version`。
- 手动确认 builder config 的 `releaseNotesFile`。
- 上传 exe、zip、latest.yml、blockmap。
