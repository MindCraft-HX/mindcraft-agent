# TODO

> 最后更新：2026-06-11
>
> ⚠️ **会话相关 bug 排查第一入口**：`docs/session-pitfalls.md`（跨 Agent 陷阱全景图）

## 当前重点

| 编号 | 分类 | 说明 | 优先级 | 状态 |
|------|------|------|:------:|------|
| T039 | feature | 语音输入能力：支持把语音转文字输入到编程智能体对话 | P1 | 方案设计中 |
| T040 | eval | Remote 远程接入方案研究与实现 | P1 | 待开始 |
| T041 | refactor | mindcraft-agent 重构：在共享 Agent 层基础上裁剪宿主能力与导航 | P1 | 方案评审中 |
| T045 | refactor | Agent 抽离：提取 Claude / Codex / codeHub / agentCommon 为共享 `packages/agent` 层 | P1 | Phase A 已完成，进入稳定与复用阶段 |
| T046 | bug | ClaudeCode 会话重复 / 接力问题：重复 jsonl 绑定、active 丢失、renderer session 身份污染 | P0 | ✅ 5 个根因全部修复 (2026-06-11) (`docs/bugs/claude-session-duplicate-split.md`) |

## T045 当前状态

- `packages/agent` 已落地，包含 renderer / electron / preload 三个入口
- Full 版宿主已经切到共享层接线
- 旧的宿主侧 Agent 主体实现已移除，不再保留双份源码
- 关键回归与构建已通过
- 当前阶段不再继续大规模拆分，后续以正常修 Bug 和支撑 `mindcraft-agent` 复用为主

## mindcraft-agent 下一步建议

1. 明确 `mindcraft-agent` 保留的 Agent 能力边界。
2. 先做宿主层裁剪设计，不急着继续拆共享层。
3. 只有出现 Full / Agent 明确分叉点时，再追加共享配置抽象。

## 最近完成

| 日期 | 分类 | 说明 |
|------|------|------|
| 2026-06-11 | doc | 创建跨 Agent 会话陷阱全景图 `docs/session-pitfalls.md`，新增 5 大 trap pattern 和排查决策树；补充 agent-architecture.md 会话管理章节；更新 CLAUDE.md 排查路由 |
| 2026-06-11 | bug | 修复 T046 P0 根因 E/B/A：中断恢复死锁、Provider 切换清空 cliSessionIds、多 pending 盲匹配 |
| 2026-06-11 | bug | 修复 T046 P1/P2 根因 C/D：错误路径孤儿 JSONL（finally 块 fallback 扫描）、hasPendingNewChat 过时（循环内重新计算） |
| 2026-06-11 | bug | 定位 T046 ClaudeCode 会话重复的 5 个根因（A-E），更新专题文档 `docs/bugs/claude-session-duplicate-split.md` |
| 2026-06-10 | bug | 修复 Codex 同一 `sessionId` 重复 query 造成多次 cleanup / 旧 turn 收尾误清新 turn 状态的问题；主进程增加 run ownership，重复运行中请求直接忽略，cleanup/done/metrics 仅作用于当前 run |
| 2026-06-10 | bug | 补强 ClaudeCode 会话”接力”问题：加载/保存/刷新时清理重复 jsonl 绑定，补齐 active project/chat fallback，并同步 codeHub 顶部 tab；同日继续复现后确认还存在 renderer session 身份污染链路 |
| 2026-06-10 | bug | 修复 Claude 任务面板在会话内全局递增 task id 场景下无法收口的问题，改为 `TaskCreate -> 真实 task.id -> TaskUpdate` 显式绑定链路 |
| 2026-06-09 | refactor | 完成 Agent 抽离 Phase A，共享层收敛到 `packages/agent/**` |
| 2026-06-09 | bug | 修复 ClaudeCode 历史恢复时误切到旧会话的问题，恢复上次激活的 project/chat |
| 2026-06-09 | bug | 修复共享层 `localSearch` 的 bundled `rg` 路径与建议链路问题 |
| 2026-06-08 | bug | 修复 Codex 会话生命周期、状态栏、diff 恢复与任务卡显示等一轮问题 |
