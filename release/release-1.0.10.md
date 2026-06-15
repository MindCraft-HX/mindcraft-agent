MindCraft-Agent v1.0.10

Bug 修复：
- 修复 CodeX 会话结束后 done 事件不发送的问题，多轮对话不再卡住
- 修复 CodeX 发送消息时用户气泡意外消失的问题
- 修复 CodeX 中断后转圈动画卡死不消失的问题
- 修复 ClaudeCode 会话中断后 tool_use 显示为执行中而非已中断的问题
- 修复设置面板首次进入时显示"检测失败"的问题
- 修复 CodeX sandbox 模式在重启后丢失的问题
- 修复多实例同时运行时 DevTools 快捷键冲突的问题
- 修复 CodeX 每轮 token 统计累加不重置的问题

优化：
- ClaudeCode 会话中断后自动检测并标记未完成的工具调用
- CodeX sandbox 模式默认值改为"完全访问"，对齐实际使用场景
- CodeX 新增多项诊断日志，方便排查会话生命周期问题
