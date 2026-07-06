# MindCraft Agent 知识库

> 最后更新：2026-07-05
> 定位：文档体系入口索引，覆盖所有活跃文档。过期/已完成的计划见 `archive/`。

---

## 入口（必读）

| 文档 | 说明 |
|------|------|
| [agent-architecture.md](./agent-architecture.md) | 架构契约：目录边界、运行时分层、数据归属、会话身份模型、Token Metrics 架构 |
| [session-pitfalls.md](./session-pitfalls.md) | 跨 Agent 会话陷阱全景图，含排查决策树。**会话相关 bug 第一入口** |

## 专题

| 领域 | 文档 | 说明 |
|------|------|------|
| Token Metrics | [token-metrics-contract.md](./token-metrics-contract.md) | 契约：UI 语义定义、consumer boundaries、provider source semantics |
| | [token-metrics.md](./token-metrics.md) | 实现与复盘：normalizer / TurnStore / consumer 收口细节 |
| CodeX Chat Proxy | [codex-chat-proxy.md](./codex-chat-proxy.md) | 协议转换代理架构、文件清单、实现状态 |
| SDK 能力 | [sdk-feature-gaps.md](./sdk-feature-gaps.md) | SDK 未集成功能全景、利用率审计、优先级建议 |
| 构建部署 | [build-and-deploy.md](./build-and-deploy.md) | 打包命令、版本发布流程、常见问题 |
| Settings 污染 | [settings-json-pollution.md](./settings-json-pollution.md) | `~/.claude/settings.json` 污染分析与清理方案 |
| 首页 | [home-page.md](./home-page.md) | 首页功能设计 |
| mdViewer | [mdViewer-issues.md](./mdViewer-issues.md) | 文档查看器已知问题 |
| 性能 | [perf-audit-report.md](./perf-audit-report.md) | 界面卡顿审计与优化记录 |
| CodeX 排障 | [codex-turn-failed-diagnostics.md](./codex-turn-failed-diagnostics.md) | CodeX turn.failed 诊断指南 |
| 命令决策 | [clear-command-decision.md](./clear-command-decision.md) | clear 命令设计决策记录 |
| 架构健康 | [architecture-health-review-2026-06-28.md](./architecture-health-review-2026-06-28.md) | 全量架构审计：巨型文件、重复代码、IPC、依赖、测试，含优先级排序 |
| 存储架构 | [STORAGE_ARCHITECTURE_ANALYSIS.md](./STORAGE_ARCHITECTURE_ANALYSIS.md) | SQLite 基础设施、CC Switch 导入、本地存储迁移与最终边界 |
| 配置导入 | [T163-import-feature.md](./T163-import-feature.md) | 系统设置全局 CC Switch 导入、预览/提交边界、防污染规则 |

## 设计决策

| 文档 | 说明 |
|------|------|
| [design/T089-per-session-model.md](./design/T089-per-session-model.md) | Per-session 模型选择设计 |
| [design/claude-session-identity-refactor.md](./design/claude-session-identity-refactor.md) | Claude 会话身份模型收敛 |
| [design/T148-codex-claude-session-lineage-refactor.md](./design/T148-codex-claude-session-lineage-refactor.md) | CodeX/Claude 会话谱系重构 |
| [design/T149-keyboard-shortcuts-navigation.md](./design/T149-keyboard-shortcuts-navigation.md) | 键盘快捷键与导航设计 |

## 执行计划

按日期倒序，最新在前：

