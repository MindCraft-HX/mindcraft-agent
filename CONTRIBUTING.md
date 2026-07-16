# Contributing To MindCraft Agent

Thanks for contributing. This project combines a host Electron application with
a shared Claude Code and Codex agent core, so small-looking changes can cross
runtime, session, storage, and UI boundaries.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Discuss substantial features, architecture changes, or provider integrations
  in an issue first.
- Read [the documentation index](docs/index.md) and the routing table in
  `AGENTS.md` before changing an agent, session, runtime, or storage path.
- Never include API keys, user transcripts, screenshots containing private data,
  local agent state, or packaged application artifacts in a contribution.

## Development Setup

```powershell
npm install
npm run dev
```

Use a supported local Claude Code and/or Codex installation for provider
testing. Do not commit provider configuration or credentials.

## Change Boundaries

- Shared Claude Code/CodeX behavior belongs in `packages/agent/**`.
- Host shell, routing, navigation, and desktop-window wiring belong in `src/**`
  or `electron/**`.
- MindCraft-owned data belongs in Electron `userData`, never in provider
  transcript or configuration directories unless a provider's documented schema
  explicitly requires it.
- Preserve the distinction between MindCraft `chatKey`, provider session IDs,
  and transcript file paths.

## Validation

Run the checks relevant to your change before opening a pull request:

```powershell
npm test
npm run test:contract
npm run build
```

For preload, main-process, or renderer wiring, also run:

```powershell
npm run test:e2e
```

Mention the commands you ran and any skipped validation in the pull request.

## Pull Request Expectations

- Keep pull requests focused and explain the user-visible behavior change.
- Add or update regression/contract tests for changed behavior.
- Update the relevant stable document when changing an architectural contract;
  do not make a dated implementation plan the only source of truth.
- Keep `AGENTS.md` and `CLAUDE.md` identical when modifying either file.

## Reporting Security Issues

Do not file public issues for suspected vulnerabilities. Follow
[SECURITY.md](SECURITY.md) instead.
