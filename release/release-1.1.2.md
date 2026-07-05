MindCraft-Agent v1.1.2 更新日志

问题修复
- 修复 CodeX 会话排序未持久化到本地存储的问题
- 修复首页每日增量 Token 统计计算错误
- 修复面板未就绪时关闭项目 Tab 无效的问题

功能改进
- CodeHub 启动优化：Tab 列表恢复不再等待所有 Provider 面板初始化完成，利用 SessionIndex 立即恢复，启动感知更快
- 过滤无实际会话的空占位项目，不再在侧边栏显示
