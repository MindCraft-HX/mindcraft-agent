# MindCraft-Agent v1.0.12 更新日志

## 新功能
- **会话级模型选择**：每个会话可独立选择模型和推理强度，不再强制全局共享
- **会话指令附件**：支持为每个会话设置独立的自定义指令（session instruction），Agent 将始终遵循
- CodeHub 顶部 Tab 排序稳定性提升，新增诊断日志便于排查问题
- Agent 通知声音体验优化

## 问题修复
- 修复会话指令被面板状态同步覆盖导致指令丢失的问题
- 修复会话指令三个关键 Bug：TDZ 崩溃、IPC 克隆失败、保存后不生效
- 修复 CodeX 文件变更预览和多次 diff 渲染一致性问题
- 修复 CodeX 用户气泡语法高亮变量缺失导致代码块配色异常
- 修复 CodeX 推理强度在开发模式下加载失败的问题
- 修复 Markdown 渲染后外部链接无法打开的问题
- 修复 Sass legacy API 弃用警告
- 加固 session registry 存储稳定性

## 功能改进
- 重构会话元数据管理：Claude 会话模型和状态迁移到 registry 架构，数据更可靠
- 建立 session registry 基础设施，为后续功能扩展打基础
- 诊断日志和缓存数据迁移到 userData 目录，更规范
- CodeX 面板状态迁移到 userData 统一管理
- 默认运行模式改为自动编辑（edit_automatically），更符合使用习惯
- 切换到 Sass Modern API，消除编译警告
