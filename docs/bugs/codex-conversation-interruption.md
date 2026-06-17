# Codex 对话中断专题

## 结论先行

这不是单一问题，而是至少两条链路叠加：

1. 前端切换项目 / 会话时，运行中的 Codex 会话曾被错误地从 JSONL 历史回填，覆盖内存中的流式消息，表现为“像断流”。
2. 主进程允许同一 `sessionId` 在短时间内重复进入 `codex-agent-query`，导致同一个会话并发存在多个 run；旧 run 的 `cleanup`、`done`、`thinking=false` metrics 可能误作用到新 run，表现为真正的中断、提前收尾或状态错乱。

当前更接近真实根因的是第 2 条。用户提供的关键日志：

```text
[codex] cleanup: sessionId=019e96ff-ded4-7023-a0d6-03d72cc2e421 resultReceived=true doneSent=true turnTimedOut=false pendingItems=0
[codex] cleanup: sessionId=019e96ff-ded4-7023-a0d6-03d72cc2e421 resultReceived=true doneSent=true turnTimedOut=false pendingItems=0
[codex] cleanup: sessionId=019e96ff-ded4-7023-a0d6-03d72cc2e421 resultReceived=false doneSent=false turnTimedOut=false pendingItems=0
```

同一 `sessionId` 出现多次 cleanup，且最后一次 `resultReceived=false doneSent=false`，已经超出“UI 假断流”的解释范围。

## 影响范围

- 渲染层入口：`packages/agent/src/components/codeX/index.vue`
- 主进程入口：`packages/agent/electron/codexAgent.js`
- 会话流式状态：`packages/agent/src/components/codeX/composables/useCodexAgentStream.js`
- 会话生命周期工具：`packages/agent/src/components/codeX/utils/sessionLifecycle.mjs`

注意：Agent 代码已经抽离到 `packages/agent/**`。如果还在旧路径下修 `src/components/codeX/**` 或 `electron/mainModules/codexAgent.js`，大概率不会命中当前运行版本。

## 现象归类

### A. 伪中断

用户切 tab、切项目或切会话后，当前对话看起来停住；但主进程实际上仍在继续跑，done 后也可能恢复。

这一类主要由“运行中会话被磁盘历史覆盖”引起。

### B. 真中断

同一句输入重复出现、同一 session 出现多次 cleanup、`thinking` 提前被清掉、done 先于真实输出到达，或后台会话突然结束。

这一类主要由“同一 `sessionId` 并发启动多个 run”引起。

## 已确认的两轮根因

### 第一轮：历史回填覆盖流式状态

在 `codeX/index.vue` 里，以下路径会对当前会话重新加载磁盘历史：

- `switchChat()`
- `refreshProjectSessionsInBackground()`

此前它们没有避开运行中的会话，因此会在切换期间把内存里的新消息覆盖掉。

已经加上的规则：

- `isCodexTurnLocked(tab)`
- `shouldHydrateHistoryFromDisk(tab)`

当前策略：

- `thinking === true` 或 `_awaitingDone === true` 时，不允许从磁盘重载历史。

相关测试：

- `tests/codex-session-lifecycle.test.mjs`
- `tests/codex-session-routing.test.mjs`

### 第二轮：同一 sessionId 多 run 竞态

`packages/agent/electron/codexAgent.js` 之前的行为：

1. 进入 `codex-agent-query`
2. 若 `codexSessions.get(sessionId)` 为空，则继续
3. 异步执行 `startThread()` / `resumeThread()`
4. 之后才 `codexSessions.set(sessionId, ...)`

问题在于第 2 步到第 4 步之间存在竞态窗口。若同一 `sessionId` 在这段时间再次收到 query：

- 第二次调用也会认为当前没有运行中的 session
- 两次 run 会并发存在
- 旧 run 的 `for await events`
  - 还能继续转发事件
  - 还能触发 `triggerDone`
  - 还能在 `finally` 中清理 `codexSessions`
  - 还能发送 `thinking=false` metrics

这会直接打断新 run 的状态。

## 当前修复

修复位置：

- `packages/agent/electron/codexAgent.js`

新增概念：

- `runId`
- `nextCodexSessionRunId()`
- `canStartCodexSessionRun(existing)`
- `deleteCodexSessionRunIfCurrent(sessions, sessionId, runId)`

