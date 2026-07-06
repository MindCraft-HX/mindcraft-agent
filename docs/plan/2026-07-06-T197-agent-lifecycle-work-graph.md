# T197 Agent Lifecycle Characterization

> Date: 2026-07-06
> Status: Phase 1 — work graph
> Scope: ClaudeCode + CodeX core lifecycle, characterization only, no extraction
> Related: T186 (boundary audit), T165 (session registry), T183 (cache governance)

## 1. Purpose

Map the agent lifecycle for both providers at a level that supports future extraction decisions. Do not change any behavior. Do not split files.

## 2. Common Lifecycle Template

```
┌─────────────────────────────────────────────────────────────┐
│                   AGENT LIFECYCLE                            │
├──────────┬──────────────────────────────────────────────────┤
│ 1. SEND  │ IPC handler receives prompt + context             │
│          │ → read provider config (model/key/url/effort)     │
│          │ → read session meta (model/effort/modelTier)      │
│          │ → check if existing query → resume or new         │
├──────────┼──────────────────────────────────────────────────┤
│ 2. SETUP │ Create AbortController                           │
│          │ → build user message (text + images)              │
│          │ → inject memory (Claude: user mode only)          │
│          │ → load SDK / CLI binary                           │
│          │ → resolve cwd, extra dirs, permission hooks       │
├──────────┼──────────────────────────────────────────────────┤
│ 3. QUERY │ SDK/CLI query() with model/effort/permission      │
│          │ → register run ownership (agentSessions Map)      │
│          │ → start background task tracker                   │
│          │ → pipe stdin/stdout (CodeX) or SDK stream (Claude)│
├──────────┼──────────────────────────────────────────────────┤
│ 4. STREAM│ On each event:                                    │
│          │   assistant → map to UI message block             │
│          │   thinking  → map to thinking block               │
│          │   tool_use  → map to tool start + input           │
│          │   result    → capture final turn tokens           │
│          │ → safeSend() to renderer via IPC                  │
│          │ → metrics sample (live counts + token estimates)   │
├──────────┼──────────────────────────────────────────────────┤
│ 5. DONE  │ Stream ends (success/failure/abort)              │
│          │ → capture exit code + file path                   │
│          │ → final metrics flush (Claude: sdkResult; CodeX:   │
│          │   jsonl parse)                                    │
│          │ → send agent-done IPC to renderer                 │
│          │ → session registry: upsert metadata (model,       │
│          │   effort, updatedAt, title)                       │
│          │ → emit notification event (done sound gate)       │
│          │ → cleanup: abort controller, background task       │
├──────────┼──────────────────────────────────────────────────┤
│ 6. ABORT │ IPC handler: claude/codex-agent-abort             │
│          │ → AbortController.abort()                         │
│          │ → query.close() / process.kill()                  │
│          │ → send abort message to renderer                  │
│          │ → cleanup run ownership                           │
│          │ → metrics flush (partial)                         │
├──────────┼──────────────────────────────────────────────────┤
│ 7. FLUSH │ On done or renderer request:                      │
│          │ → compute final token counts from stream samples  │
│          │ → write to TurnStore (in/out/cache/duration)      │
│          │ → emit claude/codex-agent-metrics IPC             │
│          │ → renderer consumes via StatusBarMetrics          │
└──────────┴──────────────────────────────────────────────────┘
```

## 3. ClaudeCode Lifecycle — Owner Map

### Entry: `ipcMain.handle('claude-agent-query')` (line ~2598)

