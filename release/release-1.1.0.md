MindCraft-Agent v1.1.0 更新日志

新功能
- 会话自动排序：轮次完成后会话自动排到列表最前面

问题修复
- 修复切换会话时活跃对话反复闪烁的问题
- 修复 Claude 历史记录 meta prompt 过滤异常（回归修复）
- 修复 Claude result usage context 上下文估算残留（回归修复）
- 修复 detachResume 未清理旧 cliSessionId/filePath 的问题

功能改进
- 消息分块挂载：首批 10 条消息同步渲染，其余分批次在空闲时挂载，消除 2.3 秒主线程阻塞
- 对话渲染大幅优化：v-memo 仅重渲染变化的消息行、renderContent 缓存消除重复 Markdown→HTML 转换、CodeX 滚动/保存节流
- 流式消息更新节流：v-html 更新合并到单帧，减少 streaming 期间 DOM 操作
- 项目列表切换加速：session 扫描缓存化，切 tab 不再重复扫描
- 切换会话性能优化：指令刷新和指标刷新推迟到浏览器渲染完成后执行