修复后的策略：

1. `codex-agent-query` 一进入就为当前 `sessionId` 预注册一个占位 run，而不是等 `startThread()` 之后才登记。
2. 如果 `existing` 还没 `doneSent/resultReceived`，直接忽略重复 query，不再并发重开。
3. 已确认加上 run ownership 检查的动作包括：
   - 事件转发
   - `triggerDone()`
   - poller 清理
   - `cleanup`
   - fallback `codex-agent-done`
   - fallback `thinking=false` metrics
   - 但 `catch` 中的 `abort/error` 消息发送不在这组已确认保护里，见下文
4. 只有当前 run 才能删掉 `codexSessions[sessionId]`。

新增测试：

- `tests/codex-session-run-ownership.test.cjs`

测试覆盖：

- 旧 run 不能删除新 run
- 当前 run 可以删除自己
- 已完成 run 可以被下一次 query 接替

## 已验证内容

执行过的验证：

```text
node --check packages/agent/electron/codexAgent.js
node tests/codex-session-run-ownership.test.cjs
node --test tests/codex-session-lifecycle.test.mjs tests/codex-session-routing.test.mjs tests/codex-agent-done-reason.test.mjs tests/codex-turn-timeout.test.mjs
npm run build
```

结果：

- 语法检查通过
- 新增 run ownership 测试通过
- Codex 相关回归测试通过
- 构建通过

## 仍未彻底证明的点

当前修复已经堵住已观察到的一轮主竞态，但还不能宣称完全结束。这里把后续问题分成两类：一类是代码上已经能直接看到的缺口；另一类仍然是待复现验证的假设。

### 代码上已能直接看到的缺口

1. `doneSent` 早于旧流真正退出时，`catch` 里的 `abort` / `thinking=false` 仍可能误伤新 run。
   - 当前 `triggerDone()` 会先发 `codex-agent-done`
   - 前端收到 done 后会 flush `_queuedInput`，或用户手动立刻发送下一句
   - 旧 run 若随后因 abort 进入 `catch`，当前代码仍会直接发 `subtype: 'abort'` 和 `thinking: false`
   - 这一段目前没有 run ownership 守卫，因此值得优先补测试和验证
2. 前端是否仍存在某些重复触发 `sendMessage()` 的入口。
   - 已知入口：`Enter`、发送按钮、done 后 `_queuedInput` flush
   - 截图里同一句用户消息重复出现两次，仍需留意是否还有前端双发
3. `codex-agent-abort` 仍然是按 `sessionId` 全局 abort，而不是按 runId abort。
   - 当前语义上这是可接受的，因为 abort 本来就针对“当前会话”
   - 但若未来引入更复杂的后台恢复，这里仍可能需要 run ownership
4. 旧的 “query collision: aborting old and starting new” 分支还保留在代码里。
   - 现在因为前面已有 `duplicate query ignored`，理论上只会在已完成但尚未清理的陈旧状态上命中
   - 可以后续再清理，但目前不是阻塞项

### 仍属推断、需要复现再定性的链路

1. 同一 rollout / JSONL 文件是否会被两个二进制在收尾窗口内争抢。
   - 这可以解释 `resultReceived=false doneSent=false` 的 cleanup 形状
   - 但目前还没有直接证据证明第三条 cleanup 日志一定由这条链路触发
   - 这里更适合作为后续复现时重点观测的假设，而不是现阶段定论

补充（Opus 二次复核）：`resultReceived=false doneSent=false` 可以**排除“被 collision abort 的旧 run”**这个解释。因为 catch 块的 AbortError 分支会把 `resultReceived` 置为 `true`（codexAgent.js 约 1996 行 `resultReceived = true`），被 abort 的旧 run 的 cleanup 形状是 `resultReceived=true doneSent=false`，不是 `false/false`。所以第三条日志只剩两种可能：

- 流**静默结束**（无 turn.completed、无任何异常抛出）——即上面的 rollout 争抢假设的形状
- 抛了**非 abort 异常**——此时前端应能看到“Codex 异常：...”的红色错误消息

由此得到一个便宜的分诊手段：复现时先问用户**有没有看到错误提示**。没有错误提示 + `false/false` cleanup ⇒ 静默结束链路；有错误提示 ⇒ 看具体异常内容定位。

