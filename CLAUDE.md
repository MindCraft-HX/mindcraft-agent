# mindcraft-agent Repository Guide

## Project Identity

- This repository is the main product repo for `mindcraft-agent`.
- `mindcraft-agent` is not a trimmed copy of `mindcraft-electron`.
- Product positioning: a lightweight multi-agent integration platform.
- First-stage core experience:
  - Claude Code + Codex dual-agent support
  - multi-agent selection as a foundation
  - document browsing retained
  - lightweight knowledge Q&A retained
  - future embedding into other clients must remain feasible

## Current Architecture

- `packages/agent/**`
  Shared agent core.
  Contains renderer, electron, preload entrypoints and shared agent UI/runtime.

- `src/**`
  `mindcraft-agent` host application layer.
  Owns shell, navigation, product routes, and host-only pages.

- `electron/**`
  Desktop runtime host.
  Owns windows, menus, preload wiring, filesystem integration, and packaging behavior.

## Hard Boundaries

- Do not pull full `mindcraft-electron` business features back into `packages/agent`.
- Do not treat `packages/agent` as a dump for host-specific behavior.
- Document browsing is a host capability, not an agent-core protocol concern.
- Lightweight Q&A should live inside the agent workspace experience.
- Do not reintroduce the old complex chat product shape.
- Do not add direct dependency on full-app business APIs such as legacy `/llm/chat` flows for lightweight Q&A.

## Product Rules

- `mindcraft-agent` is a standalone product first.
- `packages/agent` is a shared core that can be reused by `mindcraft-agent` and `mindcraft-electron`.
- If Full and Agent behavior diverge clearly, add explicit shared configuration only then.
- Multi-agent support must stay extensible.
- Prefer moving CodeHub toward a registry model instead of hardcoding only Claude/Codex paths.

## Current Priorities

- `T041`: `mindcraft-agent` host refactor and pruning
- `T045`: stabilize and reuse the shared agent layer
- `T046`: Claude session duplication / handoff issue — **P0 fixes (E/B/A) applied 2026-06-11, P1(C)/P2(D) pending. See `docs/bugs/claude-session-duplicate-split.md`**

Before major implementation work, read:

- `docs/TODO.md`
- `docs/plan/2026-06-10-mindcraft-agent-refactor.md`

**When investigating any session-related bug (duplicate chats, interrupted conversations, session loss, freeze on restore), read FIRST:**

- `docs/session-pitfalls.md` ← **排查入口，所有会话 bug 必读**
- Then the relevant agent-specific doc:
  - Claude: `docs/bugs/claude-session-duplicate-split.md`
  - Codex: `docs/bugs/codex-conversation-interruption.md`
- Architecture context: `docs/agent-architecture.md` (especially §6 会话管理内部机制)

## Development Guidance

- Prefer small, reversible changes.
- Preserve existing tests unless the behavior is intentionally changed.
- When changing behavior, add or update focused tests first.
- Avoid broad refactors outside the active task boundary.
- Do not silently rename product concepts back to `lite`.
- Keep `CodeHub`, Claude, Codex, and agent-common boundaries explicit.

### Session Bug Investigation Rules

When touching ANY code related to session management (chat creation, binding, scanning, restore, provider switch, abort, done signaling):

1. **Read `docs/session-pitfalls.md` first.** It identifies 5 trap patterns that have bitten us repeatedly.
2. **Check whether your change affects the crash+restore path.** Most of our bugs are in the gap between "normal runtime" and "crash recovery." A mechanism that's correct for normal operation can be deadly after crash.
3. **Trace the full lifecycle** of a chat through your change: create → send → stream → error/abort/completion → save → crash → restore → next send.
4. **Do not assume `onAgentDone` will always fire.** It may not fire on crash. It may fire with empty `cliSessionId` on error.
5. **Do not assume the scan runs after `onAgentDone`.** They are concurrent and can arrive in either order.
6. **When modifying a guard condition** (like `shouldReloadClaudeChatFromDisk`), check both the "normal runtime protection" and "crash recovery" scenarios — they may require opposite behaviors.
7. **Provider switch (`resetAgentRuntime`) affects ALL windows.** If you clear a shared Map, ensure ALL windows can recover, not just the active one.

## Verification

Use targeted tests first, then broader verification as needed.

Examples:

```bash
node --test tests/codehub-agent-route-preference.test.mjs
node --test tests/codehub-active-tab-sync.test.mjs
node --test tests/codex-session-routing.test.mjs
```

For broader checks:

```bash
npm run build
```

Run only the tests relevant to the files you changed, then expand if the change touches shared behavior.

## Git And Docs Notes

- `.gitignore` currently ignores:
  - `docs/`
  - `AGENTS.md`
- That means plan/spec/doc changes and this file will not appear in normal `git status`.
- If a doc or `AGENTS.md` must be committed, use `git add -f <path>` or update ignore rules intentionally.

## When Making Decisions

- Prefer "product independent, core shared".
- Prefer host pruning over shared-core over-abstraction.
- Prefer explicit agent capability boundaries over convenience shortcuts.
- Prefer keeping lightweight Q&A simple rather than rebuilding the original full chat system.
