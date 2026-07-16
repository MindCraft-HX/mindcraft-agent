# MindCraft Agent

> A desktop workspace that brings Claude Code and Codex into one project-aware development flow.

[English](README.md) | [简体中文](README.zh-CN.md)

![MindCraft Agent product overview](docs/images/overview.png)

_Product overview: start project conversations, browse documents, use lightweight chat, and review usage from one desktop workspace._

## Highlights

- **Two coding agents, one workspace** - Use Claude Code and Codex side by side while preserving provider-specific runtime and session boundaries.
- **Project-aware sessions** - Keep MindCraft UI sessions, provider threads, and official transcripts clearly separated.
- **Visible development flow** - Review streamed responses, tool activity, file changes, diffs, task progress, and normalized token metrics.
- **Built-in document workspace** - Open, browse, and edit local Markdown and code files with tabs and path-link navigation.
- **Local-first boundaries** - MindCraft-owned state stays in Electron `userData`, not in provider configuration or transcript directories.

## Workspace Tour

### Multi-Agent Workspace

![Multi-agent workspace](docs/images/multi-agent-workspace.png)

Session navigation, task progress, model controls, and slash commands in one view.

### Code Change Review

![Code change review](docs/images/code-change-review.png)

Inspect diffs in the conversation flow, then continue collaborating with the agent.

### Document Workspace

![Document workspace](docs/images/document-workspace.png)

Edit, preview, and split-view Markdown and code files without leaving the app.

## Quick Start

Prerequisites: Node.js 20+, npm, and an installed/authenticated Claude Code and/or Codex setup.

```powershell
git clone https://github.com/MindCraft-HX/mindcraft-agent.git
cd mindcraft-agent
npm install
npm run dev
```

Development starts Vite and Electron. Runtime data is stored in Electron `userData`, not in the repository or provider transcript directories.

## Verify And Package

```powershell
npm test
npm run test:contract
npm run build
npm run test:e2e
```

See the [Build & Deploy Guide](docs/build-and-deploy.md) for packaging and release details. Do not use the current `build/build.js --version` path.

## Documentation

| Topic | Read |
| --- | --- |
| Architecture and data boundaries | [agent-architecture.md](docs/agent-architecture.md) |
| Session troubleshooting | [session-pitfalls.md](docs/session-pitfalls.md) |
| GitHub publication workflow | [github-publication.md](docs/github-publication.md) |
| Full documentation index | [docs/index.md](docs/index.md) |

## Contributing And Security

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Do not commit API keys, provider transcripts, local runtime state, private notes, or packaged artifacts.

## Repository Layout

```text
packages/agent/  shared Agent core for renderer, Electron, and preload
src/             host shell, routing, navigation, and host-only views
electron/        desktop runtime, windows, file-system integration, packaging
tests/           unit, contract, regression, and Electron smoke tests
docs/            engineering documentation and project decisions
```

## License

Licensed under the [MIT License](LICENSE).
