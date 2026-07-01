# TODO

> 最后更新：2026-07-01
> 历史归档：`docs/archive/todo-history.md`
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

## 2026-06-27 Docs Knowledge Base Cleanup ✅ 已完成 (2026-06-28)

- ✅ 新增 `docs/index.md` 作为知识库索引
- ✅ 整理 `docs/TODO.md`：保留活跃 P0/P1，历史长文迁移到 `docs/archive/todo-history.md`
- ✅ 合并 CodeX chat proxy 文档：plan/empty-stream/acceptance-test 归档到 `docs/archive/`
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

---

## 活跃任务

| 编号 | 分类 | 说明 | 优先级 | 状态 |
|------|------|------|:------:|------|
| T141 | refactor | **ClaudeCode Runtime / Metrics State Machine 重构**：thinking/_thinkingStart/currentAssistantId 生命周期写入口收敛到 `claudeRuntimeState.mjs`。详见 `docs/plan/2026-06-19-claude-runtime-metrics-state-machine.md`。 | P0 | 🔄 已实现，待人工验收 |
| T139 | perf | **界面卡顿性能优化**：第二轮已完成 Claude/CodeX projectTabs 派生状态优化、长历史 session 按页读取。详见 `docs/perf-audit-report.md`。 | P0 | 🔄 第二轮完成，待人工回归 |
| T144 | bug | **Token Metrics 统计 BUG 修复**：问题已从"点状 bug"升级为"结构分叉"，后续不能继续靠零散 patch 维持。 | P1 | 🔧 进行中 |
| T145 | feature | **Token 数据实时增长**：平滑数字计数已完成；剩余风险是 live 样本来源和 turn 归属收口。详见 `docs/token-metrics.md`。 | P1 | 🔧 进行中 |
| T152 | refactor/bug | **Markdown 渲染与本地路径链接化收口**：Phase 1/2 已完成（共享 tokenizer + `markdown-it` 插件）；后续再推进 Agent 气泡全量切换到共享 renderer。详见 `docs/plan/2026-06-26-markdown-renderer-consolidation.md`。 | P1 | 🔄 Phase 1/2 完成 |
| T148 | bug | **ClaudeCode 用户 bubble 混入内部 review/simplify meta prompt**：已在历史归一化与 panel-state restore 层过滤 `isMeta` 内部 user prompt。 | P1 | 🔄 已修复，待人工回归 |
| T147 | bug | **CodeX 中间进度 assistant 文本偶发不渲染**：已补主进程规范化转发与历史解析兼容。 | P1 | 🔄 已修复，待回归 |
| T140 | ux/refactor | **Agent running 中再次发送 / pending 输入可视化**：CodeX 增加 pending queue UI；ClaudeCode 让发送按钮状态与 Enter 行为一致。 | P1 | 📝 待方案 |
| T165 | architecture/bug | **Session Registry ownership 收口**：Phase 1 已完成：`upsertSessionRecord()` 会从 index + `sessions/*.json` 双来源解析唯一 provider owner，清理同 provider orphan record；`syncPanelStateSessions()` 显式降级为 panel cache 来源，不能覆盖已有 provider binding。剩余：补 Electron E2E 覆盖 scan/done/restore/重启链路，再评估是否继续收口主进程 done 写入口。继续执行入口：`docs/plan/2026-07-01-session-registry-ownership-handoff.md`；背景详见 `docs/session-pitfalls.md#trap-8session-registry-ownership-中间态`、`docs/plan/2026-06-17-session-registry-and-official-dir-boundary.md`、`docs/plan/2026-06-18-agent-session-identity-registry.md`、`docs/bugs/codex-conversation-interruption.md`。 | P1 | 🔧 Phase 1 完成，待 E2E |
| T166 | architecture/test | **IPC registry 新增通道硬约束补齐**：现有 baseline 可发现未登记 channel，但后续新增 main/preload channel 仍需强制引用 `ipcChannels` 常量，避免字符串字面量绕过 registry；保留历史 channel 兼容，不做命名大一统。详见 `docs/plans/remaining-refactoring-roadmap.md#phase-cipc-registry-从软约束升级为新增通道硬约束`。 | P2 | 📝 待方案 |
| T167 | test/architecture | **Session/Run 竞态 E2E 前置覆盖**：新增 3 个 sessionRegistry 集成测试文件（37 tests）：codexIntegration（15）、claudeIntegration（11）、panelLifecycle（11），覆盖 CodeX/Claude scan/done/restore 集成序列、panel cache 覆盖安全、删除一致性、跨 agent 隔离。已知缺口：runtime re-sync 被 panel 覆盖（T165 Phase 2 待收口）。Electron E2E（preload/main/renderer 真实链路）待补。详见 `docs/session-pitfalls.md`。 | P2 | ✅ 集成覆盖完成，Electron E2E 待补 |
| T168 | refactor/bug | **CodeX event rendering contract 收口**：已完成 live stream + history mapper 修复：tool call 不渲染、assistant 空泡泡、`<thinking>tool call</thinking>` 泄漏、agent_message 覆盖 assistant 正文、shell history 输出缺失均有契约测试覆盖。详见 `docs/plan/2026-07-01-codex-event-rendering-contract.md`。 | P1 | ✅ 已完成 |
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
| T163 | feature/ux | **系统设置全局 CC Switch 导入**：在系统设置增加 `导入配置`，解析一个 CC Switch `.sql` 后按 CodeX/ClaudeCode 自动分流；预览里处理新增/覆盖/重命名/跳过、unsupported rows、防止未知字段污染 runtime config；active 按 agent 分组且默认不切换；保留各 Agent 配置页 `导入` 仅导本地 CLI 配置。详见 `docs/T163-import-feature.md`。 | P1 | 🔧 核心已完成，待人工验收 |
| T164 | ux | **Provider 排序拖拽**：从 T163 拆出。在 CodeX/ClaudeCode APISetting.vue provider 列表支持拖拽排序，持久化到 SQLite + legacy storage。 | P2 | 📝 待实现 |