## 建议其他 agent 接手时先做什么

不要先改 UI。先做以下排查：

1. 复现时抓完整日志：
   - `sessionId`
   - 同一时段所有 `cleanup`
   - 是否出现 `duplicate query ignored`
   - 是否出现同一句 user message 被 push 两次
2. 若再次出现中断，优先判断属于哪一类：
   - 只是 UI 看起来停住：先查历史回填链
   - 出现多 cleanup / 提前 done / thinking=false：先查 run ownership 链
3. 如果要继续补测试，优先补主进程竞态测试，而不是组件渲染测试。

## 建议后续补充的日志

如果还需要继续追：

- 在前端 `sendMessage()` 前后打印：
  - `sessionId`
  - `activeProjectId`
  - `activeChatId`
  - `tab.thinking`
  - `tab._awaitingDone`
  - 调用来源
- 在主进程 `codex-agent-query` 打印：
  - `sessionId`
  - `runId`
  - `existing?.runId`
  - `existing?.doneSent`
  - `existing?.resultReceived`
- 在 `triggerDone()` / `finally` / `abort` 打印：
  - `sessionId`
  - `runId`
  - 当前 map 中的 `runId`

## 当前判断

这次 bug 的主链路已经比之前清楚很多了。

更准确的说法不是”完全修完”，而是：

- 已确认并修掉一条前端伪中断链
- 已确认并修掉一条主进程多 run 真中断链
- 后续如果再复现，应该先用 `runId + cleanup + duplicate query` 这一组日志判断，而不是继续泛化怀疑”切 tab 导致断流”

## 外部评审意见（2026-06-10，Opus 复核）

以下是对当前修复后代码（`packages/agent/electron/codexAgent.js` + `useCodexAgentStream.js` + `codeX/index.vue`）的代码级复核。这里不是“全部已证实的结论”，而是“按置信度排序的进一步怀疑与建议”。其中有些点代码证据很强，有些点仍是待复现假设。

### R1. 核心疑点：doneSent 早于二进制真正退出，留下危险窗口

当前主进程时序：

1. `turn.completed` 到达 → `resultReceived=true`，drain 约 200ms 后 `triggerDone()` → `doneSent=true`，**立刻**发 `codex-agent-done` 给前端
2. 但此刻 `for await events` 循环还活着——codex 二进制还在收尾（写 rollout JSONL、吐 token_count 等），可能持续几百毫秒到几秒
3. 前端一收到 done 就 flush `_queuedInput`（`codeX/index.vue` onMounted 里的 onCodexAgentDone 回调），或用户立刻手动发下一句
4. 新 query 进入主进程：`canStartCodexSessionRun(existing)` 因为 `doneSent=true` **放行**，随后走 collision 分支（`query collision: aborting old and starting new`）：`existing.abortController.abort()` → 杀掉还在收尾的旧流

由此产生两条可能出问题的路径：

**路径 A — catch 块没有 run ownership 守卫。这个点代码上可以直接确认。**

旧 run 的流被 abort 后抛 AbortError，进入 catch 块（codexAgent.js 约 1989-2025 行）。该块**无条件**发送：

- `subtype: 'abort'` 的”已中断”系统消息
- `thinking: false` 的 metrics

前端 `onAgentMessage` 收到 abort → `tab.thinking=false`、`tab._awaitingDone=false`、显示”已中断”——**把刚启动的新 turn 的 UI 状态直接杀死**。

注意：如果前文把“所有动作都带 run ownership 检查”写成定论，那是不准确的。ownership 检查只覆盖了事件转发、triggerDone、poller、finally 里的 metrics/done，**没覆盖 catch 里的 abort/error 消息发送**。

这完美匹配症状：会话第一条消息不会中断（没有旧 run 残留），而对话进行中、新 turn 刚开始时（恰好落在旧 run 的 drain/收尾窗口内）会中断。

**路径 B — 同一 rollout 文件被两个二进制争抢。这个点目前仍是高疑似假设。**

