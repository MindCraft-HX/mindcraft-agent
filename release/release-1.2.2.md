MindCraft-Agent v1.2.2 更新日志

问题修复
- 修复 CodeX streaming 期间主线程被 execFileSync('git') 同步阻塞（单次 100-500ms，最多 32 次），导致整个应用卡死、用户输入无响应的严重性能问题。改为异步"先发后补"模式
- 修复 ToolWrite 组件 computed 属性同步解析 diff 导致每次重渲染都重新计算，绕过 idleCallback 优化的问题（改为只读缓存，不触发同步解析）
- 修复异步 preview 补发时 item.updated 错误地将已完成的 file_change 状态改写为 running 的问题
- 修复 requestIdleCallback 在重 streaming 期间被 Chrome 无限期推迟（加 { timeout: 200 } 确保最多延迟 200ms）
- 修复 generateFileChangePreviewsAsync 缺少 maxPreviewChanges 上限的问题
- 修复 catch 分支静默吞错误无日志的问题
