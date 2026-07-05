# T181 CodeHub Startup / Activation Hot Path 收口

> 日期：2026-07-05
> 状态：Activation Chain Governance 主线已完成；streaming render 后续独立评估
> 相关：T176 / T177 / T177-P2 / T178 / T179、CodeHub、ClaudeCode、CodeX、session activation、draft、scan、streaming render

## 0. 执行结果

T181 已完成主线：切 session 卡顿不再继续用“多加缓存”解释，而是收敛到 activation 同步段治理。

已完成：

- 明确 activation 同步段只允许更新 active id、显示已有内存状态、启动当前 session 首屏加载和 focus/scroll。
- 将完整 metrics、完整 project scan、registry repair、非当前 session 后台任务排除出同步段。
- 结合 T182，窗口 focus 自动扫描轮询已移除；发送/done 边界负责更新 `updatedAt/fileSize` 和 session 排序。
- streaming assistant `v-html` 不再作为本任务主线；仅当 active streaming 输入仍有明确证据时，后续单独开专项。

保留风险：

- CodeHub tab summary 独立轻量源仍是长期架构方向，只有当 full panel mount 继续成为证据明确的瓶颈时再推进。
- active visible chat 的无闪烁 reload 仍需按真实复现决定是否单独处理，不能顺手改 scan/done 恢复边界。

## 1. 背景

这轮性能问题不能再简单归为“要不要继续加缓存”。用户反馈的主要体感包括：

- CodeHub 初次进入从以前 1-2 秒变成 5-6 秒。
- 跨 project tab / agent tab 进入 session 时，内容已经显示后又 loading / reload / 闪一下。
- 切 tab 后几百毫秒内输入框仍会卡一下。
- active session streaming 时打字也可能卡。

这些不是同一个根因。当前代码调查后，优先级需要调整：

1. **先治理 CodeHub startup / activation 生命周期。** 它解释 CodeHub 加载慢、跨 tab 二次加载、切换后短卡。
2. **再评估 streaming assistant 的 `v-html` 热路径。** 它只解释 active streaming 期间持续输入卡，不能解释 CodeHub 初始加载和跨 tab 闪烁。

因此 T181 的主线不是“streaming 改 `<pre>`”，而是：

**把 CodeHub tab summary / panel ready / session scan / history reload 从 heavy panel lifecycle 中拆清楚，避免切换路径触发全项目扫描和 active chat 二次清空重载。**

## 2. 已确认事实

### 2.1 CodeHub 启动挂载所有 Agent panel

`codeHub/index.vue` 当前为了统一 tab 能拿到各 Agent 的 `projectTabData`，启动时挂载所有已注册 Agent：

```js
// 统一 Tab 目前依赖各 Agent panel 暴露的 projectTabData；未挂载的 panel 不会执行 loadHistory。
// 在 CodeHub 级 session index 独立出来前，启动时必须挂载所有已注册 Agent，避免冷启动丢失历史 Tab。
const mountedMap = reactive(createMountedMap(agentKeys.value))
```

这意味着 CodeHub 的 ready 依赖 ClaudeCode + CodeX 两套 panel 初始化。只要任一 panel 在 `onMounted` / idle init 里做重活，CodeHub 就会显得整体变慢。

### 2.2 CodeX 初始化仍 await 活跃项目 full scan

`codeX/index.vue` 恢复历史后仍有防御型前置：

```js
// T022: 先 await 活跃项目的 session 扫描，确保 resumeThread 映射就绪再允许用户交互
await refreshProjectSessionsInBackground(activeProj)
```

这个逻辑不是纯历史债。它用于避免后端 `cliSessionIds` map 缺失时下一条消息走 `startThread` 而不是 `resumeThread`。但代价是：活跃项目全量 scan 被放进 ready 前置，CodeHub 初次加载会被拖慢。

ClaudeCode 当前更偏后台化：历史加载后 ready，再对锁定项目 `void refreshProjectSessionsInBackground(p)`。双端策略不一致。

