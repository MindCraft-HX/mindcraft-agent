# mindcraft-agent

轻量级多 Agent 集成平台，不是 `mindcraft-electron` 的裁剪版。当前产品核心是 ClaudeCode + CodeX 双编程 Agent，另有文档浏览与轻量 Chat。

`AGENTS.md` 与 `CLAUDE.md` 是启动提示词入口，必须保持同步。这里只放项目背景、硬边界和排障路由；细节放到 `docs/` 和 `tests/`。

## 架构总览

```text
packages/agent/  -> 共享 Agent 核心，renderer/electron/preload 均在此，mindcraft-electron 复用
src/             -> host 应用层，壳、路由、导航、host-only 页面
electron/        -> 桌面运行时，窗口、菜单、preload、文件系统、打包
tests/           -> 回归测试与架构契约测试
docs/            -> 项目知识库，默认纳入 git
```

核心边界：

- 改 ClaudeCode / CodeX / codeHub / agent 通用能力，优先进入 `packages/agent/**`。
- 改 host 壳、主路由、导航、桌面窗口接线，才进入 `src/**` 或根 `electron/**`。
- ClaudeCode 与 CodeX 共享逻辑只能放一份，例如 `packages/agent/src/components/agentCommon/**` 或 `packages/agent/electron/tokenMetrics/**`；禁止两边复制粘贴。
- `packages/agent` 不能塞 host 专属逻辑。

## 文档路由

| 场景 | 先读 |
|------|------|
| 知识库总索引 | `docs/index.md` |
| 当前任务 / Bug 跟踪 | `docs/TODO.md` |
| 总体架构、目录边界、数据边界 | `docs/agent-architecture.md` |
| 会话重复 / 中断 / 丢失 / 恢复卡死 | `docs/session-pitfalls.md` |
| Token 统计 / StatusBar / footer / context / cache | `docs/token-metrics-contract.md`，再读 `docs/token-metrics.md` |
| SDK 能力、是否已有官方 API | `docs/sdk-feature-gaps.md`，再核对本地 `.d.ts` |
| `~/.claude/settings.json` 污染 | `docs/settings-json-pollution.md` |
| dev 白屏 / 僵尸进程 | `docs/bugs/dev-white-screen-zombie-process.md` |
| 打包 / 部署 / 版本发布 | `docs/build-and-deploy.md` |
| 首页功能 | `docs/home-page.md` |
| 界面性能 | `docs/perf-audit-report.md` |
| Renderer 高频链路 / tab 切换性能 | `docs/plan/2026-07-02-renderer-hot-path-performance.md`，`docs/plan/2026-07-02-session-tab-switch-performance.md`，`docs/plan/2026-07-02-T172-session-switch-performance.md` |
| Activation 热路径 / 缓存治理 | `docs/plan/2026-07-05-hot-path-governance-and-streaming-render.md`，`docs/plan/2026-07-05-project-session-activation-work-graph.md`，`docs/plan/2026-07-05-cache-governance-and-local-derived-data.md` |
| 每日代码审查 | `docs/review.md` |
| 架构健康审查（优化优先级） | `docs/architecture-health-review-2026-06-28.md` |

## 数据边界

- MindCraft 自有数据禁止写入 `~/.claude`、`~/.codex`、项目 `.claude`、项目 `.codex`。
- 官方目录只存官方 CLI/SDK 需要的数据：transcript、settings/config、skills、plugins、MCP、认证和官方运行状态。
- MindCraft 自有数据包括 panel state、chat/session title、description、session instruction、模型/effort 选择、chatKey 到 provider session 映射、编排元数据、诊断日志、缓存和 UI 状态。
- MindCraft 自有数据必须写入 `app.getPath('userData')` 或 app 自己的 Conf 文件；新会话级数据优先放 `userData/session-registry/`。
- 允许读取官方 transcript/config 来建立映射；禁止在官方 transcript 旁新增 sidecar。历史遗留 sidecar 只能读旧写新、分阶段迁移。
- 如确需写官方目录，必须是 SDK/CLI 官方 schema 支持的字段，并在代码注释和 `docs/` 中写明依据与回滚路径。
- `gitMirrorUrl`、`memoryInjectMode` 是 MindCraft 自有字段，禁止写入 `~/.claude/settings.json`；写官方 settings 前必须经过 sanitizer。

## 会话与状态

