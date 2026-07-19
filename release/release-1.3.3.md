MindCraft-Agent v1.3.3 更新日志

功能新增
- 工作台文档支持默认以源码模式打开 HTML 文件
- 工作台关闭时增加未保存文档提示，避免意外丢失编辑内容
- Claude 后台任务现在可以在面板中正确显示

问题修复
- 修复 Claude 模型/effort 设置未按 provider 持久化，每次激活 provider 时覆盖历史会话的问题
- 修复 Claude 分支恢复和 provider 激活时的竞争条件
- 修复 /model 面板显示全局配置而非当前会话状态的问题
- 修复渲染进程与主进程同时写入 Claude 设置文件导致的竞争问题
- 修复工作台导航、退出守卫和文档域相关的稳定性问题
- 修复每轮 token 指标不能立即渲染的问题
- 修复 mdViewer 保存路径不经过文档域统一处理的问题
- 历史 Claude 会话不再被后续 provider 激活覆盖模型和 effort 设置
