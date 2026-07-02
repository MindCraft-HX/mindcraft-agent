# Session / Tab 切换性能专题

> 日期：2026-07-02
> 状态：方案完成，待执行
> 范围：ClaudeCode / CodeX / CodeHub renderer 切换路径
> 背景：T169 已改善输入框热路径，但 dev 模式下点 session、切 CodeHub tab、`Ctrl+Tab` 环绕仍明显卡顿。现阶段应聚焦切换链路，不再继续扩展输入框优化。

## 1. 结论

当前卡顿不在 textarea 每键输入路径，主要集中在切换时触发的重链路：

1. CodeHub `activateTab()` 每次非初始化激活 tab 后都会 `panel.refreshSessions?.()`，把“切 tab”变成“切项目 + 扫 session 文件”。
2. provider `switchProject()` 自身也会触发项目 session 刷新，CodeHub 再调 `refreshSessions()` 会造成重复扫描窗口。
3. 点 session 会触发 `switchChat()`，并联或串联执行 metrics 查询、JSONL history hydrate、draft/instruction 加载、scroll/focus/layout。
4. dev 模式 console 输出过多，CodeHub tab debug 默认在 dev 启用，且多处 `{ force: true }` 让切 tab 时必然构建 snapshot、`JSON.stringify`、输出对象。
5. 当前切 session 的 scroll 策略偏粗：多数路径直接滚到底，没有记住用户在该 session 内的上次阅读位置。

本专题不删除已有防御逻辑，而是把“有效但过度触发”的操作改成显式、延迟、去重、可观测。

## 2. 硬边界

- 不改 provider runtime、agent event、abort/done、session identity、history hydrate 语义。
- 不改变官方 JSONL 读取/写入边界。
- 不做 CodeHub SessionIndex 正式重构。
- 不删除 `codehubHasNotification` provider 直推链路。
- 不删除 `refreshProjectSessionsInBackground()` 内部防重复、防竞态、防恢复丢失逻辑。
- 不改 CodeX 初始化期必须等待 active project session 扫描的语义。
- 不改 `loadMoreHistory()` 和 `trimMessages()` 的滚动高度补偿。
- 不把 scroll 高频状态写入 session registry。registry 可存会话级 MindCraft 数据，但 scroll 属于高频 UI 视图状态，第一轮只做内存态。

## 3. 防御逻辑判定

### 3.1 必须保留

#### `refreshProjectSessionsInBackground()`

ClaudeCode / CodeX 的项目扫描里有多条防御：

- pending 新会话未绑定 `cliSessionId/filePath` 时跳过新文件发现，避免重复 session。
- 用 `filePath`、`cliSessionId`、`chatKey` 多重匹配已有 chat。
- fileSize 变化后更新 metadata，并按需重置 `_messagesLoaded`。
- 扫描后注册 provider session map，保证 resume 映射。
- 切换期间检测 active project 是否变化，避免旧异步结果覆盖新项目。

这些逻辑是防重复、恢复和 resume 的安全边界，不能删。

#### CodeX 初始化 active project 扫描

CodeX 初始化中有注释：先 await 活跃项目的 session 扫描，确保 `resumeThread` 映射就绪再允许用户交互。该路径不进入本专题优化。

#### notification 直推

`codehubHasNotification` 的 provider 直推是为了解决 CodeHub keep-alive 失活后 watcher 暂停导致侧边栏通知丢失。继续保留。

#### scroll 高度补偿

`loadMoreHistory()` 和 `trimMessages()` 当前会记录 `oldScrollHeight/oldScrollTop`，加载旧历史或裁剪窗口后补偿位置。这是防“加载更多后跳动”的逻辑，不删除。

### 3.2 应收口触发条件

#### CodeHub tab 激活后的刷新

`codeHub/index.vue` 当前在 `doSwitchProject()` 中：

```js
panel.switchProject(tab.projectId, preferredChat)
if (!_tabActivationInit) {
  nextTick(() => panel.refreshSessions?.())
}
```

这个刷新本身有价值，但不应在每次 tab 激活时同步排队执行。尤其 `Ctrl+Tab` 连续切换或从最后一个环绕到第一个时，会放大扫描、console 和响应式更新。

应改为：

