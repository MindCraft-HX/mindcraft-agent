# 2026-06-18 Performance Acceptance Checklist

> Scope: UI responsiveness fixes from `docs/perf-audit-report.md`.
> Goal: confirm optimizations did not break chat, history, mentions, slash commands, diff display, or project indicators.

## Preconditions

- Run in dev or packaged app with an existing userData profile.
- Prepare at least one Claude project with a long JSONL history, preferably more than 200 raw transcript lines.
- Prepare at least one CodeX project with git changes and at least one untracked text file.
- Keep DevTools Console open if possible; note any renderer or main-process errors.

## Must Pass

### 1. Claude Long History

1. Open ClaudeCode.
2. Switch to a session with long history.
3. Confirm the latest messages render quickly and the window remains responsive.
4. Scroll to the top of the message list to load older history.
5. Repeat older-history loading at least twice.

Expected:
- Initial render shows recent messages.
- Older messages prepend in correct order.
- No duplicate page, obvious gap, or permanently blank message area.
- The app does not freeze while loading history.

### 2. CodeX Long History

1. Open CodeX.
2. Switch to a session with long history and tool/file-change messages.
3. Confirm the latest messages render quickly and the window remains responsive.
4. Scroll to the top of the message list to load older history.
5. Repeat older-history loading at least twice.

Expected:
- Initial render shows recent messages.
- Older messages prepend in correct order.
- Tool cards and file-change cards still render.
- The app does not freeze while loading history.

### 3. Claude Running Conversation

1. Start a normal Claude message.
2. While streaming, watch auto-scroll and ProjectTabs indicator.
3. Trigger a tool permission or AskUserQuestion flow if available.
4. Respond to the permission/question.

Expected:
- Streaming text remains visible and auto-scroll does not jitter heavily.
- Project tab shows running/pending state correctly.
- Permission/question UI still appears and clears after response.
- Final done notification still works.

### 4. CodeX `/diff` And `/review`

1. In a git project with changed files, type `/diff`.
2. Confirm a "fetching diff" message appears.
3. Confirm diff output appears.
4. Type `/review` with no custom instruction.

Expected:
- The window remains responsive while git runs.
- Diff output has no ANSI color escape noise.
- Untracked text files are included when present.
- `/review` still sends a review prompt with diff context.

### 5. File Mentions

Run in both ClaudeCode and CodeX.

1. Type `@` and then quickly type a few characters.
2. Confirm suggestions appear.
3. Select a file.
4. Select a directory and drill into it.
5. Toggle flat mention mode if available and repeat.

Expected:
- Suggestions may appear after a short delay, but input remains responsive.
- File insertion is correct.
- Directory drill-down still refreshes immediately.
- Leaving mention mode clears suggestions.

### 6. Slash Commands

1. In ClaudeCode, type `/`.
2. Confirm slash popup appears with model/effort/thinking state.
3. Change effort or thinking from slash UI if available.
4. Type `/` again within 30 seconds.

Expected:
- Popup opens normally.
- Cached model state does not require repeated IPC but still reflects changes made inside the slash UI.
- Slash command selection still works.

### 7. Tool Diff Cards

1. In CodeX, run a file edit or apply_patch that creates a tool diff card.
2. Expand/collapse the card.
3. Load a restored session that contains file_change/apply_patch messages.

Expected:
- Diff lines render.
- Expand/collapse still works.
- Restored file_change/apply_patch cards still show paths and diffs.

### 8. Project Tabs And CodeHub Summary

Run in both ClaudeCode and CodeX.

1. Start one session in a project.
2. Start or switch to another project/session if available.
3. Confirm ProjectTabs running badge/dot state.
4. Trigger pending state if possible.
5. Complete/abort the run.
6. Switch to CodeHub and inspect project/session indicators.

Expected:
- Running count is correct.
- Pending dot appears only when waiting for user action.
- Done notification remains visible until cleared by existing UX.
- CodeHub summary remains consistent with project tabs.

## Performance Expectations

- Opening a long Claude session should no longer scan the entire JSONL just to show the latest 60 raw lines.
- Total number of sessions should not make current-session message rendering freeze.
- `/diff` can take time to finish, but the app window should remain interactive.
- Fast typing after `@` should not queue one IPC per keystroke.

## Known Acceptable Changes

- `claude-read-session-file-range.totalPages` is now approximate. Frontend relies on `hasMore`, not precise `totalPages`.
- History pagination is still based on JSONL raw lines, not final UI message count. This matches previous behavior.
- Mention suggestions can appear about 150ms later during typing.

## Failure Notes To Capture

For any failure, record:

- Agent surface: ClaudeCode or CodeX.
- Action: initial load, load more, streaming, `/diff`, `/review`, `@`, slash popup, tool diff, project tab.
- Whether UI froze, went blank, duplicated messages, skipped messages, or showed stale indicators.
- Console error text if present.
- Approximate JSONL file size and whether the session had very large tool outputs.