---

## 最近完成

| 日期 | 分类 | 说明 |
|------|------|------|
| 2026-06-30 | feature | **T163 系统设置全局 CC Switch 导入**：创建 `systemImportIpc.js`（3 个 IPC handler：pick-file / preview / commit）；SystemSettings.vue 增加导入配置分区预览对话框（CodeX/ClaudeCode 分流 + 冲突标注 + 动作选择 + 重命名输入 + active 切换开关）；CodeX/ClaudeCode APISetting.vue 简化为确认弹窗后直导本地 CLI；新增 6 个 T163 单元测试（mixed SQL / overwrite / active 分组 / 防污染）；6 个 IPC 通道全部注册到 `ipcChannels.js`；构建通过、全量 38 DB 测试 + 5 合同测试 0 fail。 |
| 2026-06-29 | refactor/docs | **架构重构 Batch 0-5 冻结验收完成**：`test:contract`、`npm test`、`npm run build` 通过；人工 smoke 覆盖 ClaudeCode/CodeX 发消息、中断、历史恢复、插件/skills 列表、配置保存，当前进入稳定观察期。 |
| 2026-06-29 | refactor | **R04 Tab/History composable 收敛完成**：R04a-e 全部完成。新增 `useAgentTabs.js`（107行）、`useAgentHistory.js`（162行）、`tabProviderAdapter.mjs`、`historyProviderAdapter.mjs`、4 个 pure helpers。双端 composable 收口为 thin wrapper（各 ~50行）。全量 251 tests（97 表征 + 154 契约）0 fail。 |
| 2026-06-28 | docs | **知识库整理**：新增 `docs/index.md`；精简 `docs/TODO.md` 从 1042→~100 行；CodeX Chat Proxy 文档合并归档；更新 AGENTS.md/CLAUDE.md 路由表。 |
| 2026-06-25 | refactor | **Token Metrics 重构 Phase 0-4 完成**：diagnostics.js / normalizer.js / turnStore.js / ClaudeCode + CodeX 全部 6 个发射点接入 TurnStore；footer/StatusBar/历史恢复消费同一 snapshot。 |
| 2026-06-24 | bug | **更新/安装流程修复**：下载进度条优化 + `quitAndInstall()` 分离进程启动安装器。 |
| 2026-06-24 | refactor | **Agent 架构重构 PR1-PR3 完成**：Agent Registry / Agent Protocol / Agent Client；通知音迁移；旧通道保留兼容。 |
| 2026-06-21 | feature | **CodeX 多模型选择器**：SelectModel 去硬编码，ProviderForm 新增备选模型输入框。详见 `docs/plan/2026-06-21-codex-multi-model-selector.md`。 |