- 初始化恢复：保持现有保护，不额外刷新。
- 用户显式刷新：立即执行。
- tab 激活：只调度延迟刷新，并带 cooldown/stale 判断。
- 快速连续切 tab：取消上一轮未执行的 scheduled refresh，只保留最后一个目标。
- provider 自己已经刚刷新过同一 project 时，CodeHub 不再重复刷新。

#### dev console

CodeHub tab debug 默认跟随 `import.meta.env.DEV`，这对定位 tab 恢复问题有价值，但对日常 dev 性能和日志可读性有明显伤害。应改为显式开启。

## 4. Scroll 方案

### 4.1 不保存 transcript 绝对位置

用户提到的几十 MB session 是关键约束。不要试图保存“官方 JSONL 绝对 offset / 第 N 条 transcript / 全量消息位置”，这会把 scroll 状态和分页、裁剪、JSONL 解析耦合起来。

当前 renderer 只加载最近一页或一个滑动窗口，scroll 恢复应限定在这个已加载窗口内。

### 4.2 第一轮保存内存态视图位置

新增共享 composable，例如：

```text
packages/agent/src/components/agentCommon/composables/useChatScrollState.js
```

只在 renderer 内存中维护：

```js
{
  scrollTop,
  scrollHeight,
  clientHeight,
  atBottom,
  updatedAt,
}
```

key 使用稳定 UI 会话键：

- ClaudeCode：优先 `getClaudeChatKey(chat)`，fallback `chat.id`
- CodeX：优先 `chat.sessionId` / MindCraft chatKey，fallback `chat.id`
- key 外层带 agentType，避免跨 provider 冲突

切换流程：

1. `switchChat(nextId)` 开始前，保存当前 active chat 的 scroll state。
2. 激活新 chat 后，等待 DOM 更新。
3. 若新 chat 上次 `atBottom=true` 或没有记录：滚到底。
4. 若新 chat 上次 `atBottom=false`：恢复 `scrollTop`。
5. 如果新 chat 发生 history hydrate，使用 `scrollHeight` 差值补偿，而不是按 transcript 绝对位置恢复。

### 4.3 不写 session registry

理由：

- scroll 是高频 UI 状态，滚动时频繁变化，不应引入持久化写入。
- session registry 已用于 title/instruction/draft/provider mapping 等会话级数据；scroll 位置写进去会增加状态来源复杂度。
- 第一轮目标是切换体验，不是跨重启恢复阅读位置。

后续若确实需要跨重启恢复，应单独设计低频 checkpoint，例如只在 `switchChat` / `beforeunload` 保存，并且明确只恢复已加载窗口内的位置。

## 5. 执行顺序

### Phase 0：切换链路探针

扩展现有 `rendererPerfProbe`，但默认不在 dev 开启。只通过显式 flag 启用：

- `window.__MCPF_PERF__ = true`
- 或 `localStorage.setItem('mcpf_perf', '1')`

新增计时点：

- `codehub.activateTab`
- `codehub.doSwitchProject`
- `codehub.scheduleRefreshSessions`
- `provider.switchProject`
- `provider.refreshProjectSessionsInBackground`
- `provider.handleRefreshSessions`
- `provider.switchChat`
- `provider.ensureChatMessagesLoaded`
- `provider.refreshMetricsForChat`
- `provider.sessionDraft.loadDraftForChat`
- `provider.refreshActiveSessionInstructionState`
- `provider.scrollRestore`

输出要求：

- 聚合输出，不刷屏。
- 不输出消息内容、完整路径、API key。
- 输出 project/chat/session 数量、耗时、是否命中 cooldown/stale。

### Phase 1：dev console 收口

目标：默认 dev 控制台安静，调试时显式开启。

改动：

- CodeHub `CODEHUB_TAB_DEBUG` 从 `import.meta.env?.DEV` 改为显式 flag。
- `debugCodeHubTabs()` 不在默认 dev 输出。
- ClaudeCode / CodeX renderer 中无条件 `console.log` 改为 debug helper 或删除。
- `SessionInstructionDialog` 的 open/save 日志也改为 debug flag。
- 保留 `console.warn/error`，保留主进程必要诊断；主进程大量 debug 另开专题处理。

建议统一 helper：

```text
packages/agent/src/components/agentCommon/utils/rendererDebug.mjs
```

支持 namespace：

- `codehub-tabs`
- `session-instruction`
- `metrics`
- `session-refresh`

### Phase 2：CodeHub tab 激活刷新去重

新增 provider 暴露方法或内部 adapter：

