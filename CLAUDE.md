# mindcraft-agent Repository Guide

## Project Identity

- This repository is the main product repo for `mindcraft-agent`.
- `mindcraft-agent` is not a trimmed copy of `mindcraft-electron`.
- Product positioning: a lightweight multi-agent integration platform.
- First-stage core experience:
  - Claude Code + Codex dual-agent support
  - multi-agent selection as a foundation
  - document browsing retained
  - lightweight knowledge Q&A retained
  - future embedding into other clients must remain feasible

## Current Architecture

- `packages/agent/**`
  Shared agent core.
  Contains renderer, electron, preload entrypoints and shared agent UI/runtime.

- `src/**`
  `mindcraft-agent` host application layer.
  Owns shell, navigation, product routes, and host-only pages.

- `electron/**`
  Desktop runtime host.
  Owns windows, menus, preload wiring, filesystem integration, and packaging behavior.

## Hard Boundaries

- Do not pull full `mindcraft-electron` business features back into `packages/agent`.
- Do not treat `packages/agent` as a dump for host-specific behavior.
- Document browsing is a host capability, not an agent-core protocol concern.
- Lightweight Q&A should live inside the agent workspace experience.
- Do not reintroduce the old complex chat product shape.
- Do not add direct dependency on full-app business APIs such as legacy `/llm/chat` flows for lightweight Q&A.

## Product Rules

- `mindcraft-agent` is a standalone product first.
- `packages/agent` is a shared core that can be reused by `mindcraft-agent` and `mindcraft-electron`.
- If Full and Agent behavior diverge clearly, add explicit shared configuration only then.
- Multi-agent support must stay extensible.
- Prefer moving CodeHub toward a registry model instead of hardcoding only Claude/Codex paths.

## Current Priorities

- `T041`: `mindcraft-agent` host refactor and pruning
- `T045`: stabilize and reuse the shared agent layer
- `T046`: Claude session duplication / handoff issue — **all 5 root causes (A-E) fixed 2026-06-11. See `docs/bugs/claude-session-duplicate-split.md`**
- `T051`: System context tag stripping unified — **6 hardcoded whitelists consolidated into one shared pattern matcher 2026-06-11. See `docs/session-pitfalls.md` Trap 7**

Before major implementation work, read:

- `docs/TODO.md`
- `docs/plan/2026-06-10-mindcraft-agent-refactor.md`

**When investigating any session-related bug (duplicate chats, interrupted conversations, session loss, freeze on restore), read FIRST:**

- `docs/session-pitfalls.md` ← **排查入口，所有会话 bug 必读**
- Then the relevant agent-specific doc:
  - Claude: `docs/bugs/claude-session-duplicate-split.md`
  - Codex: `docs/bugs/codex-conversation-interruption.md`
- Architecture context: `docs/agent-architecture.md` (especially §6 会话管理内部机制)

## Development Guidance

- Prefer small, reversible changes.
- Preserve existing tests unless the behavior is intentionally changed.
- When changing behavior, add or update focused tests first.
- Avoid broad refactors outside the active task boundary.
- Do not silently rename product concepts back to `lite`.
- Keep `CodeHub`, Claude, Codex, and agent-common boundaries explicit.

### Session Bug Investigation Rules

When touching ANY code related to session management (chat creation, binding, scanning, restore, provider switch, abort, done signaling):

1. **Read `docs/session-pitfalls.md` first.** It identifies 5 trap patterns that have bitten us repeatedly.
2. **Check whether your change affects the crash+restore path.** Most of our bugs are in the gap between "normal runtime" and "crash recovery." A mechanism that's correct for normal operation can be deadly after crash.
3. **Trace the full lifecycle** of a chat through your change: create → send → stream → error/abort/completion → save → crash → restore → next send.
4. **Do not assume `onAgentDone` will always fire.** It may not fire on crash. It may fire with empty `cliSessionId` on error.
5. **Do not assume the scan runs after `onAgentDone`.** They are concurrent and can arrive in either order.
6. **When modifying a guard condition** (like `shouldReloadClaudeChatFromDisk`), check both the "normal runtime protection" and "crash recovery" scenarios — they may require opposite behaviors.
7. **Provider switch (`resetAgentRuntime`) affects ALL windows.** If you clear a shared Map, ensure ALL windows can recover, not just the active one.
8. **Claude 和 Codex 之间的共享逻辑必须物理上只有一份代码。** 如果发现两边有重复的函数体（字符串处理、标签剥离、消息过滤等），必须提取到 `agentCommon/utils/helpers.js` 或对应的共享模块。分布式白名单必然漂移——T051 就是 6 处各自维护标签列表，SDK 新增 `<INSTRUCTIONS>` 后全员遗漏。（详见 `docs/session-pitfalls.md` Trap 7 + 修复原则 #7）
9. **SDK 系统上下文标签剥离必须用模式匹配，禁止硬编码白名单。** Claude SDK 的用户消息 JSONL 中会注入多种系统标签（`<system-reminder>`, `<environment_context>`, `<task-notification>`, `<INSTRUCTIONS>` 等），所有剥离逻辑统一委托给 `stripSystemContextTags()`（`agentCommon/utils/helpers.js`）。新增剥离逻辑时只改这一处，不要在任何其他文件添加标签名硬编码检查。

