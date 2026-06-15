MindCraft-Agent v1.0.9

Bug 修复：
- 修复生产环境下输入框工具栏不显示的问题（国际化文案中的 @ 符号与 vue-i18n 编译冲突导致组件卸载）
- 修复 agentRegistryComponents 动态导入在生产环境渲染为 [object Promise] 的问题
- 修复模型切换后关闭 Tab 再打开时模型选择丢失的问题
- 修复同步命令（execSync）阻塞主进程的问题，环境检测和安装流程不再卡住界面

优化：
- 应用更新提示改为独立弹窗，不再阻塞主界面操作
- 生产环境支持 Ctrl+Shift+I 打开开发者工具，方便排查问题