| 文档 | 说明 |
|------|------|
| [plan/2026-07-06-post-refactor-release-and-cleanup-queue.md](./plan/2026-07-06-post-refactor-release-and-cleanup-queue.md) | Post-refactor release gate and cleanup queue：当前发布线冻结新功能，后续清理按 T193-T197 分批推进 |
| [plan/2026-07-05-legacy-compatibility-exit-plan.md](./plan/2026-07-05-legacy-compatibility-exit-plan.md) | T188 Legacy compatibility exit：provider projection、electron-conf、旧 IPC/窗口/API 的退出窗口 |
| [plan/2026-07-05-dead-code-and-redundant-business-route-audit.md](./plan/2026-07-05-dead-code-and-redundant-business-route-audit.md) | T187 Dead code / redundant business route audit：重构后死代码、孤岛业务线、预加载 API 和依赖清理 |
| [plan/2026-07-05-agent-core-lifecycle-boundary-audit.md](./plan/2026-07-05-agent-core-lifecycle-boundary-audit.md) | T186 Agent core 生命周期边界审计：stream/abort/done/session map 不为减行数强拆 |
| [plan/2026-07-05-electron-e2e-smoke-harness.md](./plan/2026-07-05-electron-e2e-smoke-harness.md) | T185 Electron E2E smoke harness：真实 preload/main/renderer 链路验收 |
| [plan/2026-07-05-codehub-session-index-handoff.md](./plan/2026-07-05-codehub-session-index-handoff.md) | T184 CodeHub SessionIndex Phase 1/2：被动索引 + eager mount，解除 tab 存在性对 provider ready 的依赖 |
| [plan/2026-07-05-cache-governance-and-local-derived-data.md](./plan/2026-07-05-cache-governance-and-local-derived-data.md) | T183 Cache governance / local derived data：file-derived cache helper、registry read cache、in-flight dedup timeout |
| [plan/2026-07-05-hot-path-governance-and-streaming-render.md](./plan/2026-07-05-hot-path-governance-and-streaming-render.md) | T181 CodeHub startup / activation chain：同步段治理、会话切换卡顿收口，streaming render 后续 |
| [plan/2026-07-05-project-session-activation-work-graph.md](./plan/2026-07-05-project-session-activation-work-graph.md) | T179 Project / Session activation work graph：scan cache hit 去 registry 写副作用 |
| [plan/2026-07-04-renderer-dom-layout-and-cache-governance.md](./plan/2026-07-04-renderer-dom-layout-and-cache-governance.md) | T177-P2 Renderer DOM/Layout/Paint 归因与缓存治理 |
| [plan/2026-07-04-session-switch-background-task-latency.md](./plan/2026-07-04-session-switch-background-task-latency.md) | T177 Session 切换后台任务延迟：metrics 主进程阻塞诊断与修复 |
| [plan/2026-07-04-large-session-rendering-performance.md](./plan/2026-07-04-large-session-rendering-performance.md) | T176 大 session 渲染卡顿：history tool 折叠、bash output 懒挂载、renderContent 证伪 |
| [plan/2026-07-02-T172-session-switch-performance.md](./plan/2026-07-02-T172-session-switch-performance.md) | T172 Session switch 真优化：CodeX metrics 后台化，Claude Phase 2 跳过 |
| [plan/2026-07-05-metrics-context-authority-and-renderer-convergence.md](./plan/2026-07-05-metrics-context-authority-and-renderer-convergence.md) | T180 Metrics 收口：context 权威来源、carry-forward、Claude/CodeX 首次 hydrate 对称性 |
| [plan/2026-07-02-session-tab-switch-performance.md](./plan/2026-07-02-session-tab-switch-performance.md) | T170 Session / Tab 切换性能收口：scheduled refresh、cooldown、scroll restore |
| [plan/2026-07-02-renderer-hot-path-performance.md](./plan/2026-07-02-renderer-hot-path-performance.md) | T169 Renderer 高频链路瘦身：ProjectTabs summary、CodeHub 白名单、saveHistory/textarea 优化 |
| [plan/2026-07-01-session-registry-ownership-handoff.md](./plan/2026-07-01-session-registry-ownership-handoff.md) | T165 Session Registry ownership 交接：Phase 1 已完成、T167 覆盖优先、Phase 2 边界 |
| [plan/2026-07-01-codex-event-rendering-contract.md](./plan/2026-07-01-codex-event-rendering-contract.md) | CodeX event rendering contract：tool call、progress、assistant final、history restore 收口 |
| [plan/2026-06-30-storage-sqlite-cc-switch-import.md](./plan/2026-06-30-storage-sqlite-cc-switch-import.md) | SQLite 基础设施与 CC Switch 导入首批实现计划 |
| [plan/2026-06-27-renderer-convergence.md](./plan/2026-06-27-renderer-convergence.md) | Renderer 消费层收敛 |
| [plan/2026-06-26-markdown-renderer-consolidation.md](./plan/2026-06-26-markdown-renderer-consolidation.md) | Markdown 渲染收口 |
| [plan/2026-06-26-codehub-session-index-refactor.md](./plan/2026-06-26-codehub-session-index-refactor.md) | CodeHub 会话索引重构 |
| [plan/2026-06-24-architecture-review-notification-refactor.md](./plan/2026-06-24-architecture-review-notification-refactor.md) | 架构审查 & 通知重构 |
| [plan/2026-06-24-token-metrics-research.md](./plan/2026-06-24-token-metrics-research.md) | Token Metrics 研究 |
| [plan/2026-06-21-codex-multi-model-selector.md](./plan/2026-06-21-codex-multi-model-selector.md) | CodeX 多模型选择器 |
| [plan/2026-06-19-codex-runtime-state-machine.md](./plan/2026-06-19-codex-runtime-state-machine.md) | CodeX Runtime 状态机 |
| [plan/2026-06-19-claude-runtime-metrics-state-machine.md](./plan/2026-06-19-claude-runtime-metrics-state-machine.md) | ClaudeCode Runtime/Metrics 状态机 |
| [plan/2026-06-18-agent-session-identity-registry.md](./plan/2026-06-18-agent-session-identity-registry.md) | Agent 会话身份与 Registry |
| [plan/2026-06-17-design-features-integration.md](./plan/2026-06-17-design-features-integration.md) | 设计能力集成方案 |
| [plan/2026-06-17-session-registry-and-official-dir-boundary.md](./plan/2026-06-17-session-registry-and-official-dir-boundary.md) | Session Registry 与官方目录边界 |
| [plan/2026-06-17-mindcraft-design-studio-prd.md](./plan/2026-06-17-mindcraft-design-studio-prd.md) | 设计工作室 PRD |
| [plan/2026-06-16-codex-sandbox-refactor.md](./plan/2026-06-16-codex-sandbox-refactor.md) | CodeX Sandbox 权限重构 |
| [plan/2026-06-15-codex-queue-race-plan.md](./plan/2026-06-15-codex-queue-race-plan.md) | CodeX 队列竞态修复 |
| [plan/2026-06-15-claude-dangling-tool-use-recovery.md](./plan/2026-06-15-claude-dangling-tool-use-recovery.md) | Claude dangling tool_use 恢复 |
| [plan/2026-06-11-mdviewer-into-main-window.md](./plan/2026-06-11-mdviewer-into-main-window.md) | mdViewer 迁入主窗口 |
| [plan/2026-06-10-mindcraft-agent-refactor.md](./plan/2026-06-10-mindcraft-agent-refactor.md) | mindcraft-agent 重构方案 |
| [plan/2026-06-10-claude-session-duplicate-split.md](./plan/2026-06-10-claude-session-duplicate-split.md) | Claude 会话重复修复 |
| [plan/phase0-stability-report.md](./plan/phase0-stability-report.md) | Phase 0 稳定性报告 |