| Phase | Owner File | Key Function/Block | Cancellation | Tests |
|-------|-----------|-------------------|--------------|-------|
| Config read | `claudeAgent.js` | `readRuntimeConfigFromUserSettingsFile()`, `readEffortLevel()`, `readPermissionPolicy()` | N/A | — |
| Session meta | `claudeAgent.js` | `cliSessionIds.get(chatKey)`, `readClaudeSessionMeta()`, `pendingSessionMetaByChatKey` | N/A | sessionRegistry tests |
| Resume check | `claudeAgent.js` | `agentSessions.get(chatKey)` — reuse existing query via `streamInput()` | runtime change → abort old query | — |
| Memory inject | `claudeAgent.js` | `claudeMemory.buildMemoryPrompt()` (user mode only) | N/A | `claude-meta-user-prompt.test.mjs` |
| SDK load | `claudeAgent.js` | `loadClaudeAgentSdk()`, `findSystemClaude()` | N/A | — |
| Query create | `claudeAgent.js` | `query({ prompt, options })` — SDK `@anthropic-ai/claude-agent-sdk` | `AbortController` | — |
| Permission hook | `claudeAgent.js` | `canUseTool`, `onPermissionRequest` → `claude-agent-permission` IPC | abort if denied | `claude-permission-sound.test.mjs` |
| Stream map | `claudeAgent.js` | `claude-stream-chunk` (assistant), `claude-stream-thinking`, `claude-stream-tool-start`, `claude-stream-tool-input` | N/A | contract tests |
| Metrics sample | `claudeAgent.js` | `liveSampleCounts` object — sdkLiveCount, sdkResultCount, sawLiveTurnTokens, sawFinalTurnTokens | N/A | `claude-task-stream-sync.test.mjs` |
| Done handler | `claudeAgent.js` | Result → capture exitCode + _agentRunDoneFilePath → `claude-agent-done` IPC | N/A | contract tests |
| Session register | `claudeAgent.js` | `claude-register-cli-sessions` → sessionRegistry.upsert | N/A | sessionRegistry.claudeIntegration.test.js |
| Notification | `claudeAgent.js` | `agentNotificationGate` → done sound if `agent.turn.terminal` | N/A | `agent-notification-gate.test.mjs` |
| Metrics flush | `claudeAgent.js` | `computeClaudeTurnTokens()` → TurnStore → `claude-agent-metrics` IPC | N/A | `claude-task-stream-sync.test.mjs` |
| Abort handler | `claudeAgent.js` | `ipcMain.handle('claude-agent-abort')` → abortController.abort() + query.close() | self | — |
| Cleanup | `claudeAgent.js` | finally: clear timer, remove agentSessions entry, clear slowNotice | N/A | — |

### Key Data Structures

| Name | Type | Owner | Lifecycle |
|------|------|-------|-----------|
| `agentSessions` | `Map<chatKey, { query, abortController, event, model, baseURL, apiKey }>` | `claudeAgent.js` | Created on query start, cleared on done/abort/error |
| `cliSessionIds` | `Map<chatKey, cliSessionId>` | `claudeAgent.js` | Created on register/first run, survives across runs |
| `sessionModels` | `Map<chatKey, model>` | `claudeAgent.js` | Tracks last used model per session |
| `pendingSessionMetaByChatKey` | `Map<chatKey, { model, effort, modelTier }>` | `claudeAgent.js` | Set before query, used on done to update registry |
| `slowNoticeSent` | `Set<chatKey>` | `claudeAgent.js` | Tracks "slow" notice sent, per-session lifetime |
| `liveSampleCounts` | `object` | `claudeAgent.js` (closure) | Per-run lifetime |

## 4. CodeX Lifecycle — Owner Map

### Entry: `ipcMain.handle('codex-agent-query')` (line ~4151)

| Phase | Owner File | Key Function/Block | Cancellation | Tests |
|-------|-----------|-------------------|--------------|-------|
| Config read | `codexAgent.js` | `configManager.readRuntimeConfig()`, `readReasoningEffort()` | N/A | `codexRuntimeConfig.test.js` |
| Session meta | `codexAgent.js` | `getSessionMeta()`, `sessionMetaMap` | N/A | sessionRegistry tests |
| Queue/Resume | `codexAgent.js` | Queue pending input if running; check `activeSessions` for resume | runtime change → abort | `codex-queue-race-plan.md` |
| CLI launch | `codexAgent.js` | `findSystemCodex()`, spawn `codex exec` child process | `AbortController` + process.kill | — |
| Stdin pipe | `codexAgent.js` | Write prompt + images to stdin, handle JSONL stdout | N/A | — |
| Stream map | `codexAgent.js` | JSONL parse → `codex-stream-chunk` (assistant), `codex-stream-thinking`, `codex-stream-tool-delta` | N/A | `codex-event-rendering-contract.test.mjs` |
| Tool render | `codexAgent.js` | `codex-ui-event-mapper.mjs` — tool call block construction | N/A | `codex-ui-event-mapper.test.mjs` |
| Metrics sample | `codexAgent.js` | `codex-agent-metrics` periodic push (not just final) | N/A | `codex-agent-done-reason.test.mjs` |
| Done handler | `codexAgent.js` | Process exit → parse final JSONL lines → `codex-agent-done` IPC | N/A | `codex-agent-done-reason.test.mjs` |
| Session register | `codexAgent.js` | `codex-register-cli-sessions` → sessionRegistry.upsert | N/A | sessionRegistry.codexIntegration.test.js |
| Notification | `codexAgent.js` | `agentNotificationGate` — same gate as Claude | N/A | `agent-notification-gate.test.mjs` |
| Metrics flush | `codexAgent.js` | JSONL token count parse → TurnStore → `codex-agent-metrics` final | N/A | contract tests |
| Abort handler | `codexAgent.js` | `ipcMain.handle('codex-agent-abort')` → abortController.abort() + process.kill() | self | — |
| Cleanup | `codexAgent.js` | finally: clear activeSessions entry, sessionMetaMap, background task | N/A | — |

