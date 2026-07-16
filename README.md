# MindCraft Agent

MindCraft Agent is a lightweight desktop workspace for coding with Claude Code and Codex. It provides a shared multi-agent shell alongside document browsing and lightweight chat, while keeping provider-specific runtime boundaries explicit.

> This repository is currently intended for local development and evaluation. You need your own configured Claude Code and/or Codex access; no provider credentials are included.

## What It Includes

- Claude Code and Codex coding-agent panels in one Electron application.
- Project and session management with provider session identity kept separate from MindCraft UI identity.
- Local Markdown viewer, code/file-change views, and lightweight chat.
- Shared agent-core package for renderer, Electron, and preload logic.
- Contract, unit, and Electron smoke-test coverage for critical boundaries.

## Architecture

```text
packages/agent/  shared agent core reused by the host application
src/             host shell, routing, navigation, and host-only views
electron/        desktop runtime, preload, file-system integration, packaging
tests/           regression, contract, and Electron smoke tests
docs/            maintainers' knowledge base and decision records
```

Read [the architecture contract](docs/agent-architecture.md) before changing agent behavior, storage, or session handling.

## Prerequisites

- Node.js 20 or later.
- npm.
- A supported desktop platform for Electron (Windows is the primary development target in this repository).
- Installed and authenticated Claude Code and/or Codex tooling if you plan to use their corresponding panels.

## Development

```powershell
npm install
npm run dev
```

The development server runs on `127.0.0.1:16288` and launches Electron through the Vite Electron plugin. Runtime data is stored under the application user-data directory, not in the repository or provider configuration directories.

## Verification

```powershell
npm test
npm run test:contract
npm run build
npm run test:e2e
```

`test:e2e` does not require real provider API keys. See [the E2E smoke-harness notes](docs/plan/2026-07-05-electron-e2e-smoke-harness.md) for environment requirements and scope.

## Packaging

Use the documented packaging flow rather than the convenience production script: the current `build/build.js --version` path can point release notes at an undefined filename.

```powershell
cross-env NODE_ENV=production NODE_PLATFORM=WIN npx vite build --mode prod
npx electron-builder --config=./build/builder.prod.json
```

See [Build & Deploy Guide](docs/build-and-deploy.md) for versioning, macOS requirements, and release artifacts.

## Documentation

- [Documentation index](docs/index.md)
- [Current work and release queue](docs/TODO.md)
- [Session troubleshooting](docs/session-pitfalls.md)
- [Token metrics contract](docs/token-metrics-contract.md)
- [Settings pollution guard](docs/settings-json-pollution.md)

## Data And Security Boundaries

- MindCraft-owned state belongs under Electron `userData`; it must not be written into `.claude`, `.codex`, provider transcript directories, or project configuration folders.
- Provider files may be read for supported integration and mapping purposes; application sidecar files must not be written beside provider transcripts.
- Never commit credentials, private notes, runtime logs, packaged artifacts, or local developer configuration. The repository `.gitignore` covers common paths, but inspect staged changes before publishing.

## License

This project is licensed under the [MIT License](LICENSE).
