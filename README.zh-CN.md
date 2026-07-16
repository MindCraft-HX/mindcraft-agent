# MindCraft Agent

> 将 Claude Code 与 Codex 带入同一项目上下文的桌面开发工作台。

[English](README.md) | [简体中文](README.zh-CN.md)

![MindCraft Agent 产品总览](docs/images/overview.png)

_产品总览：从同一入口进入项目对话、文档浏览和轻量 Chat，并查看使用情况。_

## 核心能力

- **双 Agent 编程工作流** - 在同一应用内使用 Claude Code 和 Codex，并保留各自的运行时与会话边界。
- **项目与会话管理** - 清晰区分 MindCraft UI 会话、Provider 会话线程与官方 Transcript。
- **开发过程可视化** - 展示流式回复、工具调用、文件变更、Diff、任务进度和统一 Token 指标。
- **内置文档工作区** - 在标签页中打开、浏览和编辑本地 Markdown 与代码文件，并支持路径链接跳转。
- **本地优先与可追溯** - MindCraft 自有状态写入应用 `userData`，不污染 Claude/Codex 官方配置与转录目录。

## 工作区一览

### 多 Agent 项目工作区

![多 Agent 项目工作区](docs/images/multi-agent-workspace.png)

会话列表、任务进度、模型控制与斜杠命令集中在一个界面。

### 代码变更审阅

![代码变更审阅](docs/images/code-change-review.png)

在会话中查看文件改动和 Diff，并继续与 Agent 协作。

### 文档工作区

![文档工作区](docs/images/document-workspace.png)

无需离开应用，即可编辑、预览和分屏浏览 Markdown 与代码文件。

## 快速开始

环境要求：Node.js 20+、npm，以及已安装并完成认证的 Claude Code 和/或 Codex。

```powershell
git clone https://github.com/MindCraft-HX/mindcraft-agent.git
cd mindcraft-agent
npm install
npm run dev
```

开发模式会启动 Vite 与 Electron。运行数据存放在 Electron `userData` 目录，不会写入仓库或 Provider Transcript 目录。

## 验证与打包

```powershell
npm test
npm run test:contract
npm run build
npm run test:e2e
```

打包与发布请阅读[构建与发布指南](docs/build-and-deploy.md)。当前不要使用 `build/build.js --version` 路径。

## 文档

| 主题 | 阅读 |
| --- | --- |
| 架构与数据边界 | [agent-architecture.md](docs/agent-architecture.md) |
| 会话问题排查 | [session-pitfalls.md](docs/session-pitfalls.md) |
| GitHub 发布流程 | [github-publication.md](docs/github-publication.md) |
| 完整文档索引 | [docs/index.md](docs/index.md) |

## 贡献与安全

- 提交 Issue 或 Pull Request 前，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。
- 请勿提交 API Key、Provider Transcript、本地运行数据、私有笔记或打包产物。

## 仓库结构

```text
packages/agent/  面向 renderer、Electron 与 preload 的共享 Agent 核心
src/             宿主壳层、路由、导航与仅宿主使用的视图
electron/        桌面运行时、窗口、文件系统集成与打包
tests/           单元、契约、回归与 Electron 冒烟测试
docs/            工程文档与项目决策
```

## 许可证

本项目采用 [MIT License](LICENSE) 开源。
