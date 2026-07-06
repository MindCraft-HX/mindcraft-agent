# T194 IPC Historical Channel Classification

> Date: 2026-07-06
> Status: Phase 1 — classification
> Baseline: 225 total, 2 registered, 223 grandfathered

## Summary

| Group | Count | Migration Priority |
|-------|-------|--------------------|
| 1. Provider runtime — ClaudeCode | 36 | P1 (touch on next refactor) |
| 2. Provider runtime — CodeX | 36 | P1 (touch on next refactor) |
| 3. Streaming events | 7 | P2 (tied to agent lifecycle) |
| 4. Settings / Config | 37 | P2 (touch on config refactor) |
| 5. Session management | 21 | P1 (touch on session refactor) |
| 6. Document / Search / Window host | 40 | P3 (host channels, low churn) |
| 7. Plugin / Skills | 23 | P2 (touch on plugin refactor) |
| 8. System / Cross-cutting | 23 | P3 (update/chat/home, low churn) |
| **Total** | **223** | |

> Verified by `scripts/classify-channels.cjs` — 223/223 channels classified, 0 missing.

## Group 1: Provider Runtime — ClaudeCode (36)

Agent stream lifecycle, CLI interaction, tool execution, slash commands.

```
claude-agent-abort
claude-agent-ask-question
claude-agent-done
claude-agent-early-cli-session
claude-agent-message
claude-agent-metrics
claude-agent-permission
claude-agent-plan-review
claude-agent-query
claude-agent-query-metrics
claude-agent-update-runmode
claude-ask-question-response
claude-permission-response
claude-plan-review-response
claude-chat
claude-chat-continue
claude-check-environment
claude-check-latest-version
claude-install-claude-code
claude-validate-key
claude-browse-executable
claude-list-files
claude-list-slash-commands
claude-select-directory
claude-write-clipboard
claude-get-file-stat
claude-get-executable-path
claude-set-executable-path
claude-get-language
claude-set-language
claude-get-last-compact-summary
claude-get-auto-compact-window
claude-set-auto-compact-window
claude-get-effort-level
claude-get-skip-webfetch-preflight
claude-set-skip-webfetch-preflight
```

Main source modules:
- `packages/agent/electron/claudeAgent.js` — stream/abort/done/metrics/permission
- `packages/agent/electron/claude/claudeEnvironment.js` — check/install/validate
- `packages/agent/electron/claude/claudeConfig.js` — executable/language/compact

## Group 2: Provider Runtime — CodeX (36)

```
codex-agent-abort
codex-agent-done
codex-agent-message
codex-agent-metrics
codex-agent-query
codex-agent-query-metrics
codex-chat
codex-check-environment
codex-check-latest-version
codex-install-codex
codex-validate-key
codex-run-git-diff
codex-select-directory
codex-get-api-format
codex-set-api-format
codex-get-base-url
codex-set-base-url
codex-get-default-network-access
codex-set-default-network-access
codex-get-default-web-search
codex-set-default-web-search
codex-get-last-cwd
codex-get-model
codex-set-model
codex-get-providers
codex-set-providers
codex-get-reasoning-effort
codex-list-available-models
codex-get-project-settings
codex-set-project-settings
codex-read-config-toml
codex-write-config-toml
codex-write-auth-json
codex-repair-config-toml
codex-import-legacy-config
codex-list-slash-commands
```

Main source modules:
- `packages/agent/electron/codexAgent.js` — stream/abort/done/metrics
- `packages/agent/electron/codex/codexEnvironment.js` — check/install/validate
- `packages/agent/electron/codex/codexConfig.js` — config TOML read/write

## Group 3: Streaming Events (7)

Live stream events pushed during agent turn execution.

```
claude-stream-chunk
claude-stream-thinking
claude-stream-tool-input
claude-stream-tool-start
codex-stream-chunk
codex-stream-thinking
codex-stream-tool-delta
```

Main source:
- `claudeAgent.js` / `codexAgent.js` — webContents.send during stream

## Group 4: Settings / Config (52)

Provider settings, model management, memory, import/repair.

**ClaudeCode config (24):**
```
claude-activate-provider
claude-add-model
claude-remove-model
claude-get-base-url
claude-set-base-url
claude-get-model
claude-set-model
claude-get-models
claude-set-models
claude-get-providers
claude-set-providers
claude-get-selected-tier
claude-set-selected-tier
claude-get-tier-models
claude-set-tier-models
claude-get-permission-policy
claude-set-permission-policy
claude-get-thinking-enabled
claude-set-thinking-enabled
claude-patch-settings-json
claude-read-settings-json
claude-repair-settings-json
claude-import-legacy-config
claude-memory-get-inject-mode
claude-memory-list
claude-memory-read
claude-memory-set-inject-mode
claude-memory-write
```