## Bug 根因分析

| 文档 | 说明 |
|------|------|
| [bugs/claude-session-duplicate-split.md](./bugs/claude-session-duplicate-split.md) | ClaudeCode 会话重复 / 5 根因 |
| [bugs/codex-conversation-interruption.md](./bugs/codex-conversation-interruption.md) | CodeX 对话卡住/中断 |
| [bugs/codex-stuck-interruption.md](./bugs/codex-stuck-interruption.md) | CodeX 卡住中断修复 |
| [bugs/dev-white-screen-zombie-process.md](./bugs/dev-white-screen-zombie-process.md) | dev 白屏 + 僵尸进程 |
| [bugs/doc-link-navigation.md](./bugs/doc-link-navigation.md) | 文档链接跳转 |
| [bugs/toolbar-disappearance.md](./bugs/toolbar-disappearance.md) | 工具栏消失 |
| [bugs/ask-dialog-deactivate-failure.md](./bugs/ask-dialog-deactivate-failure.md) | Ask 弹窗失活失败 |

## 质量

| 文档 | 说明 |
|------|------|
| [review.md](./review.md) | 每日代码审查流程、检查清单、历史记录 |
| [TODO.md](./TODO.md) | 当前任务跟踪（活跃 P0/P1 + 近期记录） |
| [qa/](./qa/) | 人工验收记录（5 篇，按日期索引） |

## 其他

| 目录/文档 | 说明 |
|-----------|------|
| [superpowers/](./superpowers/) | App 图标设计与资产 |
| [tmp/](./tmp/) | 临时测试数据，不纳入 git |
| `local/` `private/` | 不纳入 git 的私密/本地内容 |
| [archive/](./archive/) | 已过期/已完成的计划与历史记录 |
