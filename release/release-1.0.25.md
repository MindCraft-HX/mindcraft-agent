MindCraft-Agent v1.0.25 更新日志

新功能
- 代码 diff 支持行内词级变更高亮，精确到单词级别的差异对比
- diff 代码块支持嵌套语法高亮，变更代码按原语言着色
- 系统设置新增 CC Switch 配置导入，按 CodeX/ClaudeCode 分流预览
- 支持 MindCraft Provider SQL 格式导出，兼容 CC Switch
- 工具栏文件路径支持点击直接打开
- 支持开机自动启动设置

问题修复
- 修复 Claude 配置导入时模型映射不完整、空配置丢失、跳过计数异常等多个问题
- 修复导出时隐藏密钥仍可能泄露环境变量 key 的问题
- 修复 Claude settings 文件配置污染的问题
- 修复快捷键注册异常覆盖的问题
- 修复 IME 输入法组合状态异常时自动恢复
- 修复首页检查更新按钮偶发点击无响应
- 修复 Claude task 执行过程未与 plan 同时显示的问题
- 修复代码语法高亮中函数名与括号间空格丢失的问题
- 修复 P0 严重 Bug——claudeAgent.js 语法损坏导致功能异常