- UI 会话主键是 MindCraft `chatKey`，历史字段通常叫 `chat.sessionId`。
- Provider 会话主键是 `cliSessionId` / thread id，官方 transcript 由 `filePath` 指向。
- 不要混用 `chatKey`、`cliSessionId`、`filePath`。会话 bug 先按 `docs/session-pitfalls.md` 的双身份模型排查。
- `onAgentDone` 不保证触发，crash 时可能没有；`scan` 和 `done` 并发不可假设顺序。
- `resetAgentRuntime()` / `resetCodexSdkRuntime()` 影响所有窗口。
- 系统标签剥离统一走 `stripSystemContextTags()`，禁止在其他文件硬编码标签名。

## Renderer 性能红线

- ProjectTabs / CodeHub tab summary 只能暴露轻量 UI 字段；禁止把完整 project、chats、messages 通过 `{ ...p }` 或等价方式传入 tab UI。
- ClaudeCode 与 CodeX 的 tab summary、provider summary 优先复用共享 helper，禁止重新复制两套全量遍历消息的 computed。
- session/tab activation 同步段只能更新 active id、显示已有内存状态、启动当前 session 首屏加载和 focus/scroll；不得等待完整 metrics、完整 project scan、registry 批量写入或非当前 session 后台任务。
- session/tab 激活后使用 scheduled refresh 和 per-project cooldown；不要在每次 tab activation 上同步触发 full session scan。发送完成后由 done 边界更新 `updatedAt/fileSize` 和排序，不依赖窗口 focus 轮询顺手修正。
- draft 走 session-registry + renderer 两级内存缓存；不要恢复到 per-key panel state 写入，也不要让切 tab 触发磁盘 I/O。
- 性能探针、debug 日志和 metrics 分段日志必须由显式 flag 打开，禁止默认 dev console 噪音。

## 缓存治理红线

- 新增缓存前先读 `docs/plan/2026-07-05-cache-governance-and-local-derived-data.md`，写清 owner、key、value、source of truth、invalidation、limit/TTL/signature、mutation policy。
- 文件派生缓存优先复用 `packages/agent/electron/shared/localDerivedCache.js` 的 `createFileDerivedCache()`；key/signature 至少包含 file path + `mtimeMs`，聚合类优先包含 `size`。
- in-flight dedup 优先复用 `trackDedup()` 或同等 identity guard + timeout cleanup；dedup 命中不能阻止 UI cache-first 展示。
- cache hit 路径禁止写 registry、panel state、官方目录或触发重型 scan/IPC；scan cache 只能缓存 provider raw summary，registry 派生字段走独立 read/merge。
- 禁止新增全局 Redis 式缓存服务，禁止把当前 live turn metrics 当历史缓存回灌。

## Token Metrics 红线

- UI 对外只展示统一语义：`in = 常规输入 + cache creation`，`out = 输出`，`cache = cache read`，`context = 当前上下文占用`。
- Provider 原始 usage 只能在主进程 adapter/normalizer 中解释；前端不得直接解释 `input_tokens`、`cached_input_tokens` 等原始字段。
- `StatusBarMetrics`、消息 footer、历史恢复必须消费 `normalizer -> TurnStore -> snapshot` 链路。
- Panel state 可以存模型、context、git、draft 等 UI 状态，但禁止持久化当前回合 `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens/durationMs/costUsd`。
- JSONL/session aggregate 可以用于历史、首页、context 对账；不得直接喂给 StatusBar 当前回合 `in/out/cache`。
- 动态数字只能在真实样本之间动画，不能伪造 token 增长，不能拿上一轮数据顶替当前回合。

## 开发习惯

- 先读完整函数再改大文件，尤其是 `claudeAgent.js` / `codexAgent.js` / 两个 `index.vue`。
- 同一函数连续三次回归，停止补丁，改为重写边界或补契约测试。
- 新增 SDK 用法前先查本地类型定义，不凭记忆：
  - ClaudeCode: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
  - CodeX: `node_modules/@openai/codex-sdk/dist/index.d.ts`
- 禁止 `console.log` 输出 API key，包括前缀和长度。
- `docs/` 是项目知识库，默认进 git；私密、临时、机器本地内容放 `docs/local/`、`docs/private/`、`docs/tmp/`。

## dev 与打包

- `npm run dev` 白屏先看终端 `[main] route check:`，`#/side` 通常是路由污染，不要先猜端口。
- 同源多窗口共享 localStorage，路由记忆只准写 `/main` 前缀。
- dev 模式三层防僵尸：predev 清端口、dev 守护每 3s 探测、dev 模式关窗即 quit。
- 打包流程见 `docs/build-and-deploy.md`。不要使用有问题的 `build.js --version` 路径。
