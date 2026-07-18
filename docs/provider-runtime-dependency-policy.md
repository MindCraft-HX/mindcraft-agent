# Provider Runtime Dependency Policy

> Assessed: 2026-07-18
> Baseline: Codex CLI 0.144.5, Claude Code CLI 2.1.214, Claude Agent SDK 0.3.214.
> Registry latest at assessment time: 0.144.5, 2.1.214, and 0.3.214 respectively.

This document records how MindCraft integrates and upgrades its programming
agents. Runtime executables and application protocol adapters have different
owners and must not be treated as one update unit.

## Decision

| Provider | Production integration | Decision |
| --- | --- | --- |
| Codex | MindCraft `CodexCliTransport` -> configured external `codex exec --json` | Keep the direct external CLI transport |
| Claude Code | Bundled `@anthropic-ai/claude-agent-sdk` -> configured external `claude` executable | Keep the official Agent SDK and external CLI |

Both providers use user-installed external executables. Claude additionally
keeps an application SDK because MindCraft consumes its typed bidirectional
control surface: `query()`, `streamInput()`, `canUseTool`, hooks, permissions,
and `supportedCommands()`.

## Codex: Direct CLI Instead Of SDK

The current `@openai/codex-sdk` is a small wrapper around the same exec JSONL
process. Version 0.144.5:

- depends on `@openai/codex` at exactly 0.144.5;
- locates the npm package and platform binary when no override is supplied;
- starts an exec subprocess and parses line-delimited JSON;
- exposes no bidirectional approval channel beyond exec mode;
- does not replace MindCraft run ownership, transcript recovery, or lifecycle
  reconciliation.

Using it would reintroduce an application-bundled Codex CLI and couple SDK and
CLI releases without removing the lifecycle code MindCraft already needs. The
current transport accepts any configured executable, probes its public help,
owns only the child process it starts, and supports non-npm installers.

`codex app-server` is the more relevant future desktop integration surface: it
can generate TypeScript bindings and JSON Schema and supports stdio, Unix
sockets, and WebSocket transports. It remains explicitly experimental in
0.144.5, so it is not a production dependency. Re-evaluate it only after the
protocol is documented as stable and approval, cancellation, resume, and
packaged Electron behavior have contract tests.

## Claude Code: SDK Plus External CLI

`@anthropic-ai/claude-code` and `@anthropic-ai/claude-agent-sdk` are separate
npm packages. Updating the CLI does not update the SDK. MindCraft explicitly
passes `pathToClaudeCodeExecutable`, so the user-installed CLI performs the
work; the bundled SDK is the typed protocol and process-control adapter.

The Agent SDK must be upgraded with MindCraft, not hot-updated from the app.
SDK 0.3.214 declares `claudeCodeVersion: 2.1.214`, but also changes dependency
requirements to peers:

- `@anthropic-ai/sdk >= 0.93.0`;
- `@modelcontextprotocol/sdk ^1.29.0`;
- `zod ^4.0.0`.

MindCraft pins the Agent SDK and its tested peer set at the application root:
`@anthropic-ai/sdk 0.93.0`, `@modelcontextprotocol/sdk 1.29.0`, and `zod 4.4.3`.
This prevents duplicate protocol libraries and accidental drift during a clean
install. Future changes to any member of this set require the same upgrade
gates as an Agent SDK change.

## Upgrade Workflow

### External CLIs

Users may update Codex and Claude Code independently. MindCraft checks the
configured executable rather than an npm package location.

For every supported CLI release candidate:

1. Record `--version` and the relevant command help.
2. Run lifecycle, resume, image, permission, abort, transcript, and Electron
   smoke tests.
3. Update the adapter only when a required capability or event contract
   changes. Do not modify adapters merely because a new version exists.
4. Reject or clearly explain an incompatible executable instead of silently
   falling back to a bundled provider runtime.

### Application SDKs

Dependency automation may propose Agent SDK upgrades, but they merge only after
review. The SDK and peer dependencies ship with a new MindCraft release and are
never loaded from the user's global npm directory.

Required gates are `npm test`, `npm run test:contract`, `npm run build`, and
`npm run test:e2e`, plus a real Claude permission prompt, hook, resume, streamed
input, slash-command, abort, and packaged executable check.

## 2026-07-18 Upgrade Assessment

### Codex 0.144.5

The installed executable is already the registry latest. Required production
capabilities remain present: `exec --json`, `exec resume`, images, additional
directories, and non-Git workspace support. Current rendering already handles
the canonical SDK item set (`agent_message`, `reasoning`, `command_execution`,
`file_change`, `mcp_tool_call`, `web_search`, and `todo_list`).

Decision: no transport migration or feature change is required. Keep
app-server and exec-server experimental features out of production. Consider
`doctor` as a future diagnostics action and `output-schema` only when MindCraft
has a product use case for structured agent output.

### Claude Code 2.1.214 / Agent SDK 0.3.214

The installed CLI is already the registry latest. The latest Agent SDK matches
that CLI release and retains all APIs MindCraft currently uses. It also adds or
expands typed user dialogs, message-display hooks, permission-denial events,
prompt suggestions, command-change events, session mutation APIs, and richer
runtime/status messages.

Decision: the SDK 0.3.214 compatibility upgrade is complete. The peer set is
explicit and deduplicated, and no new SDK behavior is enabled by the migration.
Product features remain separate changes with their own contracts. The
highest-value candidates are typed user dialogs/permission denial, dynamic
command updates, and official session list/get/delete APIs. Prompt suggestions
and progress summaries are optional UX experiments, not upgrade blockers.