### Pre-Patch Safety Protocol

> **适用于**：任何对 `packages/agent/electron/claudeAgent.js` 或 `codexAgent.js` 的编辑，以及其他超过 500 行的函数/文件。
> 
> **原因**：这两个文件各 3000+ 行，包含深层嵌套的闭包、Promise 链、`for await` 循环。T046 的 5 个根因修复后立即引入了一个 TDZ 回归——补丁越多，越容易踩坑。

**编辑前必须执行（不可跳过）：**

1. **读完整函数上下文**：`Read` 目标函数的完整代码（从 `function` 到闭合的 `}`），不只是 diff 周围几行。T046 TDZ 回归就是因为只看了要改的 if block，没注意到底下还有 `const sender` 声明。

2. **变量声明扫描**：新增的任何变量引用，用 `Grep` 确认其在**当前作用域内的声明位置**。如果是 `const`/`let`，声明必须在所有引用**之前**（不是之后、不是同一行的后面、不是"下面几行"）。

3. **控制流中断检查**：新增的 `continue` / `break` / `return` / `throw`，列出它跳过的所有后续代码，确认其中没有**本次补丁依赖的逻辑**（如消息清理、状态重置、资源释放）。

4. **全局状态影响**：对 `agentSessions` / `cliSessionIds` / `sessionModels` / `codexSessions` 等全局 Map 的任何写操作，评估对**所有窗口、所有 tab** 的影响范围——不能假设"只有当前窗口"。

5. **分支覆盖确认**：本次改动涉及的每个条件分支，是否在开发环境中**有路径能触发**？T046 TDZ 回归仅在 `!cliSessionIds.has(sessionId)` 为 `true` 时触发（首次消息），如果是已有会话的后续消息，永远不会走到这个分支。

**编辑时的硬性约束：**

- **禁止**在已有 block 中间插入代码后，不检查该 block 底部的变量声明（最常见的 TDZ 陷阱）
- **禁止**展开单行 `if (cond) singleStatement` 为多行 `{ ... }` block 并新增变量引用，而不检查该作用域内的声明顺序
- **禁止**在 `for await` / `while` 循环体中添加 `await` 或 `safeSend` 调用，而不确认被引用的变量已在循环体顶部声明
- 如果一个函数连续出现 **≥3 次回归 bug**（见 `docs/session-pitfalls.md` §7.3 回归记录表），**不要继续补丁，考虑重写该函数**

**建议的编辑工作流：**

```
1. Read 完整函数（offset/limit 设大一点，覆盖整个函数）
2. 确认目标编辑区域的完整作用域边界（哪个 { 对应哪个 }）
3. 列出作用域内所有 const/let 声明及其位置
4. 如果新增代码引用了某个变量 → 确认声明在引用之前
5. 如果新增了控制流中断 → 列出跳过的代码，与补丁目标比对
6. 执行编辑
7. Read 编辑后的区域，确认变量引用顺序
```

---

## Verification

Use targeted tests first, then broader verification as needed.

Examples:

```bash
node --test tests/codehub-agent-route-preference.test.mjs
node --test tests/codehub-active-tab-sync.test.mjs
node --test tests/codex-session-routing.test.mjs
```

For broader checks:

```bash
npm run build
```

Run only the tests relevant to the files you changed, then expand if the change touches shared behavior.

## Git And Docs Notes

- `.gitignore` currently ignores:
  - `docs/`
  - `AGENTS.md`
- That means plan/spec/doc changes and this file will not appear in normal `git status`.
- If a doc or `AGENTS.md` must be committed, use `git add -f <path>` or update ignore rules intentionally.

## When Making Decisions

- Prefer "product independent, core shared".
- Prefer host pruning over shared-core over-abstraction.
- Prefer explicit agent capability boundaries over convenience shortcuts.
- Prefer keeping lightweight Q&A simple rather than rebuilding the original full chat system.
- **When Claude and Codex need the same logic, extract it to a shared module.** Never copy-paste a function between the two agent components. The most expensive bugs are the ones where two copies of the same logic drift apart over time (see Trap 7: system tag whitelist gap).
