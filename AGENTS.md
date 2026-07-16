# mindcraft-agent

轻量级多 Agent 桌面开发平台，核心是 ClaudeCode 与 CodeX 双编程 Agent，另有文档浏览与轻量 Chat。

`AGENTS.md` 与 `CLAUDE.md` 是同一份项目协作规范，必须保持字节一致。这里只放项目背景、硬边界和排障路由；长期细节进入 `docs/`，行为保障进入 `tests/`。

## Architecture

```text
packages/agent/  shared Agent core: renderer, Electron, and preload capabilities
src/             host shell, routing, navigation, and host-only views
electron/        desktop runtime, windows, menus, file system, and packaging
tests/           regression, contract, and Electron smoke tests
docs/            versioned engineering knowledge base
```

- Shared ClaudeCode/CodeX/codeHub behavior belongs in `packages/agent/**`.
- Host shell, routing, navigation, and desktop-window wiring belong in `src/**` or root `electron/**`.
- Shared provider logic exists once only, normally under `packages/agent/src/components/agentCommon/**` or `packages/agent/electron/**`.
- Do not place host-only behavior in `packages/agent` or copy shared logic between providers.

## Documentation Routing

| Situation | Read first |
| --- | --- |
| Documentation entry point | `docs/index.md` |
| Current work and bugs | `docs/TODO.md` |
| Architecture, ownership, data boundary | `docs/agent-architecture.md` |
| Duplicate, interrupted, missing, or stuck sessions | `docs/session-pitfalls.md` |
| Token metrics, StatusBar, footer, context, cache | `docs/token-metrics-contract.md`, then `docs/token-metrics.md` |
| SDK capability or official API | `docs/sdk-feature-gaps.md`, then local `.d.ts` files |
| Claude settings pollution | `docs/settings-json-pollution.md` |
| Dev white screen or zombie process | `docs/bugs/dev-white-screen-zombie-process.md` |
| Packaging and releases | `docs/build-and-deploy.md` |
| GitHub publication and mirror workflow | `docs/github-publication.md` |
| Performance investigation | `docs/perf-audit-report.md` |
| Activation hot path and cache governance | `docs/plan/2026-07-05-hot-path-governance-and-streaming-render.md`, `docs/plan/2026-07-05-project-session-activation-work-graph.md`, `docs/plan/2026-07-05-cache-governance-and-local-derived-data.md` |
| Electron end-to-end verification | `docs/plan/2026-07-05-electron-e2e-smoke-harness.md` |
| Architecture review | `docs/architecture-health-review-2026-06-28.md`, `docs/review.md` |

## Data And Session Boundaries

- MindCraft-owned data must stay in Electron `app.getPath('userData')` or app-owned configuration. Never write it into `.claude`, `.codex`, provider transcripts, or project provider folders.
- Provider directories contain only provider-supported configuration, authentication, skills, plugins, MCP, transcripts, and runtime state. Do not add MindCraft sidecars beside transcripts.
- `chatKey` is the MindCraft UI session identity; `cliSessionId`/thread id is the provider identity; `filePath` points to a transcript. Never use them interchangeably.
- `onAgentDone` is not guaranteed after a crash; do not assume scan and done events are ordered.
- `resetAgentRuntime()` and `resetCodexSdkRuntime()` affect every window.
- Strip system tags only through `stripSystemContextTags()`.
- `gitMirrorUrl` and `memoryInjectMode` are MindCraft-owned fields and must not be written to `~/.claude/settings.json`; sanitize official settings writes.

## Performance And Cache Rules

- Tab summaries expose only lightweight UI fields. Never pass complete projects, chats, or messages through tab props.
- Activation synchronously updates only active identity, already-cached UI state, current-session first load, focus, and scroll. Metrics, full scans, registry writes, and non-current work run later.
- Use scheduled refresh with per-project cooldown; update ordering at the send/done boundary instead of polling on focus.
- Drafts use session-registry plus renderer memory cache. Switching tabs must not cause per-key panel writes or disk I/O.
- New caches require an owner, key, source of truth, invalidation, timeout/limit, and mutation policy. Read `docs/plan/2026-07-05-cache-governance-and-local-derived-data.md` first.
- Prefer `createFileDerivedCache()` for file-derived data and `trackDedup()` (or equivalent timeout-backed identity guards) for in-flight work. A cache hit must not write registry, panel state, official directories, or trigger heavy scan/IPC.
- Skill or plugin mutations must clear the slash-command cache; follow `docs/skill-plugin-cache-invalidation.md`.
- Performance probes and diagnostic logs require an explicit flag; do not add default dev-console noise.

## Token Metrics Rules

- UI semantics are fixed: `in = regular input + cache creation`, `out = output`, `cache = cache read`, `context = current context usage`.
- Interpret provider raw usage only in main-process adapters/normalizers. Renderer code must not interpret raw token fields.
- Status bar, message footer, and history restoration consume `normalizer -> TurnStore -> snapshot`.
- Panel state may store UI data, but never current-turn input/output/cache/duration/cost metrics. Historical aggregates must not feed current-turn status UI.
- Animate only between real samples; never fabricate token growth or reuse prior-turn data.

## Engineering Practice

- Read an entire function before editing large runtime or view files, especially `claudeAgent.js`, `codexAgent.js`, and provider `index.vue` files.
- After three regressions in one function, stop patching: redraw the boundary or add a contract test.
- Before changing session/project activation, scans, metrics, drafts, or history, write a work graph with synchronous work, background work, source of truth, cancellation, deduplication, invalidation, and probes. Separate P0 visible work, P1 current-session first load, P2 backfill, and P3 background repair.
- Before using a new SDK API, inspect local definitions: Claude at `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`; Codex at `node_modules/@openai/codex-sdk/dist/index.d.ts`.
- Never log API keys, including prefixes or lengths.
- Update stable documentation and tests when changing a contract. Keep private or temporary material under ignored `docs/local/`, `docs/private/`, or `docs/tmp/`.
- Preserve unrelated working-tree changes. Never use destructive Git commands without explicit approval.

## Development And Release

- For a dev white screen, inspect `[main] route check:` first; `#/side` usually indicates route pollution.
- Same-origin windows share localStorage; route persistence may write only `/main` routes.
- Dev mode protects against zombie processes through predev port cleanup, a three-second server probe, and quit-on-window-close.
- Run relevant checks before handoff: `npm test`, `npm run test:contract`, `npm run build`, and `npm run test:e2e` for Electron wiring.
- Follow `docs/build-and-deploy.md` for packaging. Do not use the broken `build.js --version` path.
- Keep `origin/develop` as the internal source of truth. Publish reviewed commits to GitHub only through the branch and remote workflow in `docs/github-publication.md`; never use `git push --mirror`.
