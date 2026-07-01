MindCraft-Agent v1.0.26 更新日志

新功能
- CodeX 事件渲染契约：实时消息流渲染重构，消息显示更流畅准确

问题修复
- 修复仅指定 agent 参数时覆盖已保存的活跃标签页，现在优先恢复上次使用的标签页
- 修复标签页恢复过程中误弹出 Agent 选择器的问题
- 修复 Claude usage 信息污染上下文导致后续对话异常
- 修复 CodeX 重复会话：孤儿 registry 文件导致同一项目出现多个标签页
- 修复 CodeX 实时消息渲染多个 Bug：tool output 显示、agent_message 策略、patch_apply_end 映射
- 修复 diff 分屏对比渲染布局错误
