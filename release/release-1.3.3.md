MindCraft-Agent v1.3.3 更新日志

问题修复
- 修复 Claude 模型/effort 设置未按 provider 持久化，每次激活 provider 时覆盖历史会话的问题
- 修复 /model 面板显示全局配置而非当前会话状态的问题
- 修复渲染进程与主进程同时写入 Claude 设置文件导致的竞争问题
- 历史 Claude 会话不再被后续 provider 激活覆盖模型和 effort 设置
