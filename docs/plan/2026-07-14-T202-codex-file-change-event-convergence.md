# T202: CodeX File-Change Event Convergence

> Date: 2026-07-14
> Status: Completed
> Related: T168 event rendering contract; 2026-07-09 streaming diff performance work

## Problem

CodeX has two relevant event shapes:

- SDK `file_change` reports file paths and operations, but does not guarantee a unified diff.
- Official JSONL `patch_apply_end` contains the authoritative `changes[*].unified_diff`.

Recent CodeX sessions can wrap a patch in `custom_tool_call(name=exec)`. The wrapper uses a `call_*` ID while `patch_apply_end` uses an `exec-*` ID. Existing history code only joins equal IDs, drops the authoritative event, and later falls back to a best-effort read of the current Git worktree. This causes empty or unstable diff cards.

## Boundary

Create one provider-domain reducer under `packages/agent/electron/codex/`.

The reducer owns:

- conversion of `patch_apply_end.changes` into the existing canonical `file_change` item shape;
- normalized file-path identity;
- conservative recognition of a pending `apply_patch` or `exec` wrapper that has been superseded by an authoritative patch event.

The reducer does not own Vue messages, persistent state, Git reads, session registry records, or generic tool rendering.

## Work Graph

```text
P0 visible: SDK file_change -> canonical item -> renderer card
P1 rich preview: JSONL patch_apply_end -> reducer -> same canonical item
P2 fallback: async Git preview only when no authoritative diff exists
P3 excluded: session scans, registry writes, history reloads
```

Source of truth is the official CodeX JSONL. The live JSONL reader is scoped to one `sessionId + runId`; it is cleared on terminal, abort, or run replacement. It holds only a byte cursor, an incomplete trailing line, and a bounded seen-ID set. It never writes to the JSONL or to MindCraft persistence.

## Association Rules

1. A `patch_apply_end` is preserved as an independent canonical file-change fact even when no wrapper can be identified.
2. Equal call ID is the preferred wrapper association.
3. For `exec`, association requires all changed normalized paths to be present in that pending call's input and exactly one candidate. Ambiguous or unresolved wrappers are not synthesized into file-change cards.
4. The renderer merges only identical canonical item IDs. It must not scan prior messages by overlapping file paths.
5. Git preview is a lowest-priority fallback and must not overwrite an authoritative unified diff. Its async completion must still belong to the originating run.

## Performance Constraints

- No synchronous Git subprocesses or diff parsing in streaming/render hot paths.
- `ToolWrite` keeps request-idle diff parsing.
- The JSONL supplement uses incremental reads with a run-owned cursor; no repeated whole-session history parse and no new periodic timer.
- Limits: 512 KiB incremental read, 128 retained patch IDs, existing file/diff preview caps.

## Acceptance

- `call_*` wrapper plus `exec-*` patch event restores one rich diff card after reload.
- The same shape receives a rich diff while live without exposing a generic `exec` card.
- Internal `custom_tool_call(name=exec)` wrappers do not render as generic `Tool` cards; they remain available only for patch association.
- Multiple patches in one turn retain separate cards; ambiguous wrappers never receive another patch's diff.
- A late async fallback cannot update a replaced run.
- Escaped patch wrappers restore as one `Edited` card when the matching authoritative patch exists; internal `wait` calls do not create transcript cards.
- Targeted reducer/history/stream tests, `npm test`, `npm run test:contract`, and production build pass.

## Verification

- `npm test`: 393 passed, 9 existing unrelated `skill-plugin-cache-clear` assertion failures.
- `npm run test:contract`: 415 passed.
- `npm run build`: passed.
- Replayed the affected official JSONL: zero patch-shaped `exec` cards and zero `wait` cards remain. Only authoritative `patch_apply_end` events produce file-change cards.
