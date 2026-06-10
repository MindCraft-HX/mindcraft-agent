# MindCraft-Agent v1.0.0 发布说明

> 首个独立 baseline 版本。从 mindcraft-electron Full 版裁剪重构为轻量级多 Agent 集成平台。

## 核心能力

### 编程智能体
- **Claude Code** — Anthropic 编程智能体，支持代码编写、调试、重构、多文件编辑
- **GPT Codex** — OpenAI 编程智能体，支持多种语言代码生成和调试
- **Agent Registry 架构** — 可扩展的多 Agent 注册机制，新增 Agent 只需注册

### 基础功能
- 项目目录选择与管理
- 会话历史持久化（跨启动恢复）
- Agent 切换（Claude ⇄ Codex 一键切换）
- 共享 API 设置面板
- 文档浏览（Markdown / HTML / PDF / 代码）
- 终端（pty）
- 浮动窗口

### 系统设置
- 开机启动 / 安全模式 / 浮窗启动 / 截图启动
- 截图快捷键自定义
- 自动更新检查

## 架构变更

从 mindcraft-electron v1.6.1 重构而来：
- 删除所有 Full 业务功能（应用广场、语音实验室、积分、小程序、画布等）
- 共享内核 `packages/agent` 保持与 mindcraft-electron 同步
- Agent Registry 基础架构用于未来多 Agent 扩展
- 构建体积减少 60%（5172 → 2043 模块）

## 已知问题

- T046: Claude 会话接力可能不稳定（特定场景下历史恢复异常）
- 轻量知识问答 Agent 尚未实现（后续版本添加）
