# `/clear` Command Decision

Date: 2026-06-19

MindCraft does not provide Claude Code or Codex CLI `/clear`.

CLI `/clear` is a single-window UX for starting a fresh session while keeping old transcripts in history. MindCraft already has multi-session UI, so the equivalent user actions are:

- use New Chat to start a fresh session
- use Delete Chat when the old session is no longer needed

Implementation rules:

- Filter `/clear` from ClaudeCode and CodeX slash suggestions, `/commands` output, and remote command merge results.
- If a user manually types `/clear`, show a short message and do nothing else.
- Do not abort the active run, clear `messages`, reset `cliSessionId/filePath`, hide provider JSONL, or write registry tombstones for `/clear`.
- Official provider transcript JSONL remains the history source of truth.
