更新内容:
1. UI 全面优化（Phase 1-3）：沉底 SVG 工具图标体系，引入分类色条与状态徽章；消息间距节奏与加载动画焕新；空状态引导、悬停动效与卡片淡入动画增强交互体验。
2. 统一图标描边宽度至 1.2、规范化图标尺寸，打磨终端卡片与 Agent 工具卡片的视觉层级。
3. ClaudeCode 任务面板增强：修复 TaskCreate/TaskUpdate 同步链路，补齐任务 ID 对账与待办项更新，隐藏空进度计数，隔离任务栏 header 交互冲突，并修复会话恢复后待处理对话绑定。
4. CodeX 模型选择体验对齐 ClaudeCode：内联 Effort 选择器，修复 slash 命令残留与 pushTabMessage 类型定义缺失。
5. 修复流式响应中 `<end>` 标签 JSON 解析时空指针报错。
6. 修复 Markdown 绝对路径本地文件链接点击与 CJS / 包文件路径检测，补齐项目内 ripgrep 注入覆盖。
