MindCraft-Agent v1.3.7 更新日志

问题修复
- 修复文档功能文件覆盖盲区：支持 dotfiles 发现、扩展名白名单补全、语法高亮映射补全
- 修复 localSearch IPC 未返回隐藏文件（.env/.gitignore 等）的问题
- 修复 Claude compact 完成后状态未清理的问题
- 修复 agent 文件链接需要可信点击才能打开的问题
- 修复 Claude 交互式问题在恢复时的归属和状态保持
- 隔离 Claude 结果后任务清理，避免交叉影响
