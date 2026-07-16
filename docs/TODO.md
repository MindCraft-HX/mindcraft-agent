# TODO

## 2026-07-06 Post-refactor release gate / cleanup queue

Current decision: freeze new feature development on this release line. Package a release candidate only after automated gates are green, then use manual smoke to decide whether it can ship. Follow-up cleanup is registered separately so it does not mix with feature work or release-blocker fixes.

Execution entry: `docs/plan/2026-07-06-post-refactor-release-and-cleanup-queue.md`.

Registered follow-ups:

| ID | Category | Scope | Priority | Status |
|----|----------|-------|----------|--------|
| T193 | release/qa | Release stabilization window: current line only accepts smoke/build/P0-P1 fixes until package candidate passes manual smoke. | P1 | Registered |
| T194 | architecture/ipc | **Phase 2 完成**：218 grandfathered 通道迁移 + 扫描器升级（`findConstantInvocations` 支持常量引用，272 preload / 244 main / 349 registered）+ preload fallback 收缩（仅保留 streaming push events）。Phase 3 baseline 清零待后续。 | P2 | Phase 2 ✅ |
| T195 | architecture/compat | **T188 Phase 1 完成**：CodeX `~/.codex/providers.json` 写投影已停止（sync `writeProviders` 移除）；Claude `confSet('claudeProviders')` 写投影已停止。保留读回退。兼容性注册表已更新。 | P2 | ✅ 已完成 |
| T196 | test/e2e | **Electron E2E smoke harness**：19/19 tests，覆盖 boot / preload / sanitizer / session restore / provider CRUD / restart dedup。已修复 `this.skip()` crash（node:test 兼容）和 `os.tmpdir()` 环境耦合。 | P2 | ✅ 已完成 |
| T197 | architecture/agent | **✅ 已完成**：Agent lifecycle characterization — 映射 stream/abort/done/session map/metrics flush 生命周期。输出 `docs/agent-lifecycle-characterization.md`。结论：不合并流循环；可提取共享 emitMetricsViaStore 模式；CodeX runId 竞态防护更健壮。 | P2 | ✅ 已完成 |
| T198 | architecture/storage | **Settings Storage Facade**：收拢 app-owned settings 写入口，统一 locale/theme/diagnostics/CodeX defaults/Claude app prefs 的 owner 与 facade；不重开 provider authority。执行入口：`docs/plan/2026-07-06-storage-phase-2-chat-settings-session.md`。新建 `settingsFacade.js`（5 命名空间，惰性迁移，原子写入）+ 8 文件改造 + 16 合约测试。 | P1 | ✅ 已完成 |
| T199 | architecture/storage | **Session / Panel Storage Boundary Audit**：盘点 `session-registry`、panel-state、renderer restore persistence 的权威边界，先审计不迁移。执行入口：`docs/plan/2026-07-06-storage-phase-2-chat-settings-session.md`。产出 `docs/plan/2026-07-06-T199-session-panel-storage-audit.md`（7 节审计文档）。 | P2 | ✅ 已完成 |

> 最后更新：2026-07-06
> 知识库入口：`docs/index.md`

⚠️ **会话相关 bug 排查第一入口**：`docs/session-pitfalls.md`（跨 Agent 陷阱全景图）
⚠️ **当前性能优化入口**：`docs/perf-audit-report.md`
⚠️ **SDK 能力审计**：`docs/sdk-feature-gaps.md`

---

## 2026-06-27 Renderer Convergence ✅ 已完成 (2026-06-29)

核心架构收敛（`useAgentMetricsController`、共享 `StatusBarMetrics.vue`、contract tests）已在 2026-06-28 完成。R06 剩余收口（first-hydrate `{ immediate: true }` + 28 个新测试）于 2026-06-29 完成。全量 282 tests 0 fail。

## 2026-06-28 Architecture Health Review → 重构执行方案 ✅ 已对齐

ClaudeCode 全量审计 + CodeX 复审完成，输出 `docs/architecture-health-review-2026-06-28.md`（966 行执行方案）。8 个阶段，护栏优先、叶子模块先拆。已创建 TODO 任务跟踪，即日开始执行。

执行原则：
- 先补护栏再拆模块；每次只改一个边界
- 巨型文件只拆叶子模块（config/skills/plugins/environment），不动 stream/queue/abort/done
- 不做 ClaudeCode/CodeX 大一统合并；共享生命周期，不吞 provider 差异
- 每个阶段跑 `npm test` + `npm run test:contract` 验证

当前节奏（2026-06-28 晚）：
- R01/R02/R03/R05/R07/R08 先冻结，不继续强行推进 R04/R06。
- 先完成当前代码验收；稳定后按 `docs/build-and-deploy.md` 打包。
- R04/R06 拆成专项后再开：先补 characterization tests，再抽纯函数，再逐步接入 CodeX / ClaudeCode。
- `setupClaudeHandlers()` / `setupCodexSdkHandlers()` 主进程巨型 handler 另立 R09，不再作为 R04 的阻塞原因混写。

## 2026-06-29 Architecture Refactor Freeze ✅ 已完成

Batch 0-5 已全线交付并冻结，当前新版已切换到实际测试使用。自动验收和人工 smoke 均已通过，详见 `docs/plans/remaining-refactoring-roadmap.md`。

已确认：
- `npm run test:contract`：ESLint `no-undef` clean，291 assertions pass。
- `npm test`：120 pass / 0 fail。
- `npm run build`：Vite 构建成功。
- `npm run dev` 人工 smoke：ClaudeCode / CodeX 发消息、中断、历史恢复、插件/skills 列表、配置保存均正常。

当前策略：
- R01-R09 / Batch 0-5 不再继续拆分，进入稳定观察期。
- `claudeAgent.js` / `codexAgent.js` 当前已到自然边界，不再为了行数继续拆 stream loop、abort/done、session map、token flush 主状态机。
- R10 IPC 通道统一暂缓；先补 Electron E2E 覆盖，再单独开新路线图评估。

## 2026-07-01 重构后稳定性收口登记

这轮重复 session 问题不是单纯漏补一行，而是重构后的中间态暴露了几个结构性风险：身份模型已经拆清楚，但 registry / scan / done / panel state / restore 的写入口仍分散；IPC registry 已有 baseline，但新增通道仍可能只“登记”而没有强制使用常量；Electron E2E 仍不足以覆盖重启、恢复、preload/main/renderer 端到端链路。

已单独注册 T165-T168，避免这些问题只在触发 bug 后才被动处理。Claudecode 执行前应先读对应文档，不要把它们并入普通“减行数”重构。T165 继续执行入口：`docs/plan/2026-07-01-session-registry-ownership-handoff.md`。

