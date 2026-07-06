MindCraft-Agent v1.1.3 更新日志

问题修复
- 修复 5 个 IPC channel 未注册导致 session 草稿与性能诊断开关可能失效的问题

功能改进
- 安全加固：移除未使用的独立窗口创建功能（消除 nodeIntegration + contextIsolation 关闭的安全风险）
- 代码清理：删除 19 个孤立文件，卸载 8 个无用 npm 依赖包，精简包体积