### Key Data Structures

| Name | Type | Owner | Lifecycle |
|------|------|-------|-----------|
| `activeSessions` | `Map<chatKey, { process, abortController, event, ... }>` | `codexAgent.js` | Created on query start, cleared on done/abort/error |
| `sessionMetaMap` | `Map<chatKey, { model, reasoningEffort, ... }>` | `codexAgent.js` | Set before query, used on done |
| `pendingInput` | `Map<chatKey, queued prompts>` | `codexAgent.js` | Queue for `codex-chat-continue` |

## 5. Difference Map: ClaudeCode vs CodeX

| Dimension | ClaudeCode | CodeX |
|-----------|-----------|-------|
| Transport | SDK (in-process JS) | CLI subprocess (stdin/stdout JSONL) |
| Resume | SDK `--resume <uuid>` | Same CLI session, append to stdin |
| Stream format | SDK event callbacks | JSONL line parsing |
| Thinking | Dedicated `thinking` event | `thinking` type in JSONL |
| Tool delta | `tool_input` (JSON delta, re-assemble) | `tool_delta` (text delta, append) |
| Metrics source | SDK `result` object (cost, usage) | JSONL `results` line (usage) |
| Queue | Stream input to existing query | Append to stdin pipe |
| Abort | `AbortController.abort()` + `query.close()` | `AbortController.abort()` + `process.kill()` |
| Done reason | result type | exit code + JSONL parsing |
| Model switch | Close old query, create new | Kill old process, start new |

## 6. Unsafe Boundaries (Do Not Split)

Per T186 §5, these boundaries MUST NOT be extracted without stronger characterization:

1. **Stream loop** — event ordering is critical; Claude SDK callbacks vs CodeX JSONL lines have different ordering guarantees
2. **Abort/interrupt/done** — cleanup ordering (abort controller → query close → session clear → registry update) is intentional
3. **Queued input** — `streamInput()` (Claude) and stdin append (CodeX) depend on session state that must not drift
4. **Session map mutation** — `agentSessions` / `activeSessions` Map is the single ownership point for active runs
5. **Run ownership cleanup** — `finally` blocks in both providers must always fire
6. **Final metrics flush** — must happen AFTER done event emission but BEFORE session map cleanup

## 7. Safe Boundaries (Can Extract)

These have stable contracts and could be extracted without lifecycle risk:

1. **Config reading** (model/key/url/effort/permission) — already partially extracted (configManager, codexRuntimeConfig)
2. **Message building** (text + images → content blocks) — pure function, no side effects
3. **Session meta normalization** (`normalizeClaudeSessionMeta`) — pure function
4. **Memory prompt building** — pure function
5. **Slow notice timer** — isolated timeout, no lifecycle coupling if extracted as a helper

## 8. Next Steps

- [ ] Add characterization tests for abort ordering (ClaudeCode + CodeX)
- [ ] Add characterization tests for runtime change → old query cleanup
- [ ] Add characterization tests for queued input delivery during stream
- [ ] After T196 E2E passes: re-evaluate whether any extraction meets the T186 §2 safety gates
- [ ] Do NOT start extraction without characterization tests passing