## 2026-07-02 性能 / Metrics 收口 ✅ 已完成主线

T169-T173 已把这轮重构后的主要体验问题收住：renderer 高频热路径、session/tab 切换、metrics 刷新、CodeX metrics 后台化、draft 磁盘 I/O 均已分阶段落地。当前不是继续盲目拆代码的阶段，后续性能优化必须先有探针或 Electron E2E 证据。

已完成：
- T169：ProjectTabs summary helper、provider summary 单一 computed、CodeHub `collectTabs` 白名单化、`saveAsync` 双重 JSON clone 删除、textarea autosize rAF 合并。
- T170：切换链路探针扩展、dev console 收口、共享 `useScheduledSessionRefresh`、per-project refresh cooldown、scroll restore 的 atBottom / clamp 修复。
- T171：metrics 正确性与性能量化收口，包含 resetMetrics、`isEnabled` 缓存、hasMore 数值修复、perf flag 同步、快照去重和 IPC guard。
- T172：CodeX metrics 切 tab 后后台化，不再 await full metrics IPC；Claude metrics Phase 2 因 T171 后平均耗时已很低，明确跳过。
- T173：session draft 两级内存缓存落地，切 tab 不再每次读写磁盘；已补 userDataDir 隔离和删除 record 时清理缓存。
- 追加修复：CodeX turn token aggregation 已修复，避免 CodeX 回合 token 聚合漂移。

保留风险：
- Electron E2E 仍缺：真实 preload/main/renderer 链路、重启恢复、并发 scan/done、settings 保存仍需端到端覆盖。
- 超大 JSONL / 超长历史若仍慢，下一步应评估 Worker/off-main-thread metrics，而不是继续扩大 renderer computed 改造。
- 性能日志必须通过显式 debug/perf flag 打开，禁止默认 dev console 噪音回潮。

2026-07-04 追加登记：
- T176 单独处理大 session 渲染卡顿。当前证据指向 CodeX 历史恢复把大量已完成 tool 默认展开并挂载完整 bash output，导致当前页面 DOM/Layout/Paint/hit-test 过重；执行入口：`docs/plan/2026-07-04-large-session-rendering-performance.md`。
- T176 不回滚 T168，不混入 T174/T175 存储迁移，不做虚拟列表或输入框大拆；Phase 1 只做 CodeX history tool 默认折叠与大 bash 输出懒挂载。
- T176 已收口：Phase 1 完成，Phase 2a-0 探针证伪 `renderContent` / computed / 普通大消息折叠方向。剩余切 session 后卡顿转入 T177：`docs/plan/2026-07-04-session-switch-background-task-latency.md`。
- T177 先做 renderer/main IPC 分段对齐，调查 draft / session instruction / metrics / history range read 的 1s 级 wall time 和返回后主线程竞争；禁止先改缓存策略。
- 2026-07-04 晚补充：T177 主线已验收，CodeX + Claude metrics 主进程阻塞已修。剩余体感卡顿转入 T177-P2，只做 renderer Performance trace 归因；执行入口：`docs/plan/2026-07-04-renderer-dom-layout-and-cache-governance.md`。
- 2026-07-05 补充：T178 已实施一版 session scan 调度/缓存，但项目 tab 切换仍需从“继续加缓存”切换到 activation work graph 收口。新主线 T179：`docs/plan/2026-07-05-project-session-activation-work-graph.md`。目标是量化一次切换到底触发哪些 history/draft/instruction/metrics/scan/registry 工作，随后拆除 cache hit 路径里的 registry 写副作用。
- 2026-07-05 晚补充：T176 / T177 / T177-P2 / T179 均已完成各自阶段目标；剩余卡顿不再继续归入“加缓存”，统一进入 T181：`docs/plan/2026-07-05-hot-path-governance-and-streaming-render.md`。下一步先量化 CodeHub startup / activation lifecycle，重点检查 all-panel mount、CodeX await active project scan、active chat scan reload 闪烁；streaming `v-html` 只作为后续阶段。
- 2026-07-05 深夜补充：T181 activation chain 主线已完成，切 session 卡顿收口到同步段治理和 active chain 拆分；T182 移除窗口 focus 自动扫描轮询，改为发送/done 边界即时排序与 fileSize 精准更新；T183 完成缓存治理 Phase 0-3 主线，文件派生缓存和 metrics aggregate dedup 已统一 helper。后续性能问题先走 T183 缓存治理规则，不再新增未登记 Map。
- 2026-07-05 SessionIndex 交接：T184 已登记，第一版只做 CodeHub 被动 `SessionIndex` + eager mount，不启用 lazy mount。目标是让顶部 tab/icon 的初始存在性脱离 provider panel ready，执行入口：`docs/plan/2026-07-05-codehub-session-index-handoff.md`。
- 2026-07-05 重构后清理登记：多轮重构后不建议直接“全局删代码”。新增 T187 / T188，把真正疑似死代码、孤岛业务线、预加载 API、依赖清理，与 provider projection / electron-conf / 旧 IPC / standalone window 等兼容退出窗口分开处理。执行入口：`docs/plan/2026-07-05-dead-code-and-redundant-business-route-audit.md`、`docs/plan/2026-07-05-legacy-compatibility-exit-plan.md`。

## 2026-07-03 本地存储重构收口：Provider Storage Migration

T169-T173 性能和体验优化完成后，继续做 provider 排序、导入/导出、active 配置、配置历史和后续 session/settings 收口都会反复触碰“谁是存储权威”。因此下一阶段不再继续在 legacy provider list、electron-conf、panel state、localStorage 之间做零散补丁，而是先把 provider 配置存储权威定下来。

T174 已完成实现，执行和验收入口保留在 `docs/plan/2026-07-03-provider-storage-migration.md` 与 `docs/plan/2026-07-03-provider-storage-handoff.md`。当前权威状态见 `docs/STORAGE_ARCHITECTURE_ANALYSIS.md#11-current-implemented-state-after-t174`。

已落地：
- SQLite 成为 CodeX / ClaudeCode provider 配置权威源。
- `providerStorage` repository 统一 provider 读写、legacy fallback/backfill/projection。
- DB schema 升至 v3：v2 增加 `sort_index` / projection bookkeeping，v3 一次性清理历史 Claude provider config 污染。
- 系统导入/导出和 provider IPC 已走 repository-backed provider source。
- 官方运行时文件仍是显式投影：CodeX `~/.codex/config.toml`，ClaudeCode `~/.claude/settings.json`。

