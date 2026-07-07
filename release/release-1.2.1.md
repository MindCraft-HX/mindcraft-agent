MindCraft-Agent v1.2.1 更新日志

问题修复
- 修复设置修改后立刻关闭窗口导致最后一次修改丢失的问题（防抖写入退出前统一 flush）
- 修复 Claude Provider 模型状态刷新不完整，导致模型选择器与实际生效模型不一致
- 修复卸载插件后 Slash 命令面板仍显示已卸载插件的问题
- 修复新安装的 skill/plugin 不显示、已卸载的 skill/plugin 仍生效的问题（缓存未正确清除）
- 修复 Skill/Plugin 安装/卸载后 slashCommandsCache 未清除的 4 个遗漏点
- 修复 CodeX 会话恢复时残留过期会话未被清理的问题
- 修复会话标题中残留的 session instruction 标签污染显示的问题
- 修复聊天保存时磁盘满导致 SQLite 元数据残留的半保存状态（写入失败时回滚）
