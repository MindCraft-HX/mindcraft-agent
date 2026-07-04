MindCraft-Agent v1.0.29 更新日志

问题修复
- 修复 Claude 系统导入时覆盖现有 provider 扩展字段的问题
- 修复 CodeX 删除会话后历史记录未立即保存的问题
- 修复本地 CLI 导入时 provider ID 丢失的问题
- 修复 Claude 后台任务提前断开的问题
- 修复 CodeX turn token 聚合统计不准确

功能改进
- 消息流滚动更平滑：使用 rAF 驱动滚动更新