第二轮及以后用 `resumeThread(prevCliId)` 恢复同一个 JSONL。如果旧二进制还没退出（drain 窗口内被 abort，进程退出需要时间），新二进制启动时与旧进程在 Windows 上争同一个 rollout 文件，可能直接启动失败或中途死掉。表现为流静默结束（没有 turn.completed、没有 error 事件）→ finally 里 cleanup 打出 `resultReceived=false doneSent=false`。**这与用户日志第三行形状一致，但目前还不能反推为已证实根因。**

且此时 `doneReason` 仍是默认的 `'completed'`，done 照发，前端无任何错误提示，对话”无声停止”。

### R2. 次级问题

1. **slash 命令处理器存在干扰风险**（codexAgent.js `codex-list-slash-commands`，约 2195-2262 行）。
   - 已确认：它会 `resumeThread(sessionId)`，structured 列表为空时还会 fallback 到 `thread.run('/')` 真跑一轮
   - 待证实：这是否会稳定复现为“对活跃会话再开一个二进制并争抢同一 rollout 文件”
   - 代码注释 B023 提到的”仅含 '/' 的空会话”与这条链路相关，值得继续观察
2. **流静默结束时 reason 误报 'completed'**。finally 里 `!resultReceived` 时补发的 done 应该是 `'failed'`，且应给前端一条可见错误消息；否则永远是”无声中断”。
3. **flush 排队消息会覆盖用户草稿**。flush 用 `inputText.value = text` 再调 `sendMessage()`；若用户当时正在别的 tab 打字，草稿被吞。flush 还临时切 activeProjectId/activeChatId 再切回，存在与用户操作竞态的风险。建议重构 `sendMessage(textOverride, targetTab)` 形式，不借道全局输入框和全局 active 状态。
4. **30 秒 slowNotice 从未渲染**。bootWatch 发的”Codex 响应较慢”系统消息没有 subtype，前端 `onAgentMessage` 的 system 分支全部 match 不到，落入”未知 subtype 仅打日志”路径，用户看不到。

### R3. 建议实施顺序

按收益/风险比排序，每步先补失败测试再改实现：

1. **给 catch 块加 run ownership 守卫**（一处小改，先堵路径 A）：catch 内所有 `safeSend` / `sendMetrics` 之前检查 `codexSessions.get(sessionId)?.runId === runId`；不是当前 run 就只打日志不发消息。测试：模拟旧 run 在新 run 注册后抛 AbortError，断言前端收不到 abort 消息。
2. **把”可开新 run”的判据从 doneSent 改成”旧流真正关闭”**：finally 末尾设 `existing.streamClosed=true`；`canStartCodexSessionRun` 要求 `streamClosed`。新 query 碰到 `doneSent=true` 但 `streamClosed=false` 时，**等待旧 run 的 promise**（2-3 秒超时后再 abort 强开），而不是立刻 abort 重开。这同时消灭路径 B 的 rollout 文件争抢。测试更新 `tests/codex-session-run-ownership.test.cjs`。
3. **静默结束诊断**：`!resultReceived` 且非用户 abort 时 `doneReason='failed'`，发可见错误消息，并打专门日志行 `[codex] stream ended without turn.completed`，cleanup 日志补 `runId` 字段（现有日志无法分清是哪个 run 的 cleanup）。
4. **slash 命令防干扰**：`codex-list-slash-commands` 入口检查 `codexSessions` 中该会话是否有活跃 run，有则直接返回缓存或空列表；删掉 `thread.run('/')` fallback（或仅对确认空闲的会话执行）。
5. **（可选）排队 flush 重构**：`sendMessage` 支持 `(textOverride, targetTab)`，flush 不再借道 `inputText` 和全局 active 切换。

### R4. 验证清单

```text
node --check packages/agent/electron/codexAgent.js
node tests/codex-session-run-ownership.test.cjs
node --test tests/codex-session-lifecycle.test.mjs tests/codex-session-routing.test.mjs tests/codex-agent-done-reason.test.mjs tests/codex-turn-timeout.test.mjs
npm run build
```

复现验证（人工）：在一轮回答即将结束时立刻发下一句（或用 `_queuedInput` 排队），重复多次，观察：

- 修复前：偶发”已中断”出现在新 turn 开头，或 cleanup 出现 `resultReceived=false doneSent=false`
- 修复后：新 turn 正常执行，cleanup 日志带 runId 且互不串扰