**CodeX config (9):**
```
codex-get-api-format
codex-set-api-format
codex-get-base-url
codex-set-base-url
codex-get-model
codex-set-model
codex-get-providers
codex-set-providers
codex-get-reasoning-effort
```

**Cross-agent config (8):**
```
load-locale
save-locale
load-theme
save-theme
get-app-version
get-diagnostics-enabled
set-diagnostics-enabled
get-login-item-settings
set-login-item-settings
```

## Group 5: Session Management (20)

Session scan, register, read/write meta, panel state persistence.

**ClaudeCode sessions (9):**
```
claude-delete-session-file
claude-read-session-file-range
claude-read-session-meta
claude-write-session-meta
claude-register-cli-sessions
claude-scan-cli-sessions
claude-scanner-projects-sessions
claude-load-code-panel-state
claude-save-code-panel-state
claude-save-code-panel-state-sync
```

**CodeX sessions (11):**
```
codex-delete-session-file
codex-read-session-file-range
codex-register-cli-sessions
codex-unregister-cli-session
codex-list-sessions-by-cwd
codex-load-code-panel-state
codex-save-code-panel-state
codex-save-code-panel-state-sync
claude-list-local-skills
codex-list-local-skills
claude-list-slash-commands
codex-skills-get-catalog
```

## Group 6: Document / Search / Window Host (30)

Host-side channels for document viewer, local search, window management.

**Document (6):**
```
md-content
md-viewer-ready
open-md-viewer
open-md-win
resolve-document-candidate
open-document-candidate
```

**Local search (6):**
```
local-search-capability
local-search-diagnose
local-search-files
local-search-text
search-page
close-search-page
stop-search
found-in-page
```

**Window management (11):**
```
open-external-window
open-file-dialog
open-file-with-default
open-folder
open-system-settings
open-tab-by-name
openEmail
window-close
window-is-maximized
window-maximize
window-minimize
window-performance-state
flash-taskbar
```

**File I/O (7):**
```
read-file-by-path
select-and-read-file
open-file-dialog
copy-file-sync
exists-file-sync
read-file-sync
write-file-sync
mkdir-sync
rmdir-sync
read-dir-Sync
rename-file-sync
unlink-file-sync
unCompress-zip-file
exec-cmd
```

## Group 7: Plugin / Skills (22)

**Plugin data + lifecycle (13):**
```
plugin-delete-data
plugin-get-data
plugin-get-installed
plugin-read-asset
plugin-read-entry
plugin-registry-changed
plugin-set-data
plugin-marketplace-disable
plugin-marketplace-enable
plugin-marketplace-install
plugin-marketplace-listing
plugin-marketplace-uninstall
plugins-disable
plugins-enable
plugins-get-state
plugins-install
plugins-save-state
plugins-uninstall
```

**Skills (4):**
```
skills-get-catalog
skills-get-state
skills-install
skills-market-install
skills-uninstall
```

## Group 8: System / Cross-cutting (19)

**Agent-level events/session (5):**
```
agent:event
agent-build-session-instruction-prompt
agent-set-session-title
agent-open-session-attachment-dialog
agent-resolve-session-attachments
```

**App update (4):**
```
app-update-status
get-app-update-status
get-update-info-data
client-update-info-data
```

**Home page (3):**
```
home-get-recent-project
home-get-today-stats
home-get-token-trend
```

**Simple chat (6):**
```
chat-delete-session
chat-generate-title
chat-get-session
chat-list-sessions
chat-save-session
chat-web-search
```

**Legacy standalone windows (2 — T188 gated):**
```
open-claude-win
open-codex-win
```

**Task logging (1):**
```
append-task-log
```

---

## Migration Strategy (per T194 plan)

1. **Do not bulk-rename.** Each group migrates when its owning module is touched.
2. **T188-gated channels** (open-claude-win, open-codex-win) stay in baseline until T188 exit completes.
3. **File sync channels** (copy-file-sync, exists-file-sync, etc.) are candidates for removal if verified dead — check via T187 inventory before touching.
4. **Precondition: T196 E2E smoke** must exist before any channel constant migration.

## Next Steps

- [ ] T196: E2E smoke harness (prerequisite for any migration)
- [ ] Verify dead channels in Group 6 (file sync) via T187 inventory cross-reference
- [ ] On next refactor of a Group 1/2/5 module → migrate its channels to registry, remove from baseline