边界：
- 只迁移 CodeX / ClaudeCode provider 配置、active provider、排序、导入/导出读取源和 legacy projection。
- 不迁移 session registry、panel state、聊天记录、JSONL、上传文件、token metrics。
- 当前 DB 使用 `sql.js`，只存配置和少量审计记录足够；禁止把大日志、聊天记录、文件 blob 塞入 `mindcraft.db`。
- 简易 Chat 后续单独开 T175：SQLite 存 thread/index/summary，消息正文和附件存 userData 文件夹，避免 `sql.js` DB 被 append-heavy 内容撑大。
- DB 需要维护策略：`import_runs`、备份、legacy projection 都必须有保留窗口和清理计划，避免只增不减。

后续：
- T195 已停止 provider legacy 写投影，当前只保留读回退；后续再定义读回退的最终退出窗口。
- T164 实现可视化拖拽排序，复用 T174 已有 repository ordering。
- T175 进入下一阶段：Simple Chat 元数据/消息体边界分离。
- T198 负责 app-owned settings facade，统一 locale/theme/diagnostics/CodeX defaults/Claude app prefs 的存储 owner。
- T199 只做 session/panel 存储边界审计，不与 T175/T198 混做。
- 如后续代码直接调用 repository `setActiveProvider()`，需保证它与“无 legacy 写投影”的当前模型保持一致；当前 UI 主路径大多通过完整 provider save。

## 2026-07-06 本地存储 Phase 2 规划：Chat + Settings + Session Boundary

Provider 存储主线在 T174/T195 已经收口，不应继续把后续零散需求塞回 provider migration。当前剩余存储问题已经分成三类，必须拆题：

- T175：Simple Chat 存储边界与迁移。当前 `{userData}/chat-sessions/index.json + <id>.json` 混存 metadata + messages，后续应改为 SQLite 元数据 + `messages.jsonl` 文件正文。
- T198：Settings Storage Facade。当前 locale/theme/diagnostics/CodeX defaults/Claude app-owned prefs 仍分散在 JSON 与 `electron-conf`，先统一 owner 和 facade，不强行全部入 SQLite。
- T199：Session / Panel Storage Boundary Audit。先审计 `session-registry`、`*-panel-state.json`、renderer restore persistence 的职责边界，不直接做迁移。

统一执行入口：`docs/plan/2026-07-06-storage-phase-2-chat-settings-session.md`。

## 2026-06-27 Docs Knowledge Base Cleanup ✅ 已完成 (2026-06-28)

- ✅ 新增 `docs/index.md` 作为知识库索引
- ✅ 整理 `docs/TODO.md`：保留活跃 P0/P1，已完成细节留在对应的 dated plan 中。
- ✅ 合并 CodeX chat proxy 文档：历史 plan/empty-stream/acceptance-test 已在公开发布整理中移除。
- ✅ 更新 AGENTS.md / CLAUDE.md 文档路由表

## 2026-06-27 Metrics Follow-up Risks

现状：本轮已修住一批 Token Metrics 明确错误值与 `CodeX` idle 无限刷新的问题，但仍有几类"首次渲染/消费层不对称"隐患没有彻底收口。

待办：
- ClaudeCode 首次切入某个历史会话时，底部 `StatusBarMetrics` 偶发不出现；优先排查首次进入时的 `activeTab -> refreshMetricsForChat -> onMetricsUpdate` 顺序。
- 收敛 ClaudeCode / CodeX renderer metrics 消费方式：renderer 的触发链、首次 hydrate 时机、live update 路由需要对称。
- 为"首次进入历史会话时 status bar 应展示最近一轮 final snapshot"补契约测试。
- 补 renderer metrics 生命周期图。

## 2026-06-25 通知音回归修复

现象：完成音音量偏轻，同一 ClaudeCode 会话里经常只有第一轮完成会响。

已修复：
- `agentNotificationGate` 从永久保留最近 32 个 key 改为 1.5s TTL 去重。
- `playDoneSound` 改为两段低频柔和 sine 音。
- `notificationAudio` 增加用户交互后的 WebAudio unlock。

验证通过：`node --test tests/agent-notification-gate.test.mjs tests/agent-protocol.test.mjs tests/agent-event-emit.test.mjs`

## 2026-06-24 架构重构稳定观察

Agent 架构重构 PR1-PR3 已完成主线：Agent Registry / Agent Protocol / Agent Client 雏形、Main 双发 `agent:event`、通知音迁移到 `agent.turn.terminal` + 去重闸门。旧 `claude-agent-*` / `codex-agent-*` 通道仍保留为兼容路径。

当前策略：先运行当前版本一段时间，确认稳定后再继续 PR4+。

后续入口：`docs/plan/2026-06-24-architecture-review-notification-refactor.md#12-后续节奏稳定观察后再继续`

观察期通过标准：
- 没有新增"会话卡死 / done 丢失 / queued input 不发送 / 完成音重复播放"类 P0/P1 问题。
- 核心测试矩阵通过：`npm test`，以及 `agent-notification-gate` / `agent-event-emit` / `agent-protocol` / `codex-agent-done-reason` / `codex-runtime-state`。

---

## 2026-06-29 历史测试修复专项

在 R01-R08 重构验收时发现 `npm run test:all` 有 7 个失败，经排查全部重构前就存在（原始代码同样 7 fail），非本次引入。

### 测试方案问题（3 个）

| 测试文件 | 现象 | 根因 | 修复方向 |
|----------|------|------|----------|
| `tests/todo-list-parser.test.mjs` | `SyntaxError: Unexpected identifier 'in_progress'` | 文件内字符串编码损坏 | 重新编码/重写测试文件 |
| `tests/update-plan-parser.test.mjs` | `SyntaxError: Invalid or unexpected token` | 同上，文件内字符串损坏 | 重新编码/重写测试文件 |
| `tests/electron-window-icon-paths.test.cjs` | `ENOENT: electron/codeWindow/index.js` | 硬编码路径 `codeWindow` 在项目中不存在 | 更新路径或删除过时测试 |

### 可能真实 bug（4 个，需人工诊断）

| 测试文件 | 现象 | 可疑方向 |
|----------|------|----------|
| `tests/local-search.test.cjs` | `runAgentListFilesQuery` 返回 `undefined` 而非 `['src/components/']` | `localSearch` 模块查询逻辑变更或测试预期过时 |
| `tests/claude-permission-sound.test.mjs` | `assert.strictEqual(false, true)` — permission hook 未触发 | 计时/异步竞态；或 `useClaudeAgentStream` 环境依赖不满足 |
| `tests/claude-task-stream-sync.test.mjs` | result turn tokens deep-equal 不匹配 | token 归属计算逻辑与测试预期不一致 |
| `tests/claude-task-stream-sync.test.mjs` | detachResume 状态 deep-equal 不匹配 | cli mapping 注册/清理逻辑变更 |

