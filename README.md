# MindCraft Agent

> A desktop workspace that brings Claude Code and Codex into one project-aware development flow.

[中文](#中文介绍) | [English](#english)

## 中文介绍

MindCraft Agent 是一个面向软件开发的轻量级多 Agent 桌面工作台。它将 Claude Code 与 Codex 放入同一个项目上下文中，同时提供会话管理、文件变更查看、Markdown 文档浏览和轻量 Chat，减少在命令行、编辑器和多个 AI 工具之间来回切换的成本。

![MindCraft Agent product overview](docs/images/overview.png)

_产品总览：从同一入口进入项目对话、文档浏览和轻量 Chat，并查看使用情况。_

### 核心能力

- **双 Agent 编程工作流**：在同一应用内使用 Claude Code 和 Codex，并保留各自的运行时与会话边界。
- **项目与会话管理**：以 MindCraft `chatKey` 管理 UI 会话，同时正确映射 provider session/thread 与官方 transcript。
- **开发过程可视化**：展示流式回复、工具调用、文件变更、diff、任务进度和统一 Token 指标。
- **内置文档工作区**：打开、浏览和编辑本地 Markdown/代码文本，支持文档标签页和路径链接跳转。
- **本地优先与可追溯**：MindCraft 自有状态写入应用 `userData`，不污染 Claude/Codex 官方目录；关键边界有契约测试覆盖。

### 工作区一览

![Multi-agent workspace](docs/images/multi-agent-workspace.png)

_多 Agent 项目工作区：会话列表、任务进度、模型控制与斜杠命令集中在一个界面。_

![Code change review](docs/images/code-change-review.png)

_代码变更审阅：在会话中查看文件改动和 diff，并继续与 Agent 协作。_

![Document workspace](docs/images/document-workspace.png)

_文档工作区：在应用内编辑、预览和分屏浏览 Markdown 与代码文件。_

### 快速开始

环境要求：Node.js 20+、npm，以及已安装并完成认证的 Claude Code 和/或 Codex。

```powershell
git clone https://github.com/MindCraft-HX/mindcraft-agent.git
cd mindcraft-agent
npm install
npm run dev
```

开发模式会启动 Vite 与 Electron。应用运行数据存放在 Electron `userData` 目录，不会写入仓库或 provider transcript 目录。

### 验证与打包

```powershell
npm test
npm run test:contract
npm run build
npm run test:e2e
```

生产打包请阅读 [构建与发布指南](docs/build-and-deploy.md)。当前不要使用 `build/build.js --version` 路径。

### 文档与贡献

- [文档总索引](docs/index.md)
- [架构与数据边界](docs/agent-architecture.md)
- [会话问题排查](docs/session-pitfalls.md)
- [GitHub 发布策略](docs/github-publication.md)
- [贡献指南](CONTRIBUTING.md)
- [安全问题报告](SECURITY.md)

## English

MindCraft Agent is a lightweight, project-aware desktop workspace for software development. It brings Claude Code and Codex into one application, alongside session management, file-change review, Markdown browsing, and lightweight chat.

![MindCraft Agent product overview](docs/images/overview.png)

_Product overview: start project conversations, browse documents, use lightweight chat, and review usage from one desktop workspace._

### Highlights

- **Two coding agents, one workspace**: Use Claude Code and Codex side by side while preserving their provider-specific runtime and session boundaries.
- **Project-aware sessions**: Manage MindCraft UI sessions separately from provider threads and official transcripts.
- **Visible development flow**: Review streamed responses, tool activity, file changes, diffs, task progress, and normalized token metrics.
- **Built-in document workspace**: Open, browse, and edit local Markdown and text files with tabs and path-link navigation.
- **Local-first boundaries**: MindCraft-owned state stays in Electron `userData`, not in provider configuration or transcript directories; critical behavior is protected by contract tests.

### Workspace Tour

![Multi-agent workspace](docs/images/multi-agent-workspace.png)

_Multi-agent project workspace with session navigation, task progress, model controls, and slash commands in one view._

![Code change review](docs/images/code-change-review.png)

_Code-change review inside the conversation flow, so you can inspect diffs and continue collaborating with the agent._

![Document workspace](docs/images/document-workspace.png)

_Built-in document workspace for editing, previewing, and split-viewing Markdown and code files._

### Quick Start

Prerequisites: Node.js 20+, npm, and an installed/authenticated Claude Code and/or Codex setup.

```powershell
git clone https://github.com/MindCraft-HX/mindcraft-agent.git
cd mindcraft-agent
npm install
npm run dev
```

Development starts Vite and Electron. Runtime data is stored in Electron `userData`, not in the repository or provider transcript directories.

### Verify And Package

```powershell
npm test
npm run test:contract
npm run build
npm run test:e2e
```

See the [Build & Deploy Guide](docs/build-and-deploy.md) for packaging and release details. Do not use the current `build/build.js --version` path.

### Documentation And Contributing

- [Documentation index](docs/index.md)
- [Architecture and data boundaries](docs/agent-architecture.md)
- [Session troubleshooting](docs/session-pitfalls.md)
- [GitHub publication workflow](docs/github-publication.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Repository Layout

```text
packages/agent/  shared Agent core for renderer, Electron, and preload
src/             host shell, routing, navigation, and host-only views
electron/        desktop runtime, windows, file-system integration, packaging
tests/           unit, contract, regression, and Electron smoke tests
docs/            engineering documentation and project decisions
```

## Data And Security

- Do not commit API keys, provider transcripts, local runtime state, private notes, packaged artifacts, or developer-specific configuration.
- Provider files may be read for supported integration and mapping; MindCraft must not write sidecar files beside provider transcripts.
- Review staged changes before publishing. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) for reporting and contribution guidance.

## License

Licensed under the [MIT License](LICENSE).
