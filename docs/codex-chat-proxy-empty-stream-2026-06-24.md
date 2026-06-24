# Codex Chat Proxy Empty Stream Notes - 2026-06-24

This note records the packaged-app regression where Codex Chat proxy reached the upstream provider but the UI looked like it ignored input.

## Symptoms

Two different failures were seen and should not be treated as one root cause:

1. `502 Bad Gateway` on local `/v1/responses`
   - This means Codex did not reliably reach the active local chat proxy route.
   - The runtime config must prefer the selected provider's `base_url`, token, and `api_format` over stale top-level TOML values.
   - The proxy must be injected through Codex SDK per-process config. Do not write or patch the user's `~/.codex/config.toml`.

2. Upstream HTTP 200 SSE with only empty `delta.content` and `finish_reason: "stop"`
   - Old behavior converted this into `response.completed`, so the UI looked silent.
   - Current behavior requires meaningful text, reasoning, or tool-call output. Empty upstream stop now emits `response.failed` with `error.type = "empty_upstream_response"`.
   - The SSE parser accepts both `data: {...}` and `data:{...}` lines.

## Lifecycle Fix

The local proxy reuse fingerprint must include:

```text
upstreamUrl + apiKey + model + reasoningEffort
```

Reusing only by URL/key can keep stale runtime behavior after switching model or reasoning effort. This is easier to expose in an installed app because the Electron main process lives longer than a dev restart loop.

## Verification

Automated checks run on 2026-06-24:

```bash
node packages/agent/electron/codex/__tests__/transform.test.js
node packages/agent/electron/codex/__tests__/e2e.test.js
node packages/agent/electron/codexRuntimeConfig.test.js
npm test
npm run build
```

Real upstream smoke coverage also passed for `deepseek-v4-pro` with a long system prompt, tools, 12 user-history messages, and `reasoning_effort=high`, producing `response.output_text.delta`.

If empty streams recur, inspect the exact session context and upstream behavior first instead of assuming the base Responses/Chat conversion is globally broken.

## Resume Recovery

A separate failure mode was confirmed on 2026-06-24:

- Fresh Codex threads against the same `deepseek-v4-pro` chat proxy succeeded.
- A specific resumed thread (`019ef43d-15cf-7920-aef7-0970c40c974f`) repeatedly returned HTTP 200 SSE with only empty `delta.content` and `finish_reason: "stop"`.
- This means the base protocol bridge was healthy, but the resumed session context was not recoverable through normal retries.

Current product behavior:

- When Codex emits `empty_upstream_response`, MindCraft detaches that UI chat from the bad `cliSessionId` / transcript path.
- The detach only touches MindCraft userData mappings and panel state persistence.
- It does **not** delete or rewrite the official `~/.codex/sessions/...jsonl` transcript.
- Detached provider identities are remembered in session-registry metadata so stale panel-state sync or provider rescans do not immediately bind the same bad thread again.

This recovery is intentionally narrow:

- It only applies to `empty_upstream_response`.
- Normal failed turns, aborted turns, and successful completed turns keep their existing resume mapping.
