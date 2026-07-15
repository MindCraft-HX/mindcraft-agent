MindCraft-Agent v1.2.8 更新日志

功能新增
- Git 工作区变更抽屉面板：点击状态栏分支信息（如 🔀 main (3)）展开右侧抽屉，展示 staged/unstaged/untracked 文件变更列表和行级 diff，支持 Claude Code 和 CodeX 复用
- 变更文件可直接点击在文档查看器中打开

问题修复
- 修复 CodeX 编辑器中折叠箭头不显示、快捷键方案失效的问题
- 修复 diff 请求并发过高导致抽屉面板响应缓慢的问题（限制并发 ≤2）
- 修复快速切换文件时 diff 结果竞态导致显示旧数据的问题
