# Post-refactor release gate and cleanup queue

> Date: 2026-07-06
> Status: active planning
> Related: T174, T185, T186, T187, T188, R10

## 1. Decision

Do not start new feature development while the current refactor cleanup build is being stabilized.

The current line should only accept:

- release smoke fixes
- build/package fixes
- P0/P1 regressions found during manual QA
- documentation updates that clarify the release or follow-up queue

Everything else should be registered as a follow-up task and handled after the packaged build is validated.

## 2. Current State

Completed or effectively closed for this release line:

- T174 provider storage authority moved to SQLite, with legacy projection kept as rollback window.
- T184 SessionIndex Phase 1/2 has landed as the first lightweight CodeHub tab source.
- T187 dead-code cleanup removed orphan host code, unsafe generic window APIs, unused dependencies, and added guard tests.
- T188 Phase 0 created the compatibility register and electron-conf classification.
- IPC registry now rejects new unregistered channels. Historical channels are grandfathered, not ignored.

Current automated gate:

- `npm run test:contract` must pass.
- guard tests for T187 must pass.
- `npm run build` must pass.
- package smoke must cover the main user flows below.

## 3. Package Now Or Wait?

Recommended path:

1. Run a package candidate now if automated tests and build are green.
2. Do not announce it as a stable release until manual smoke passes.
3. If smoke passes, use it as the release candidate.
4. If smoke finds only small release blockers, fix those on the same line.
5. If smoke finds architecture-level issues, stop packaging and move the issue into the cleanup queue.

Waiting without a concrete smoke target usually does not reduce risk. A release candidate package gives a stable artifact to test.

## 4. Manual Smoke Gate

Minimum smoke before release:

- app starts from packaged build without white screen
- Home loads and recent projects are visible
- CodeHub opens with ClaudeCode and CodeX tabs restored correctly
- switching projects and sessions does not create duplicate sessions
- ClaudeCode send/abort/history restore works
- CodeX send/continue/history restore works
- provider add/edit/delete/activate/import/export still works
- document viewer opens local markdown and external links behave as expected
- plugin market and plugin detail routes open
- settings save/repair does not pollute official config files
- restart app and verify active tab/session/provider state is stable

## 5. Follow-up Queue

### T193 Release stabilization window

Owner: release / QA

Scope:

- Keep this code line feature-frozen until the package candidate is validated.
- Track package smoke issues separately from architecture cleanup.
- Only accept blocking fixes into the release line.

Exit:

- packaged build passes the manual smoke gate
- `npm run test:contract` and build are green
- no new duplicate-session, white-screen, or config-pollution regressions

### T194 IPC historical channel retirement plan

Owner: IPC architecture

Scope:

- Do not bulk-rename 223 historical channels.
- Classify historical channels by owner group:
  - provider runtime
  - streaming events
  - settings/config
  - document/search/window host channels
  - plugin/skills
  - legacy compatibility only
- Register new channels in `ipcChannels.js`; historical channels stay grandfathered until touched.
- When touching a module, migrate that module's channel constants and remove retired entries from `tests/ipc-channel-baseline.json`.

Prerequisite:

- T185 Electron E2E smoke exists for preload/main/renderer boot and at least one provider flow.

Exit:

- no unowned historical channels remain
- baseline count decreases monotonically in migration commits
- no IPC rename happens without E2E or explicit compatibility mapping

### T195 T188 compatibility exit Phase 1

Owner: compatibility / storage

Scope:

- Convert eligible legacy write projections into read-only fallback after the release window.
- Start with provider legacy stores only if T174 package smoke passes.
- Do not remove fallback reads in the same phase.

Prerequisite:

- one packaged build has shipped or been validated with SQLite provider authority
- provider recovery path is documented
- package smoke covers provider import/export/activate

Exit:

- legacy provider writes stop where safe
- legacy reads remain for one more version as recovery/backfill
- compatibility register is updated per entry

### T196 Electron E2E smoke harness

Owner: test infrastructure

Scope:

- Implement T185 before any risky IPC/channel/window cleanup.
- Cover packaged or production-like Electron boot, preload bridge, settings sanitizer, session restore, and provider settings.
- Default to no real provider API key.

Exit:

- E2E can catch broken preload/main/renderer wiring
- release smoke checklist has an automated subset

### T197 Agent lifecycle characterization

Owner: agent architecture

Scope:

- Continue T186, but only as characterization first.
- Map stream, abort, done, queued input, session map, and metrics flush.
- Do not split core loops only to reduce file length.

Exit:

- lifecycle work graph exists
- characterization tests cover current behavior
- only then decide whether another extraction phase is justified

### T195 ✅ 已完成 (2026-07-06)

- CodeX sync `_codexProviderStorage.writeProviders` (→ `~/.codex/providers.json`) 已移除。
- Claude `confSet('claudeProviders', ...)` 在 ACTIVATE_PROVIDER 中的写投影已停止。
- 读回退保留 (readCodexProviders, confGet('claudeProviders')) — 作为恢复/回填窗口保留一个版本。
- 兼容性注册表已更新。
- `systemImportIpc.js` 中不再传入 `writeCodexProviders` dep（原本即为死代码，从未被调用）。
- 契约测试 `claude-settings-boundary.test.cjs` 已更新：改用 `assert.doesNotMatch` 确保遗留写不再存在。

### T196 ✅ 已完成 (2026-07-06)

- `tests/e2e/smoke-boot.cjs`: 19/19 测试通过，覆盖 boot / preload bridge / settings sanitizer / session restore / provider CRUD / restart dedup。
- 修复 `this.skip()` crash（node:test `before()` 不兼容）→ 改用 `t.skip(); return;`。
- 修复 `os.tmpdir()` 环境耦合 → 改为 HOME 内隔离路径 `.mindcraft-e2e-empty-scan`。
- `electron/e2eSmokeHook.js`: 主进程 E2E hook，提供 `__e2e_ping` / `__e2e_get_provider_count` 等测试点。

### T197 ✅ 已完成 (2026-07-06)

- 输出 `docs/agent-lifecycle-characterization.md`：完整映射 Claude/CodeX 的 6 个生命周期阶段（session start → stream loop → abort → done → metrics → cleanup）。
- 核心结论：不合并流循环（SDK 接口差异太大）；`emitMetricsViaStore` 模式可提取为共享模块；CodeX `runId` 竞态防护更健壮，Claude 可考虑对齐。

## 6. What Not To Do Next

- Do not start feature work on the current release candidate line.
- Do not bulk-clean all historical IPC channels for cosmetic numbers.
- Do not remove legacy provider fallbacks before one validated SQLite-authority build.
- Do not move session registry to SQLite as part of this cleanup queue.
- Do not treat T188 registration as compatibility exit completion.

