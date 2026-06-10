更新内容:
1. 完成 Agent 共享层重构收口，Claude / Codex / codeHub / agentCommon 已统一沉淀到 `packages/agent`，为后续 Lite 版复用做准备。
2. 修复 ClaudeCode 任务面板状态同步问题，补齐 TaskCreate / TaskUpdate 对顶层计划项的更新，任务进度展示更稳定。
3. 修复 Codex Provider 配置维护链路，模型、请求地址和 reasoning effort 统一由表单驱动写回 `config.toml`，减少手工编辑导致的格式问题。
4. 修复 Markdown 与消息列表中的本地文件链接点击行为，补齐项目 cwd 上下文回退，并支持代码块内路径识别与点击打开。
