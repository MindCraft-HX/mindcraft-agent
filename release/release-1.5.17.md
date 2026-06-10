更新内容:
1. CodeX 插件管理 — 支持安装/启用/禁用/卸载插件，ClaudeCode 插件管理改为工具栏独立按钮，插件状态变更后自动刷新命令列表
2. ClaudeCode 模型选择升级 — 新增推理强度（Reasoning Effort）设置，可在选择模型时同时指定 low/medium/high/max
3. CodeX 命令路由中间层 — 新增 /init（生成 AGENTS.md）、/review（代码审查）、/diff（Git 差异）、/plan（计划模式）本地命令
4. Markdown 渲染增强 — mdViewer 视觉优化 + 编程智能体消息内 Markdown 语法渲染升级
5. 任务追踪面板重构 — 双模式架构（直播+历史），修复任务状态不对齐、重复条目、孤儿条目等多项问题
6. 自动压缩修复 — Claude Code + CodeX 上下文自动压缩现已正常工作，压缩时状态栏有明确提示
7. 多项稳定性修复 — CodeX 双重超时竞态、/clear 真正清空会话、新建会话重复创建、上下文泄漏到用户气泡、重命名失效、状态栏消失等