> 全部 7 个在重构前 `18579ce` 提交即已失败。`test:contract`（154 合同测试）不受影响全部通过。

## 2026-07-06 UX 功能登记：文档/通知/弹窗/文案

登记 4 个 UX 相关新需求（T189-T192）：

1. **T189 文档模块持久化** — 重启后文档 tab 清空，是因为 `mdViewer` 的 `tabs` ref 只在 keep-alive 生命周期内存活。`recentDocs` 已通过 IPC 持久化，但打开的 tab 列表和 activeTab 没有。对接方式：在 `onMounted` 恢复、卸载/切换时保存到 electron-conf。

2. **T190 项目 session 运行闪烁** — 侧边栏已有 `codehubHasNotification` 机制（仅对 `hasDoneNotification` 触发 amber pulse）。需要新增对 `runningCount > 0` 的 blink 效果。`Main.vue` 和 `codeHub/index.vue` 之间通过 inject/provide 已有现成通道，只需扩展通知条件。

3. **T191 AskQuestionDialog 非全局化** — 当前 `AskQuestionDialog.vue` 使用 `<Teleport to="body">` + `position: fixed`，全局覆盖。需要：(a) 去掉 Teleport，改为面板内 `position: absolute`；(b) 当用户不在 ClaudeCode tab 时，tab 显示高亮提醒。与 `hasPendingTool` 的蓝色 dot 机制一致。

4. **T192 统一加载文案** — 三个组件共用 `agent.restoringSession` locale key，但文案硬编码了"Claude Code"。仅需改 locale JSON 文件，代码零改动。

---

## 活跃任务

