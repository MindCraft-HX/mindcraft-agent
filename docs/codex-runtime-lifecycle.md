# Codex Runtime Lifecycle

> Scope: CodeX runs, transcript consistency, and the external CLI runtime.
> This is the stable contract for work that touches `codexAgent.js`, session
> activation, transcript loading, timeouts, or the Codex executable.

## Runtime Boundary

MindCraft owns UI state, run ownership, diagnostics, and derived history. Codex
owns its thread and transcript. MindCraft must never write sidecar data into
`~/.codex/sessions` or rewrite a provider transcript.

```text
chatKey          MindCraft UI identity
cliSessionId     Codex thread identity
filePath         Codex transcript identity
runId            one in-memory execution attempt for a chatKey
```

The four identifiers are related but are not interchangeable.

## Completion Contract

`turn.completed` is a logical terminal event. It is not proof that the
transport or Codex process has stopped. A run has four distinct milestones:

```text
streaming -> terminal_seen -> transport_closed -> reconciled -> agent_done
```

- `terminal_seen` stops live answer rendering, but keeps the chat send-locked.
- `transport_closed` means the event iterator has ended in the SDK adapter; the
  CLI transport will additionally require stdout close and child-process exit.
- `reconciled` means the current transcript is stable enough for a bounded,
  read-only final history check.
- Only `agent_done` releases run ownership, clears `_awaitingDone`, and allows
  queued input to start.

No code may set `streamClosed` merely because it has sent a logical terminal
event or an `AGENT_DONE` IPC message.

In development, a renderer HMR reload may occur while the main-owned CLI run
continues. After restoring panel chats, the new renderer reads one lightweight
active-run snapshot from main and restores `thinking/_awaitingDone` only for
matching `chatKey` values. This snapshot never scans transcripts, writes
registry state, or substitutes for the authoritative completion events.

## Ownership, Cancellation, And Timeouts

- A `chatKey` has at most one owned active `runId`.
- Every delayed callback, catch, finally, poller, and preview task verifies
  `runId` before changing session state or sending terminal signals.
- Abort targets only the child process owned by the active MindCraft run. It
  must not kill processes by executable name.
- A watchdog records provider event activity and, once available, transcript
  growth. Logical terminal events do not disable the watchdog before transport
  closure.
- A terminal run that does not close within its bounded timeout is failed or
  aborted exactly once. It must never silently unlock a second writer.

## Transcript Authority

Live UI consumes normalized transport events. The Codex JSONL transcript is the
durable authority for history and final recovery, not a substitute for missing
live events while a run is active. After transport closure, a bounded,
read-only reconciliation may fill gaps using provider item/event identity. It
must not duplicate already-rendered messages and must not block completion
forever.

Codex may emit `thread.started` with a different thread id after MindCraft asks
to resume an existing thread. Treat this as a provider rollover within the same
MindCraft chat, not as a new external session. The main process must replace the
in-memory `chatKey -> cliSessionId` mapping and persist the new provider binding
before a background transcript scan can discover it. The completion boundary
persists the binding again with the resolved `filePath`; renderer scan results
must never infer ownership from an id prefix or transcript filename.

For resumed turns with images, place the `resume <thread-id>` subcommand before
all `--image` arguments. The top-level CLI image option is variadic; putting it
first makes it consume the words `resume` and the thread id as image paths,
silently starting a new thread instead of resuming the existing one.

Codex transcripts can contain multiple assistant messages for one turn. History
restoration uses provider `turn_id` and `phase`: a completed turn keeps its
`final_answer` and hides `commentary`; an interrupted turn without a final answer
keeps only its last commentary message. Live rendering remains event-driven.

## External CLI Direction

The external CLI migration is complete. `CodexCliTransport` accepts an
executable path and probes public CLI capabilities. It must not import
`@openai/codex-sdk`, locate npm package internals, or assume npm is the install
channel. npm remains one installer/update mechanism only.

The configured external CLI is the sole Codex runtime dependency. Version
governance and the SDK/app-server assessment live in
`docs/provider-runtime-dependency-policy.md`.

## Required Regression Cases

- logical terminal event arrives before transport closure;
- transcript continues growing after a logical terminal event;
- old run cleanup cannot mutate a replacement run;
- abort and timeout emit exactly one terminal completion;
- queued input starts only after the previous run closes;
- an interrupted historical transcript remains readable and resumable.
- a resumed run that rolls onto a new thread id remains bound to one `chatKey`.
- a resumed turn with images does not create a replacement thread.
