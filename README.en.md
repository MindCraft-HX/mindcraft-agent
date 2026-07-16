<p align="center">
  <img src="public/logos/v3/white-app-icon.svg" width="96" alt="MindCraft Agent logo">
</p>

<h1 align="center">MindCraft Agent</h1>

<p align="center">
  One desktop workspace for <strong>Claude Code</strong>, <strong>Codex</strong>, and the software projects they help you build.
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/MindCraft-HX/mindcraft-agent/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-3b82f6.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/desktop-Electron-47848f.svg" alt="Electron desktop app">
  <img src="https://img.shields.io/badge/agents-Claude%20Code%20%2B%20Codex-111827.svg" alt="Claude Code and Codex">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> · <a href="#inside-the-workspace">Features</a> · <a href="docs/index.md">Docs</a> · <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://www.mindcraft.com.cn"><strong>Visit MindCraft to download the app</strong></a>
</p>

![MindCraft Agent product overview](docs/images/overview.png)

<p align="center"><em>Projects, document work, lightweight chat, and usage insight in one desktop workspace.</em></p>

## Why MindCraft Agent?

AI coding should not require juggling terminals, provider-specific windows, project notes, and file diffs. MindCraft Agent gives Claude Code and Codex a shared, project-aware desktop home while preserving the boundaries each provider needs.

| | What you get | Why it matters |
| --- | --- | --- |
| **01** | **Two coding agents, one workspace** | Switch between Claude Code and Codex without abandoning the project context. |
| **02** | **A visible development loop** | Follow streamed responses, tool activity, task progress, changed files, and diffs. |
| **03** | **Sessions that stay understandable** | Keep UI sessions, provider threads, and provider transcripts as distinct identities. |
| **04** | **Document work beside code work** | Browse, edit, preview, and link Markdown or code files without leaving the app. |

```text
Claude Code ─┐
             ├── MindCraft Agent ── projects · sessions · diffs · documents
Codex ───────┘
```

## Inside The Workspace

### Multi-Agent Project Flow

![Multi-agent workspace](docs/images/multi-agent-workspace.png)

<p align="center"><em>Navigate sessions, follow task progress, control models, and use slash commands in one focused view.</em></p>

### Review Changes In Context

![Code change review](docs/images/code-change-review.png)

<p align="center"><em>Inspect file changes and diffs inside the conversation, then carry on with the agent.</em></p>

### Keep Documentation Close

![Document workspace](docs/images/document-workspace.png)

<p align="center"><em>Edit, preview, and split-view Markdown or code files without breaking your flow.</em></p>

## Quick Start

### Get The App

Visit [MindCraft](https://www.mindcraft.com.cn) for the latest available download options and product information.

### Prerequisites

- Node.js 20+
- npm
- An installed and authenticated Claude Code and/or Codex setup

### Run From Source

```powershell
git clone https://github.com/MindCraft-HX/mindcraft-agent.git
cd mindcraft-agent
npm install
npm run dev
```

MindCraft Agent starts Vite and Electron. Its runtime data stays in Electron `userData`, not in your repository or provider transcript directories.

## Learn And Contribute

| Looking for | Start here |
| --- | --- |
| System boundaries and architecture | [Architecture guide](docs/agent-architecture.md) |
| Session recovery and troubleshooting | [Session pitfalls](docs/session-pitfalls.md) |
| Local development and packaging | [Build and deploy guide](docs/build-and-deploy.md) |
| Complete engineering documentation | [Documentation index](docs/index.md) |
| Contributions and pull requests | [Contributing guide](CONTRIBUTING.md) |
| Security reports | [Security policy](SECURITY.md) |

## Project Layout

```text
packages/agent/  shared Agent core for renderer, Electron, and preload
src/             host shell, routing, navigation, and host-only views
electron/        desktop runtime, windows, file-system integration, packaging
tests/           unit, contract, regression, and Electron smoke tests
docs/            engineering documentation and project decisions
```

## License

Released under the [MIT License](LICENSE).