| 编号 | 分类 | 说明 | 优先级 | 状态 |
|------|------|------|:------:|------|
| T141 | refactor | **ClaudeCode Runtime / Metrics State Machine 重构**：thinking/_thinkingStart/currentAssistantId 生命周期写入口收敛到 `claudeRuntimeState.mjs`。详见 `docs/plan/2026-06-19-claude-runtime-metrics-state-machine.md`。 | P0 | ✅ 已完成 |
| T139 | perf | **界面卡顿性能优化**：第二轮已完成 Claude/CodeX projectTabs 派生状态优化、长历史 session 按页读取。详见 `docs/perf-audit-report.md`。 | P0 | ✅ 已完成 |
| T144 | bug | **Token Metrics 统计 BUG 修复**：问题已从"点状 bug"升级为"结构分叉"，后续不能继续靠零散 patch 维持。 | P1 | ✅ 已完成 |
| T145 | feature | **Token 数据实时增长**：平滑数字计数已完成；live 样本来源和 turn 归属已收口。详见 `docs/token-metrics.md`。 | P1 | ✅ 已完成 |
| T180 | architecture/metrics | **Metrics context authority + renderer convergence**：`contextSource/contextAuthority`、new-turn carry-forward、低权威 context 防覆盖已落地；上一轮 `in/out/cache/duration` 不继承。Renderer 首次 hydrate 仍作为观察项，复发时按该文档继续收口。执行入口：`docs/plan/2026-07-05-metrics-context-authority-and-renderer-convergence.md`。 | P1 | ✅ 核心已完成，renderer 继续观察 |
| T152 | refactor/bug | **Markdown 渲染与本地路径链接化收口**：Phase 1/2 已完成（共享 tokenizer + `markdown-it` 插件）；后续再推进 Agent 气泡全量切换到共享 renderer。详见 `docs/plan/2026-06-26-markdown-renderer-consolidation.md`。 | P1 | 🔄 Phase 1/2 完成 |
| T148 | bug | **ClaudeCode 用户 bubble 混入内部 review/simplify meta prompt**：已在历史归一化与 panel-state restore 层过滤 `isMeta` 内部 user prompt。 | P1 | ✅ 已完成 |
| T147 | bug | **CodeX 中间进度 assistant 文本偶发不渲染**：已补主进程规范化转发与历史解析兼容。 | P1 | ✅ 已完成 |
| T140 | ux/refactor | **Agent running 中再次发送 / pending 输入可视化**：CodeX 增加 pending queue UI；ClaudeCode 让发送按钮状态与 Enter 行为一致。 | P1 | 📝 待方案 |
| T165 | architecture/bug | **Session Registry ownership 收口**：Phase 1/2 与字段权威审计已完成；provider owner contract、runtime merge contract、Claude model/effort、CodeX reasoningEffort 和真实链路覆盖均已收口。执行入口：`docs/plan/2026-07-01-session-registry-ownership-handoff.md`。 | P1 | ✅ 已完成 |
| T166 | architecture/test | **IPC registry 新增通道硬约束补齐**：现有 baseline 可发现未登记 channel，但后续新增 main/preload channel 仍需强制引用 `ipcChannels` 常量，避免字符串字面量绕过 registry；保留历史 channel 兼容，不做命名大一统。详见 `docs/plans/remaining-refactoring-roadmap.md#phase-cipc-registry-从软约束升级为新增通道硬约束`。 | P2 | 📝 待方案 |
| T167 | test/architecture | **Session/Run 竞态 E2E 前置覆盖**：sessionRegistry 集成覆盖与 Electron E2E 真实链路覆盖已完成，覆盖 CodeX/Claude scan/done/restore、panel cache 覆盖安全、删除一致性和跨 agent 隔离。详见 `docs/session-pitfalls.md`。 | P2 | ✅ 已完成 |
| T168 | refactor/bug | **CodeX event rendering contract 收口**：已完成 live stream + history mapper 修复：tool call 不渲染、assistant 空泡泡、`<thinking>tool call</thinking>` 泄漏、agent_message 覆盖 assistant 正文、shell history 输出缺失均有契约测试覆盖。详见 `docs/plan/2026-07-01-codex-event-rendering-contract.md`。 | P1 | ✅ 已完成 |
| T169 | perf/refactor | **Renderer 高频链路性能瘦身**：已完成 Phase 0-5：开发态探针、ProjectTabs summary helper、provider summary 单一 computed、CodeHub `collectTabs` 白名单、`saveAsync` 去双重 clone、textarea autosize rAF 合并。不混入 CodeHub SessionIndex 大重构。详见 `docs/plan/2026-07-02-renderer-hot-path-performance.md`。 | P1 | ✅ 已完成 |
| T170 | perf/ux | **Session / Tab 切换性能收口**：已完成切换链路探针、dev console 收口、共享 scheduled refresh、per-project cooldown、scroll restore atBottom/clamp 修复；保留 session scan 防御逻辑，不写 scroll 到 session registry。详见 `docs/plan/2026-07-02-session-tab-switch-performance.md`。 | P1 | ✅ 已完成 |
| T171 | perf/metrics | **Metrics 正确性与性能量化收口**：完成 metrics reset、`isEnabled` 缓存、hasMore 数值修复、探针补全、IPC guard、快照去重、默认参数和 CodeX metrics 内部分段。 | P1 | ✅ 已完成 |
| T172 | perf/metrics | **CodeX metrics 后台化**：CodeX 切 tab / 点 session 后不再 await full metrics IPC；后台完成时通过 active guard 回填。Claude Phase 2 因 T171 后收益过低已明确跳过。详见 `docs/plan/2026-07-02-T172-session-switch-performance.md`。 | P1 | ✅ Phase 1 完成，Phase 2 跳过 |
| T173 | perf/session | **Session draft 两级内存缓存**：draft 写入仍以 session-registry 为事实来源，但 renderer 切 tab 走内存缓存，避免每次磁盘 I/O；已修复 userDataDir 隔离和删除 record 时缓存清理。 | P1 | ✅ 已完成 |
| T174 | architecture/storage | **Provider Storage Migration**：已让 SQLite 成为 CodeX / ClaudeCode provider 配置权威源；新增 provider repository、v2 `sort_index`/projection bookkeeping、v3 Claude provider 污染清理、legacy fallback/backfill；导入/导出/active/reorder 统一走 repository；T195 已停止 provider legacy 写投影，仅保留读回退；不迁移 session/panel/transcript。执行交接：`docs/plan/2026-07-03-provider-storage-handoff.md`；方案详见 `docs/plan/2026-07-03-provider-storage-migration.md`。 | P1 | ✅ 已完成 |
| T175 | architecture/storage | **Simple Chat Storage Boundary**：✅ 已完成。SQLite 只存 thread/index/summary 元数据，消息正文按 thread 写入 `{userData}/simple-chat/threads/<threadId>/messages.jsonl`。DAO + 文件层 + IPC 全链路就位，82 tests pass。两轮 code review 修复（路径穿越校验、部分迁移回退、SAVE 原子性、排序）。执行交接：`docs/plan/2026-07-06-T175-simple-chat-storage-execution.md`。 | P1 | ✅ 已完成 |
| T176 | perf/ux | **大 Session 渲染卡顿收口**：Phase 1 已完成（history tool 折叠 + ToolBash 懒挂载，expanded tools 29-43→0-3）；Phase 2a-0 探针证伪 `renderContent` / computed / 普通大消息折叠方向，后续不再沿渲染缓存继续推进。详见 `docs/plan/2026-07-04-large-session-rendering-performance.md`。 | P1 | ✅ 已收口 |
| T177 | perf/diagnostics | **Session 切换后台任务延迟与主线程竞争**：已完成 renderer/main IPC 分段对齐，并修复 CodeX + Claude metrics 主进程 event loop 阻塞。剩余 renderer DOM/activation 体感问题已转 T177-P2 / T179 / T181。详见 `docs/plan/2026-07-04-session-switch-background-task-latency.md`。 | P1 | ✅ 已完成 |
| T179 | perf/architecture | **Project / Session activation work graph 收口**：已完成 Phase 0 数据采集和 Phase 1 scan cache hit 去 registry 写副作用；后续不再以 T179 扩大缓存。剩余热路径治理转 T181。详见 `docs/plan/2026-07-05-project-session-activation-work-graph.md`。 | P1 | ✅ Phase 1 完成 |
| T179-P1 | perf/architecture | **scan cache hit 去写副作用**：已拆为 `ensureRegistryFromProviderScan()`（允许写，仅 cache miss/repair/new transcript）和 `mergeRegistryFieldsIntoScanSummary()`（纯读/纯合并，hot cache path 使用），并加入 `upsertSessionRecord()` no-op 快速返回。 | P1 | ✅ 已完成 |
| T181 | perf/architecture | **CodeHub Startup / Activation Hot Path 收口**：Activation Chain Governance 已落地，切 session 卡顿主线收口；后续不再把启动/切换问题混入 streaming render，active streaming `v-html` 仅作为独立后续专项。详见 `docs/plan/2026-07-05-hot-path-governance-and-streaming-render.md`。 | P1 | ✅ 已完成主线 |
| T182 | perf/architecture | **Session scan 瘦身与排序收口**：移除窗口 focus 自动刷新轮询，改为发送完成/done 边界即时更新 `updatedAt/fileSize` 并重排 sessions；CodeX send 对 undefined active project 做防御。 | P1 | ✅ 已完成 |
| T183 | architecture/perf | **Cache Governance / Local Derived Data Boundary**：完成缓存盘点、低风险修复、`createFileDerivedCache()` 迁移 5 个文件派生缓存、registry read cache 清理、metrics aggregate in-flight dedup 统一 `trackDedup()` + timeout/identity guard；session scan/renderer dedup 延后。详见 `docs/plan/2026-07-05-cache-governance-and-local-derived-data.md`。 | P1 | ✅ Phase 0-3 主线完成 |
| T184 | architecture/perf | **CodeHub SessionIndex Phase 1/2**：新增被动轻量索引，从 panel-state/session-registry 恢复顶部 tab 摘要，provider `projectTabData` 只作为 runtime patch；保留 eager mount，不启用 lazy mount。详见 `docs/plan/2026-07-05-codehub-session-index-handoff.md`。Phase 1-3 全部交付（`codehubSessionIndex.js` loader + `useSessionIndex.mjs` merge layer + CodeHub 接入 + 2 个测试文件）。 | P1 | ✅ 已完成 |
| T185 | test/architecture | **Electron E2E Smoke Harness**：补真实 Electron preload/main/renderer 链路验收，优先覆盖启动、preload bridge、settings sanitizer、session restore；默认不使用真实 provider API key。详见 `docs/plan/2026-07-05-electron-e2e-smoke-harness.md`。 | P2 | 📝 待方案 |
| T186 | architecture/refactor | **Agent Core Lifecycle Boundary Audit**：审计 ClaudeCode / CodeX stream、abort、done、queue、session map、metrics flush 等核心生命周期边界；不为减行数强拆，先画生命周期 work graph 和补 characterization tests。详见 `docs/plan/2026-07-05-agent-core-lifecycle-boundary-audit.md`。 | P2 | 📝 待方案 |
| T187 | architecture/cleanup | **Dead Code / Redundant Business Route Audit** ✅ 主线完成。Phase 0 inventory + Phase 1 guard tests (43 tests) + Phase 2 preload 安全面收敛（移除 openNewWindow/openSingleWindow）+ Phase 3 孤立代码删除（5 组件 + 5 目录 + 9 工具文件）+ Phase 4 依赖清理（8 npm 包）。删除 19 源文件 + 82 npm 包。Inventory：`docs/plan/2026-07-06-T187-phase0-inventory.md`。 | P2 | ✅ 主线完成 |
| T188 | architecture/compat | **Legacy Compatibility Exit Plan**：为 provider legacy projection、electron-conf runtime、旧 IPC 名称、standalone agent window、session sidecar fallback 等兼容路径建立退出窗口；不与 T187 死代码清理混删。兼容 Register：`docs/compatibility-register.md`；方案：`docs/plan/2026-07-05-legacy-compatibility-exit-plan.md`。 | P2 | 🔧 Phase 0 完成（register + electron-conf 分类） |
| T201 | architecture/storage | **Session / Panel Storage Convergence** ✅ 已完成。Schema v5（3 表 + 4 索引）、DAO（12 函数 + 18 合约测试）、sessionRepository（SQLite-first 读写、JSON fallback、draft/instruction 委托）、scan flow 切换（claudeAgent/codexAgent → sessionRepository）、panel-state 去 syncPanelStateSessions（读/写路径均已移除）、setSessionTitle/upsertRuntimeByProvider 路由到 SQLite、codehubSessionIndex 路由到 listSessions（SQLite-first）、deprecation 标记（sessionRegistry.js）。383 tests pass（0 fail）。详见 `docs/plan/2026-07-07-T201-session-panel-storage-convergence.md`。 | P1 | ✅ 已完成 |
| T200 | bug/ux | **Skill/Plugin 配置与 UI 不同步**：5 根因修复完成 — `slashCommandsCache.clear()` 补全 (Claude 5 handler + CodeX 7 handler)、`plugin-registry-ready` 事件名修复、renderer 事件绑定补全、CLI fallback 日志。缓存失效参考文档：`docs/skill-plugin-cache-invalidation.md`。 | P1 | ✅ 已完成 |
| T202 | architecture/bug | **CodeX file-change event convergence** ✅ 已完成：收敛 SDK `file_change` 与 JSONL `patch_apply_end` 的事实源；修复新版 `call_*` wrapper 与 `exec-*` patch ID 脱钩造成的空/不稳定 diff。权威 diff 由 reducer 保留，live/history 共享规则，保留既有异步 Git fallback 和 idle diff parse 性能边界。详见 `docs/plan/2026-07-14-T202-codex-file-change-event-convergence.md`。 | P1 | ✅ 已完成 |
| T135 | tech-debt | **Session Registry 后续增强**：`writeJsonAtomic()` 未做 fsync；CodeX session instruction 注入走 user prompt 前缀；`bothFailed` locale key 死代码清理。 | P3 | ⏸️ 部分完成 |
| T133 | tech-debt | **review follow-up：重复 helper 收敛评估**：`documentLocator.js` 与 `skillsSecurity.js` 各自保留 `isRealPathInside`；`normalizeReasoningEffort.mjs/.cjs` 双份折中。 | P3 | ⏸️ 记录 |
| T039 | feature | **语音输入能力**：实现前需确定录音权限、STT provider、隐私提示和跨平台权限。 | P3 | ⏸️ 暂缓研究 |
| T040 | eval | **Remote 远程接入方案研究**：产品边界未定，不作为近期实现项。 | P3 | ⏸️ 暂缓研究 |
| R01 | infra | **Phase 1: 测试与架构护栏前置**：新增 `test:contract`/`test:all` 脚本；contract test runner；IPC 对账/no-console/脏 panel state 测试。详见 `docs/architecture-health-review-2026-06-28.md#4`。 | P1 | ✅ 已完成 |
| R02 | infra | **Phase 2: 共享基础设施**：抽取 `agentProtocolBridge.js`；收敛 MindCraft settings helper；创建 logger facade。详见 `docs/architecture-health-review-2026-06-28.md#5`。 | P1 | ✅ 已完成 |
| R03 | refactor | **Phase 3: IPC channel registry**：创建 `ipcChannels.js`（CLAUDE/CODEX/CORE 三组）；`registerIpcHandler.js` helper；preload/main 对账测试。详见 `docs/architecture-health-review-2026-06-28.md#6`。 | P1 | ✅ 已完成 |
| R04 | refactor | **Phase 4: Tab/History composable 收敛**：R04a ✅ characterization tests（97 tests）；R04b ✅ 纯函数提取 + adapter 契约；R04c ✅ CodeX useAgentTabs；R04d ✅ ClaudeCode useAgentTabs；R04e ✅ History 收敛 — useAgentHistory + historyProviderAdapter + 双端 thin wrapper。全量 251 tests 0 fail。详见 `docs/architecture-health-review-2026-06-28.md#7`。 | P1 | ✅ 已完成 |
| R05 | refactor | **Phase 5: 巨型文件拆叶子模块**：`codexAgent.js`（5103→4834，-269行）拆 configManager + environment；`claudeAgent.js`（3935→3791，-144行）拆 environment。详见 `docs/architecture-health-review-2026-06-28.md#8`。 | P1 | ✅ 已完成 |
| R06 | refactor | **Phase 6: Renderer Convergence 剩余收口**：R06a ✅ ClaudeCode `{ immediate: true }` first-hydrate 修复；R06b ✅ first-hydrate tests（10 tests）；R06c ✅ statusbar/footer contract tests（10 tests）；R06d ✅ dirty panel state tests（8 tests）。详见 `docs/architecture-health-review-2026-06-28.md#9`。 | P2 | ✅ 已完成 |
| R07 | refactor | **Phase 7: `electron/main.js` 拆分**：拆出 `themeStore.js`（44行）+ `tray.js`（47行），main.js 655→616。详见 `docs/architecture-health-review-2026-06-28.md#10`。 | P2 | ✅ 部分完成 |
| R08 | infra | **Phase 8: Vite 5 升级**：Vite 4.4.6 → 5.4.21；`@vitejs/plugin-vue` 4.4.0 → 5.2.x；构建成功，154 测试全通过。详见 `docs/architecture-health-review-2026-06-28.md#11`。 | P3 | ✅ 已完成 |
| R09 | refactor | **Main handler setup 拆分专项**：`setupClaudeHandlers()` / `setupCodexSdkHandlers()` 按 IPC 组拆注册边界；先拆 config/skills/plugins/session-instruction/environment，stream/queue/abort/done 主循环暂缓。 | P2 | ✅ 已完成 (Batch 0-5) |
| B0-5 | refactor | **架构重构 Batch 0-5 全线交付**：R01-R09 护栏 + 叶子模块拆分 + Skills/Marketplace 共享化 + CLI executor 去重 + TOML IPC 合并。新增 ESLint `no-undef` 护栏 + 导入完整性测试。291 合约断言 + 120 单元测试通过，人工 smoke 已通过。详见 `docs/plans/remaining-refactoring-roadmap.md`。 | P1 | ✅ 已完成，阶段冻结 + 观察期 |
| R10 | refactor | **长期 IPC 通道统一**：需 E2E 前置覆盖后再评估。当前 ClaudeCode/CodeX 通道名不统一，但重命名有静默失效风险。 | P3 | ⏸️ 后续阶段，需 E2E 前置 |
| T155 | test | **修复 `test:all` 7 个历史失败**：4 个已修复（todo-list/update-plan 编码损坏重写、electron-window-icon-paths 过时删除、local-search async/await+过时文件删除）；3 个 defer（permission-sound 需 Vue 测试环境、task-stream-sync ×2 需 domain 排查）。`test:all` 7→3 fail。 | P3 | 🔧 部分完成，3 个延后 |
| T156 | bug | **CodeX `scrollBottom is not defined`**：`codeX/index.vue` 6 处裸 `scrollBottom(tab.id)` 改为 `smartScrollToBottom(tab.id)`，解构重命名冲突已修复。 | P3 | ✅ 已完成 |
| T157 | ux | **ClaudeCode turn metric 刷新后时间不显示**：在 `agentCommon/StatusBarMetrics.vue`，需跑应用排查渲染逻辑。疑似旧有问题，延后。 | P3 | 🔧 延后排查 |
| T158 | bug | **快捷键在某些环境下无法识别**：修复 `register()` 覆盖 Bug（同名 actionId 后注册者覆盖先注册者 → 两个 HistorySidebar 只能一个生效）。改为数组存储多 handler，按 enabled/priority 动态匹配。新增 `window.__mc_shortcut_debug` 诊断日志开关辅助排查环境问题。 | P2 | 🔧 部分完成 |
| T159 | architecture | **存储架构 SQLite 路线图**：SQLite 基础设施与 CC Switch 解析器可保留，但评审发现 CC Switch 导入入口绑定单 Agent 面板是错误边界；需按 T163 改为系统设置全局导入后再关闭。详见 `docs/plan/2026-06-30-storage-sqlite-cc-switch-import.md`。 | P2 | 🔧 评审返工 |
| T160 | ux | **工具栏路径可点击打开**：`ClaudeToolbar.vue` + `CodexToolbar.vue` `.cwd-text` 已显示完整路径，点击 → `openFolder()` 在文件管理器打开，hover 下划线变色。 | P2 | ✅ 已完成 |
| T161 | feature | **开机自动启动设置**：`ipcChannels.js` 注册 `GET_LOGIN_ITEM` / `SET_LOGIN_ITEM`；`SystemSettings.vue` 新增 Switch 开关，复用已有 `ss-switch` 模式。 | P2 | ✅ 已完成 |
| T162 | feature | **配置导入弹窗 + CC Switch 导入**：由 T163 全量覆盖，入口已从单 Agent 配置页上移到系统设置全局导入。 | P2 | ✅ T163 已覆盖 |
| T163 | feature/ux | **系统设置全局 CC Switch 导入**：在系统设置增加 `导入配置`，解析一个 CC Switch `.sql` 后按 CodeX/ClaudeCode 自动分流；预览里处理新增/覆盖/重命名/跳过、unsupported rows、防止未知字段污染 runtime config；active 按 agent 分组且默认不切换；保留各 Agent 配置页 `导入` 仅导本地 CLI 配置。详见 `docs/T163-import-feature.md`。 | P1 | ✅ 已完成 |
| T164 | ux | **Provider 排序拖拽**：从 T163 拆出。在 CodeX/ClaudeCode APISetting.vue provider 列表支持拖拽排序，持久化到 SQLite + legacy storage。 | P2 | 📝 待实现 |
| T189 | feature/ux | **文档模块 tab 持久化**：每次重启后文档 tab 清空（`mdViewer` keep-alive 失活丢失 `tabs`/`activeTabId` ref）。已实现：通过 IPC `getSetting/setSetting('openDocTabs')` 持久化打开的文件列表和 activeTab，onMounted 恢复 pending tabs；非 active tab 点击时懒加载内容。涉及 `src/components/mdViewer/index.vue`。 | P1 | ✅ 已实施 |
| T190 | feature/ux | **项目 session 运行时侧边栏闪烁高亮**：已实现：新增 `codehubHasRunning` ref，CodeHub watch `runningCount > 0` 推给 sidebar；Main.vue 新增 `has-running` class + `sidebar-running-blink` 动画（0.7s 快速闪烁），running 优先于 done 通知。涉及 `src/Main.vue`、`packages/agent/src/components/codeHub/index.vue`。 | P1 | ✅ 已实施 |
| T191 | feature/ux | **ClaudeCode AskQuestionDialog 非全局化**：已实现：去掉 `<Teleport to="body">`，overlay `position: fixed`→`absolute`，z-index 9999→100；`.cc-wrap` 增加 `position: relative`。`onDeactivated` 已有关闭逻辑，`hasPendingTool` 已覆盖 AskUserQuestion 的蓝色 tab dot 高亮。涉及 `AskQuestionDialog.vue`、`claudeCode/index.vue`。 | P1 | ✅ 已实施 |
| T192 | i18n/ux | **统一"智能体界面加载中"文案**：已实施：`agent.restoringSession` → "智能体界面加载中" / "Loading agent interface"；`agent.restoringSessionHint` → "正在加载项目信息，请稍候。" / "Loading project information, please wait."。涉及 `src/locales/zh-CN.json`、`src/locales/en.json`。 | P2 | ✅ 已实施 |