### 2.3 “先显示再 reload 闪一下”的直接候选

CodeX / ClaudeCode 的 background scan 在发现 active chat `fileSize` 变化时，会：

- 设置 `_messagesLoaded = false`
- 可能执行 `messages = []`
- 标记 `_needReloadActiveChat`
- 再调用 `ensureChatMessagesLoaded()` 从磁盘重载

这能解释“session 内容已经显示了，但切 tab 后又 loading / 闪一下”。该逻辑是为了避免 transcript 变更后 UI stale，但对 active visible chat 太粗暴。

### 2.4 Draft 不是唯一元凶，但会放大切换卡顿

draft 改到 session registry 后，输入本身不应该每个字符阻塞磁盘：

- 输入时通常是 timer/debounce 持久化。
- 切换 session 时会保存 old draft、加载 new draft。
- 读写如果命中 renderer/sessionRegistry cache，应是 ms 级。

但 draft 会参与 activation 后台任务。如果切 tab 同时触发 draft load、instruction load、metrics refresh、history reload、scan apply、chunked mount，这些任务都在 renderer/main event loop 上排队，就会在切换后几百 ms 内和输入竞争。也就是说：

**draft 不是“占后台线程”的根因，但它把输入框状态纳入 session activation 链路，和其他后台任务叠加后会让输入卡顿更容易被感知。**

## 3. 任务收口

旧任务状态：

| 任务 | 状态 |
|---|---|
| T176 | 大 session history tool / bash output 冷挂载已收口；`renderContent` 普通缓存方向证伪。 |
| T177 | metrics 主进程 event loop 阻塞已收口。 |
| T177-P2 | 60 条消息一次性挂载 long task 已通过 chunked mount 缓解。 |
| T179 | scan cache hit registry 写副作用已定位并拆除。 |

T181 不继续扩大这些任务，而是专门治理：

- CodeHub startup 是否依赖 heavy panel lifecycle。
- session activation 是否触发不必要 full scan / reload。
- active chat 的 disk reload 是否能无闪烁。
- streaming 输入卡是否仍需单独处理。

## 4. Phase 0：重新量化启动和切换工作图

先补数据，不先改业务。

### 4.1 场景

采集三组：

1. 冷启动进入 CodeHub。
2. 同 agent 同 project 切 session。
3. 跨 agent / 跨 project tab 切 session。

每组记录：

- CodeHub 从 mounted 到 `initDone=true` 的 wall time。
- 每个 panel 的 `ready=true` 时间。
- `loadHistory` 时间。
- 是否 await active project scan。
- `refreshProjectSessionsInBackground` wall/apply。
- `ensureChatMessagesLoaded.ipc/proc/mountStaged`。
- draft load / instruction load / metrics refresh。
- active chat 是否被 `_messagesLoaded=false` 或 `messages=[]`。

### 4.2 必须回答的问题

```text
CodeHub 5-6 秒是卡在：
1. 等所有 panel ready？
2. CodeX await active project scan？
3. scan main handler？
4. renderer scan apply / project.chats merge？
5. active chat reload / chunked mount？
6. draft/instruction/metrics 同时排队？
```

## 5. Phase 1：CodeHub Startup 轻量化

目标：CodeHub 显示 tab 不应依赖挂载完整 ClaudeCode / CodeX panel。

候选方案按风险从低到高：

### 5.1 低风险：CodeX 初始化不 await full scan

保留 resume 防御，但把“确保映射”拆成轻量步骤：

1. 从 panel state / session registry 中已有 chat 注册 `chatKey -> cliSessionId`。
2. 如果 active chat 已有 `cliSessionId`，允许 UI ready。
3. full scan 后台 repair 缺失映射和新 session。

禁忌：