```js
refreshSessions({ reason, force, silent, ifStaleMs, deferMs })
```

策略：

- 手动刷新按钮：`force=true`，立即刷新。
- 初始化必要刷新：保持现有路径。
- CodeHub tab 激活：`force=false, silent=true, ifStaleMs=15000, deferMs=300~800`。
- 快速切换：取消上一次 scheduled refresh。
- 已有刷新进行中：不重复进入。
- 同一 project 最近刷新过：跳过。

注意：

- 不改 `refreshProjectSessionsInBackground()` 内部逻辑。
- 不因跳过刷新而影响 active tab 切换，UI active 状态必须即时更新。
- `Ctrl+Tab` 环绕到第一个 tab 时，不等待 refresh 完成。

### Phase 3：session 切换 scroll state

新增 `useChatScrollState`，ClaudeCode / CodeX 共用。

接入点：

- `switchChat()` 开头保存旧 active chat 的 scroll state。
- `ensureChatMessagesLoaded().finally(...)` 后恢复新 active chat 的 scroll state。
- 无需 hydrate 的路径在 `requestAnimationFrame` 后恢复。
- 新消息到达仍走现有 `scrollOrBump`，不破坏“用户上翻不强拉”语义。

恢复规则：

- 没记录：滚到底。
- 有记录且 `atBottom=true`：滚到底。
- 有记录且 `atBottom=false`：恢复 `scrollTop`，并 clamp 到当前可滚动范围。
- history hydrate 后如果 `scrollHeight` 变化，按 delta 修正。

不做：

- 不保存到 session registry。
- 不计算官方 JSONL 绝对位置。
- 不改变 `loadMoreHistory()` 的顶部加载逻辑。

### Phase 4：快捷键切 tab验收

重点验证 `Ctrl+Tab`：

- 3 个以上 CodeHub tab，从最后一个继续 `Ctrl+Tab` 立即激活第一个。
- 快速连续按 `Ctrl+Tab` 不堆积多次 session scan。
- active tab UI 即时变化，session scan 延迟执行。
- `Ctrl+Shift+Tab` 从第一个回最后一个同理。

## 6. 自动测试建议

新增或补充：

- `tests/codehub-tab-activation-refresh.test.mjs`
  - tab 激活只调度一次 refresh。
  - 快速多次激活只保留最后一次 scheduled refresh。
  - force refresh 不受 cooldown 影响。
- `tests/chat-scroll-state.test.mjs`
  - atBottom=true 恢复到底部。
  - atBottom=false 恢复 scrollTop。
  - scrollTop 超出当前范围时 clamp。
  - history hydrate 后按 scrollHeight delta 补偿。
- `tests/codehub-shortcut-navigation.test.mjs`
  - 最后一个 next 回第一个。
  - 第一个 prev 回最后一个。
  - active tab 切换不等待 refresh promise。

回归测试：

- `node tests/claude-runtime-state.test.mjs`
- `node tests/codex-runtime-state.test.mjs`
- `node --test packages/agent/electron/sessionRegistry.test.js`
- `node --test tests/codehub-tab-order.test.mjs tests/codehub-agent-picker-prompt.test.mjs`
- `npm run build`

## 7. 人工验收

1. dev 控制台默认安静，切 CodeHub tab 不刷 `[codehub-tabs]`。
2. 点 session 立即切换可见内容，不被 metrics/session scan 明显阻塞。
3. CodeHub `Ctrl+Tab` 从最后一个到第一个无数秒卡顿。
4. 快速连续 `Ctrl+Tab` 不堆积扫描；停下后最多刷新最后激活的项目。
5. 切 session 后：
   - 上次在底部的 session 自动到底。
   - 上次读到中间的 session 回到中间位置。
   - 几十 MB session 不做全量定位，不尝试恢复未加载 transcript 区域。
6. 切回有新消息的 session，现有 new message count / scroll to bottom 行为不回归。
7. 手动刷新 session 仍能立即扫描，新增/删除/重命名/恢复不丢。

## 8. 回滚点

每个 phase 单独提交：

1. 探针可直接 revert。
2. console 收口如影响排障，只 revert Phase 1 或打开 debug flag。
3. refresh 去重如导致 session 列表不更新，只 revert Phase 2。
4. scroll state 如导致位置错乱，只 revert Phase 3。

不要把 refresh 去重和 scroll state 合在一个提交里。