---

## 最近完成

| 日期 | 分类 | 说明 |
|------|------|------|
| 2026-07-06 | feature/ux | **T189-T192 UX 功能 4 连发**：T189 文档 tab 持久化（IPC electron-conf 保存/恢复）；T190 侧边栏 session 运行中闪烁（`codehubHasRunning` + `sidebar-running-blink` 0.7s）；T191 AskQuestionDialog 非全局化（去掉 Teleport，绝对定位面板内）；T192 统一"智能体界面加载中"文案（locale JSON 替换）。 |
| 2026-07-06 | test/e2e | **T196 Electron E2E smoke harness 完成**：19/19 tests，覆盖 Phase 0-4 + 2b sanitizer + 3b restart dedup。修复 E2E 隔离问题（HOME/USERPROFILE 覆盖），Phase 2b 验证 settings sanitizer 通过真实 Electron 链路，Phase 3/3b 验证 seed→scan→restart 无重复 session。入口：`tests/e2e/smoke-boot.cjs`。 |
| 2026-07-05 | metrics | **T180 context authority 核心完成**：TurnStore 增加 `contextSource/contextAuthority`，新回合只继承同 session confirmed context，不继承上一轮 turn tokens；低权威/空 context 不覆盖强 context。 |
| 2026-07-05 | architecture/perf | **T183 缓存治理主线完成**：完成缓存 inventory 和治理规则，新增 `createFileDerivedCache()` / `trackDedup()`，迁移 home/Claude/CodeX JSONL line + metrics aggregate 缓存，registry read cache 修复 stale cleanup，metrics aggregate dedup 增加 timeout 和 identity guard。 |
| 2026-07-05 | perf/architecture | **T182 session scan 瘦身完成**：移除窗口 focus 自动扫描轮询，发送/done 边界即时更新排序和 fileSize，避免切换体验继续依赖后台 scan 顺手修正。 |
| 2026-07-05 | perf/architecture | **T181 Activation Chain Governance 完成主线**：切 session 卡顿从“继续加缓存”收口到 activation 同步段治理；streaming render 后续单独处理。 |
| 2026-07-04 | perf | **T176 Phase 1 完成**：CodeX history tool 默认折叠 + 大 bash output 懒挂载，expanded tools 从 29-43 → 0-3；`renderContent` 探针证伪 markdown 渲染为瓶颈方向；Phase 2a-0 量化探针落地。 |
| 2026-07-04 | perf | **T177 主线验收完成**：主进程 event loop 阻塞根因修复。CodeX + Claude 双端 metrics 聚合缓存 + 冷路径后台聚合，draft/instruction/messages 的 renderer wall 从 700ms-2s → 35-61ms。方案文档：`docs/plan/2026-07-04-session-switch-background-task-latency.md` §9 验收数据。 |
| 2026-07-04 | perf/docs | **剩余卡顿下一阶段已收口为 T177-P2**：新增 `docs/plan/2026-07-04-renderer-dom-layout-and-cache-governance.md`，先做 Performance trace 归因；T178 缓存化暂缓并纳入缓存治理规则。 |
| 2026-07-05 | perf/architecture | **T179 activation work graph 收口登记**：T178 已落地后仍需治理触发链和 cache hit 副作用，新增 `docs/plan/2026-07-05-project-session-activation-work-graph.md`，Phase 0 先补 activationId 和 scan/registry 分段数据。 |
| 2026-07-05 | perf/architecture | **T181 热路径治理入口登记**：T176/T177/T177-P2/T179 不再继续承载新优化；剩余卡顿不以继续加缓存为目标，先查 CodeHub startup / activation lifecycle，streaming assistant render 降级为后续专项。 |
| 2026-07-05 | bug | **Session 完成后排序修复**：ClaudeCode / CodeX 在 turn done 边界显式更新 `updatedAt` 并按最近时间重排所属 project sessions，避免 T181 降低 scan/reload 后不再依赖后台 scan 顺手排序。 |
| 2026-07-02 | perf/metrics | **T169-T173 性能与 Metrics 收口完成**：renderer 热路径瘦身、session/tab 切换后台刷新、metrics dedup/cache-first、CodeX metrics 后台化、session draft 两级内存缓存均已落地；Claude metrics Phase 2 因收益过低跳过；追加修复 CodeX turn token aggregation。后续性能改造需先补 Electron E2E 或明确探针证据。 |
| 2026-06-30 | feature | **T163 系统设置全局 CC Switch 导入**：创建 `systemImportIpc.js`（3 个 IPC handler：pick-file / preview / commit）；SystemSettings.vue 增加导入配置分区预览对话框（CodeX/ClaudeCode 分流 + 冲突标注 + 动作选择 + 重命名输入 + active 切换开关）；CodeX/ClaudeCode APISetting.vue 简化为确认弹窗后直导本地 CLI；新增 6 个 T163 单元测试（mixed SQL / overwrite / active 分组 / 防污染）；6 个 IPC 通道全部注册到 `ipcChannels.js`；构建通过、全量 38 DB 测试 + 5 合同测试 0 fail。 |
| 2026-06-29 | refactor/docs | **架构重构 Batch 0-5 冻结验收完成**：`test:contract`、`npm test`、`npm run build` 通过；人工 smoke 覆盖 ClaudeCode/CodeX 发消息、中断、历史恢复、插件/skills 列表、配置保存，当前进入稳定观察期。 |
| 2026-06-29 | refactor | **R04 Tab/History composable 收敛完成**：R04a-e 全部完成。新增 `useAgentTabs.js`（107行）、`useAgentHistory.js`（162行）、`tabProviderAdapter.mjs`、`historyProviderAdapter.mjs`、4 个 pure helpers。双端 composable 收口为 thin wrapper（各 ~50行）。全量 251 tests（97 表征 + 154 契约）0 fail。 |
| 2026-06-28 | docs | **知识库整理**：新增 `docs/index.md`；精简 `docs/TODO.md` 从 1042→~100 行；CodeX Chat Proxy 文档合并归档；更新 AGENTS.md/CLAUDE.md 路由表。 |
| 2026-06-25 | refactor | **Token Metrics 重构 Phase 0-4 完成**：diagnostics.js / normalizer.js / turnStore.js / ClaudeCode + CodeX 全部 6 个发射点接入 TurnStore；footer/StatusBar/历史恢复消费同一 snapshot。 |
| 2026-06-24 | bug | **更新/安装流程修复**：下载进度条优化 + `quitAndInstall()` 分离进程启动安装器。 |
| 2026-06-24 | refactor | **Agent 架构重构 PR1-PR3 完成**：Agent Registry / Agent Protocol / Agent Client；通知音迁移；旧通道保留兼容。 |
| 2026-06-21 | feature | **CodeX 多模型选择器**：SelectModel 去硬编码，ProviderForm 新增备选模型输入框。详见 `docs/plan/2026-06-21-codex-multi-model-selector.md`。 |

---

## 2026-07-12 文档查看器 (mdViewer) 问题修复

| ID | Category | Scope | Priority | Status |
|----|----------|-------|----------|--------|
| D1 | bug/ux | 文档↔项目切换时聊天自动滚到底部：`onDeactivated` 保存 `saveChatScroll`，`onActivated` 用 `restoreChatScroll` 替代强制 `scrollToBottom`。修复 claudeCode + codeX 双端。 | P0 | ✅ ecf1d05 |
| D2 | ux | 文档标签页滚动位置记忆：新增 `tabScrollTops` Map，切换标签前保存 `.doc-body.scrollTop`，切换后 `requestAnimationFrame` 恢复。懒加载 tab 等 `completePayloadAsync` 完成后再恢复。 | P2 | ✅ 0425641 |
| D3 | ux | 文档标签页拖拽排序：自定义标签栏替代 `el-tabs`，仿 ProjectTabs 拖拽模式，支持重排序 + 视觉反馈。 | P3 | ✅ d5e17a1 |
