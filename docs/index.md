# MindCraft Agent Documentation

> Last reviewed: 2026-07-16
>
> This is the documentation entry point for maintainers. It separates stable
> engineering contracts from active work and historical records. Read the
> smallest relevant document first; do not treat an old plan as the current
> source of truth.

## Start Here

| Topic | Read | Purpose |
| --- | --- | --- |
| Project boundaries | [agent-architecture.md](./agent-architecture.md) | Directory ownership, runtime layers, data boundaries, and session identities. |
| Current work | [TODO.md](./TODO.md) | Release status, active work, and deferred follow-ups. |
| Session defects | [session-pitfalls.md](./session-pitfalls.md) | Required first stop for duplicated, interrupted, missing, or stuck sessions. |
| Build and release | [build-and-deploy.md](./build-and-deploy.md) | Development, packaging, release artifacts, and known build-script caveats. |

## Engineering Contracts

| Area | Primary document | Supporting material |
| --- | --- | --- |
| Agent lifecycle | [agent-lifecycle-characterization.md](./agent-lifecycle-characterization.md) | [lifecycle work graph](./plan/2026-07-06-T197-agent-lifecycle-work-graph.md) |
| Token metrics | [token-metrics-contract.md](./token-metrics-contract.md) | [implementation notes](./token-metrics.md) |
| SDK capability boundary | [sdk-feature-gaps.md](./sdk-feature-gaps.md) | Check installed SDK type declarations before adding an API. |
| Provider and settings storage | [STORAGE_ARCHITECTURE_ANALYSIS.md](./STORAGE_ARCHITECTURE_ANALYSIS.md) | [settings pollution guard](./settings-json-pollution.md), [compatibility register](./compatibility-register.md) |
| Cache and hot paths | [cache governance](./plan/2026-07-05-cache-governance-and-local-derived-data.md) | [activation work graph](./plan/2026-07-05-project-session-activation-work-graph.md), [hot-path governance](./plan/2026-07-05-hot-path-governance-and-streaming-render.md) |
| Electron verification | [E2E smoke harness](./plan/2026-07-05-electron-e2e-smoke-harness.md) | [manual release gate](./plan/2026-07-06-post-refactor-release-and-cleanup-queue.md) |

## Operations And Troubleshooting

| Situation | Read |
| --- | --- |
| CodeX turn fails or ends unexpectedly | [codex-turn-failed-diagnostics.md](./codex-turn-failed-diagnostics.md), [codex-chat-proxy.md](./codex-chat-proxy.md) |
| Development window is blank or processes remain | [dev white-screen and zombie process guide](./bugs/dev-white-screen-zombie-process.md) |
| Plugin or skill changes do not appear | [skill/plugin cache invalidation](./skill-plugin-cache-invalidation.md) |
| Markdown viewer issue | [mdViewer issues](./mdViewer-issues.md), [document-link bug notes](./bugs/doc-link-navigation.md) |
| UI performance investigation | [performance audit](./perf-audit-report.md) |
| Architecture review | [architecture health review](./architecture-health-review-2026-06-28.md), [review log](./review.md) |

## Product And Design Notes

| Area | Documents |
| --- | --- |
| Home page | [home-page.md](./home-page.md) |
| Configuration import/export | [T163 import feature](./T163-import-feature.md), [CC Switch export plan](./plan-export-cc-switch.md) |
| Session and interaction design | [design/](./design/), [session instruction cache analysis](./session-instruction-cache-analysis.md) |

## Working Records

These records are retained for traceability. They are not authoritative unless
an active task or contract links to them.

| Location | Contents |
| --- | --- |
| [plan/](./plan/) | Dated implementation plans, work graphs, handoffs, and completed investigations. |
| [bugs/](./bugs/) | Reproductions and postmortems. |

## Documentation Rules

- Stable rules belong in a contract or architecture document, not in a dated plan.
- Keep only active work in [TODO.md](./TODO.md); retain completed detail only in its dated plan when it remains useful as technical context.
- New plans must state scope, owner/source of truth, exit criteria, and status.
- MindCraft-owned data must never be documented as writable under `.claude`, `.codex`, or provider transcript directories.
- Local, private, temporary, and marketing material belongs in `docs/local/`, `docs/private/`, `docs/tmp/`, or `docs/marketing/`; these paths are ignored.