- 不允许因为去掉 await 而恢复“下一条消息新建重复 session”的旧 bug。
- 必须补测试覆盖：已有 `cliSessionId` 的 restored chat 不依赖 scan 也能 resume。

### 5.2 中风险：CodeHub tab summary 独立轻量源

当前 CodeHub 依赖 panel 暴露 `projectTabData`。更干净方向是让 CodeHub 有轻量 tab index：

- 只读 panel state / session registry 的 project/chat summary。
- 不加载 messages。
- 不触发 provider scan。
- 不挂载完整 Agent panel。

这是架构正解，但比 5.1 大。只有 Phase 0 数据证明“等所有 panel ready”是主因时再做。

## 6. Phase 2：Active Chat Reload 无闪烁

目标：background scan 发现 active chat fileSize 变化时，不要先清空可见消息。

当前风险路径：

```text
scan finds fileSize changed
  -> active chat _messagesLoaded = false
  -> messages = []
  -> ensureChatMessagesLoaded()
  -> UI loading / flash / re-render
```

建议改为：

1. 对 active visible chat，后台读取新 page。
2. 读取成功后原子替换或 append/merge。
3. 读取失败保留旧 messages。
4. 只有 pending adoption / dangling recovery 等明确需要覆盖内存状态的场景，才允许清空。

必须保留的防御：

- running / `_awaitingDone` 的 chat 不得被磁盘 reload 覆盖 live messages。
- pending permission / AskUserQuestion 不得被 scan 清空。
- dangling tool recovery 场景仍允许从磁盘修复，但要尽量避免中间空白。

## 7. Phase 3：Streaming Assistant Render

只有在 Phase 1/2 后，active streaming 中持续输入仍卡，再做。

当前确认：

- autosize 已证伪。
- `renderContent` JS 成本大多已证伪。
- streaming 中仍有 `v-html="renderContent(displayText)"`，50ms throttle 只能降频，不能降低单次 `innerHTML -> DOM -> layout -> paint`。

候选方案：

- `isStreaming = tab.thinking && tab.currentAssistantId === msg.id`
- streaming 时用纯文本节点 / `<pre>` 渲染。
- done 后一次性切回 markdown。
- `v-memo` 依赖必须包含 `isStreaming`。

这不是 Phase 1，因为它不能解决 CodeHub 初始加载和跨 tab reload 闪烁。

## 8. 明确不做

- 不继续用“再加缓存”解释所有问题。
- 不回滚 T176 / T177 / T179 已验证有效的修复。
- 不直接上虚拟列表。
- 不直接把 streaming `<pre>` 当主线。
- 不让 scan cache hit 路径恢复 registry 写副作用。
- 不写官方 JSONL sidecar。

## 9. 给 ClaudeCode 的执行口径

```text
任务：T181 CodeHub Startup / Activation Hot Path 收口。

先做 Phase 0，不改业务：
1. 给 CodeHub startup 加分段探针：
   - codehub.mounted -> initDone
   - each panel mounted -> ready
   - unifiedTabs 首次非空
2. 给 CodeX / Claude panel init 加分段：
   - loadHistory
   - registerCliSessions
   - active project scan await / background scan
   - isReady=true
3. 给 active chat reload 加计数：
   - activeChat.messagesClearedForReload
   - activeChat.messagesLoadedFalseByScan
   - reload reason: fileSizeChanged / emptyMessages / pendingAdoption / danglingRecovery
4. 更新本文件 Phase 0 数据。

禁止：
- 先改 streaming `<pre>`。
- 新增缓存。
- 去掉 resume/dedup 防御。
- 清理或重写大段生命周期。

如果 Phase 0 证明 CodeX await active project scan 是主因：
- Phase 1 只做 CodeX 初始化去 await full scan；
- 用已有 restored cliSessionId 先注册 resume mapping；
- full scan 后台 repair。

如果 Phase 0 证明闪烁来自 active chat scan reload：
- Phase 2 改为后台读成功后原子替换，不先清空可见 messages。
```
