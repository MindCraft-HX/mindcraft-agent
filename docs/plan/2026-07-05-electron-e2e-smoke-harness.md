# T185 Electron E2E Smoke Harness

> Date: 2026-07-05
> Status: proposed
> Scope: real Electron preload/main/renderer smoke coverage
> Related: T165, T167, R10, provider storage, settings boundary, session restore

## 1. Why This Exists

Current tests cover many domains well:

- pure helpers
- contract tests
- sessionRegistry integration tests
- IPC registry and import/export guards
- renderer composable characterization tests

The missing layer is the real desktop chain:

```text
Electron main
  -> preload bridge
  -> renderer UI
  -> user click/input
  -> ipcRenderer.invoke/send
  -> main handler
  -> userData / official config / session-registry
  -> renderer state update
```

Without this layer, regressions can pass unit/contract tests while failing in the actual app:

- preload forgets to expose an API that main registered
- renderer calls the wrong channel
- route/localStorage state opens the wrong page
- settings repair works in a direct handler test but fails from UI
- session restore works in registry tests but fails after app restart

## 2. Decision

Add a small Electron E2E smoke harness. Do not start with broad UI automation. The first version should prove that the app boots and that the highest-risk cross-process contracts work.

Recommended tool: Playwright Electron (`_electron`) if compatible with the current dev/build setup.

Do not make R10 IPC channel renaming depend on memory or manual smoke. R10 may be reconsidered only after at least one Electron E2E path covers preload/main/renderer together.

## 3. Phase 0: Harness Spike

Goal: boot the app in a controlled test userData directory.

Requirements:

- Launch Electron with isolated `userData`.
- Avoid touching real `~/.claude` / `~/.codex` unless explicitly opted in.
- Prefer fake provider homes under temp directories.
- Assert the main window reaches `#/main/home` or `#/main/codeHub`.
- Capture console errors and unhandled rejections.
- Close cleanly without zombie process.

Acceptance:

- One test command can launch and close the Electron app.
- Failing renderer console errors are visible in test output.
- The test does not mutate the developer's real provider config.

## 4. Phase 1: Preload/Main Contract Smoke

Cover read-only or low-risk calls first:

- `window.electronAPI` exists.
- Core bridges exist for settings, provider list, session index, skills/plugins list if available.
- Calling a read-only API returns a structured success/error payload rather than `undefined`.
- IPC channel registry remains compatible with preload exposure.

Suggested tests:

```text
boot app
  -> evaluate window.electronAPI keys
  -> navigate to CodeHub
  -> invoke provider list read
  -> invoke CodeHub session index read
  -> assert no unhandledRejection
```

## 5. Phase 2: Settings Boundary Smoke

Goal: prove UI-driven settings writes do not pollute official config.

Use temp `HOME` / provider dirs if feasible.

Scenarios:

- Save Claude settings via UI or bridge.
- Patch `gitMirrorUrl`.
- Patch `memoryInjectMode`.
- Assert official `settings.json` does not contain MindCraft-owned fields.
- Assert internal config contains the MindCraft-owned value.

This phase protects `docs/settings-json-pollution.md` from regressing through a real preload/main chain.

## 6. Phase 3: Session Restore Smoke

Goal: one minimal restore path per agent.

Do not require live provider API calls. Use synthetic transcript/session-registry fixtures.

Scenarios:

- Seed temp userData session-registry + panel state + transcript.
- Boot app.
- Navigate to CodeHub.
- Assert expected project/session tab appears.
- Restart app.
- Assert the same tab appears again, without duplicate session rows.

This is the E2E counterpart to T165/T167.

## 7. Phase 4: Optional Live Provider Smoke

Only run manually or behind an explicit env flag.

Possible checks:

- Send a tiny prompt to ClaudeCode/CodeX.
- Observe running -> done state.
- Interrupt.
- Restore history.

Never make this part of default CI until credentials, network, provider rate limits, and cleanup are controlled.

## 8. Non-goals

- Do not replace unit/contract tests.
- Do not automate every UI interaction.
- Do not require real API keys in default test runs.
- Do not run against the developer's real `~/.claude` / `~/.codex` by default.
- Do not use E2E as a reason to weaken IPC/channel contract tests.

## 9. Registration

Register as T185 in `docs/TODO.md`.

Suggested first implementation:

```text
test(e2e): add electron boot smoke harness
test(e2e): cover preload/main read-only bridges
test(e2e): cover settings sanitizer through real Electron chain
```
