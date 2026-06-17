# Claude 会话重复分支修复计划

> 日期：2026-06-10
> 范围：ClaudeCode 会话创建、扫描刷新、历史恢复

## 目标

把“同一个 Claude 对话被拆成两个侧边栏会话”的问题作为独立专题收敛，避免继续用零散补丁处理。

## 事实源

- Agent 主体只改 `packages/agent/**`。
- 会话列表渲染不是通知源，也不是重复源。
- 重复源在 UI 本地 chat 与 Claude CLI jsonl 之间的身份绑定。

## 实施步骤

1. 固定回归测试：在 `tests/claude-pending-session-binding.test.mjs` 覆盖首轮结束后仍未绑定、历史恢复后缺少 `_pendingSessionBinding` 两类场景。
2. 收敛 pending 判断：在 `pendingSessionBinding.mjs` 统一判断“未绑定但可领养”的 chat。
3. 接入刷新流程：`refreshProjectSessionsInBackground` 使用 `hasUnboundClaudeSessionPendingAdoption`，不再只看 `thinking`。
4. 验证：运行 pending session 测试和 session refresh guard 测试。
5. 若用户再次复现：按专题文档里的四个日志点继续定位，不再新增分散条件。
6. 第二阶段补强持久化边界：新增 `historyPersistenceSanitizer.mjs`，在加载、保存、刷新三处清理同一 `cliSessionId/filePath` 的重复 chat，并为空 active 选择真实存在的 fallback。
7. 第二阶段补强 codeHub 可见状态：统一 tab 高亮跟随嵌入面板的 active project，避免顶部显示一个项目而消息实际发到另一个项目。

## 验收标准

- 新建 Claude 对话首轮完成后，扫描出的 jsonl 会绑定回原 chat。
- 侧边栏不会因同一个 jsonl 额外插入第二条会话。
- 已绑定历史会话仍能正常按 filePath / cliSessionId 匹配和刷新。
- 污染状态加载后不会继续渲染重复 chat。
- 保存时不会把有项目的面板写成空 active。
- codeHub 顶部 active tab 与 Claude 面板 active project 保持一致。

## 非目标

- 不改 Codex 会话逻辑。
- 不重构侧边栏 UI。
- 不把 `docs/` 改动纳入 commit，除非用户明确允许。
