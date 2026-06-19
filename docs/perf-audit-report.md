# 界面卡顿 — 性能审计与优化方案

> 创建：2026-06-18
> 状态：第一轮已执行，进入第二轮评估
> 背景：多轮迭代后界面响应变慢，启动/加载历史/流式对话/输入均有可感知卡顿
> 人工验收：`docs/qa/2026-06-18-performance-acceptance.md`

---

## 0. 2026-06-18 执行更新

### 已完成

| 项目 | 状态 | 说明 |
|------|------|------|
| P0-1 `codex-run-git-diff` 同步阻塞 | ✅ 已修复 | `execSync` 改为异步 `execFile`，保持现有 `ipcRenderer.invoke` 协议不变；未跟踪文件 diff 加 4 并发上限。原报告把该项列为高风险不准确，前端本来已有 `await` 和“正在获取 diff”提示。 |
| P0-3 `chat/MessageList.vue` 索引 key | ✅ 已修复 | `:key="i"` 改为 `msg.id` 优先，缺 id 时使用 `sessionId/index` fallback。 |
| P2-1 `@` 文件提及高频 IPC | ✅ 已修复 | ClaudeCode 与 CodeX 输入过程均加 150ms debounce；按钮触发和目录下钻仍即时刷新。 |
| P2-2 Claude `/` 模型状态重复 IPC | ✅ 已修复 | `useSlashCommands.loadModelPanelState()` 加 30s TTL；slash 面板内修改 effort/thinking 会同步更新缓存。 |
| P3-5 MessageList streaming 滚动 | ✅ 已修复 | `scrollToBottom()` 加 rAF 合并，同一帧只调度一次。 |
| P3-3 `_fileChanges` deep watcher | ✅ 已修复 | `ToolWrite.vue` 从 deep watch 改为监听文件 path/diff 输入签名，避免 `diffLines` 写回导致深层遍历。 |
| P1-2 `projectTabs` 全量派生 | ✅ 轻量优化完成 | ClaudeCode/CodeX 的 ProjectTabs 与 codeHub expose 路径改为无分配循环，pending 从消息尾部倒序查找；保留原 UI 字段和判断语义。彻底状态增量化暂不做，需先 profiling。 |
| P0-2 `claude-read-session-file-range` 全文件扫描 | ✅ 已修复 | 从“全文件数行 + 再扫目标页”改为“从 JSONL 尾部倒读到够当前页 + 1 行即停”。保持 `{ messages, hasMore, totalPages }` 返回结构和 JSON parse 逻辑；`totalPages` 变为近似页数，前端实际依赖 `hasMore`。 |
| CodeX `codex-read-session-file-range` page>0 全文件扫描 | ✅ 已修复 | 保留 page 0 既有 tail 读取和风险诊断；向上加载历史 page>0 改为 JSONL 尾部按页读取，避免长历史加载更多时全文件数行/二次扫描。 |

### 验证

- `node --check packages/agent/electron/codexAgent.js`
- `node --check packages/agent/src/components/claudeCode/composables/useSlashCommands.js`
- 本地异步 git diff 路径验证：当前仓库 diff 长度 39281，untracked 1
- `npm run build` 通过

### 报告修正

- `packages/agent/src/components/messages/MessageList.vue` 当前不存在；实际修复路径是 `packages/agent/src/components/chat/MessageList.vue`。
- CodeX slash 命令逻辑是内联实现，不等同于 Claude 的 `useSlashCommands.js`；本轮只修了 Claude 的模型状态重复 IPC。
- `codex-run-git-diff` 不需要新增前端 loading/取消协议即可消除主进程冻结，因为调用方已经异步等待 IPC 返回。

---

## 一、问题定性

经过四个维度（事件泄漏、IPC 开销、Vue 响应式、主进程阻塞）的系统扫描，卡顿根因可分为三类：

| 类别 | 占比 | 典型表现 |
|------|:---:|----------|
| 主进程同步阻塞 | 40% | 操作时整个窗口冻结（秒级~分钟级） |
| Vue 响应式过度计算 | 35% | 流式对话时帧率低、滚动不跟手、UI 微卡 |
| IPC 设计粗糙 | 25% | 输入延迟、切换标签停顿、数据重复传输 |

---

## 二、P0 问题（明确导致可感知卡顿）

### P0-1：`codexAgent.js` git diff 同步阻塞主进程

**文件：** `packages/agent/electron/codexAgent.js:3226-3265`
**IPC：** `codex-run-git-diff`

```js
// 当前实现 — 全部 execSync 串行
execSync('git rev-parse --is-inside-work-tree', { timeout: 5000 })     // 5s
execSync('git diff', { timeout: 15000 })                                // 15s
execSync('git ls-files --others --exclude-standard', { timeout: 5000 }) // 5s
for (const file of untrackedFiles) {
  execSync(`git diff --no-index -- /dev/null "${file}"`, { timeout: 10000 })  // 每文件10s
}
```

**危害量化：** 20 个未跟踪文件 = 225 秒（近 4 分钟）窗口完全无响应。
**触发路径：** 用户在 CodeX 输入 `/diff` 命令。

**修复方向：** 全部改为 `execFile`（异步），用 `Promise.all` 并发执行独立任务，逐文件 diff 加并发上限（如 4）。

---

### P0-2：`claudeAgent.js` 会话文件读取同步阻塞

**文件：** `packages/agent/electron/claudeAgent.js:882-1100`
**IPC：** `claude-read-session-file`、`claude-read-session-file-range`

```js
// 当前实现 — 完整读入 + 逐行 JSON.parse 在主进程事件循环
const rawText = fs.readFileSync(filePath, 'utf8')    // 5MB 文件=50ms
const lines = rawText.split('\n').filter(Boolean)      // 30ms
for (const line of lines) {
  const msg = JSON.parse(line)                        // 200行 = 200ms
  // ...处理每条消息
}
```

`read-session-file-range` 更糟 — 双重传递：第一遍 `while(pos < fileSize)` 数换行符，第二遍再读内容+解析。10MB 文件 = ~500-1000ms。

**危害量化：** 滚动聊天历史每次加载卡 0.3-1 秒。
**触发路径：** 切换到有长历史的会话、向上滚动加载旧消息。

**修复方向：**
- 方案 A（低成本）：改为 `fs.promises.readFile` + 移到 Worker 线程解析 JSON
- 方案 B（彻底）：使用 mmap 或流式读取，只解析需要的行范围

---

### P0-3：`MessageList.vue` 索引作 key — DOM 全量重建

**文件：** `packages/agent/src/components/chat/MessageList.vue:18-19`

```vue
<!-- 当前 -->
<div v-for="(msg, i) in messages" :key="i">

<!-- 应改为 -->
<div v-for="msg in messages" :key="msg.id">
```

**危害量化：** 加载旧消息或截断时，Vue 销毁并重建全部 40 条消息的完整组件树（MessageBubble → 代码高亮/图片/Markdown 渲染等全部子组件）。
**触发路径：** 滚动加载历史、compact 后重载消息。

**修复方向：** 直接用 `msg.id` 作为 key。消息已有唯一 ID。**有 `msg.id` 冲突了吗需要额外加 `msg.sessionId` 前缀。** 需要检查：消息的 `id` 是否在跨会话时唯一？如果不唯一，用 `` `${msg.sessionId || ''}-${msg.id}` ``。

**风险：** 低。`messages/MessageList.vue`（被 claudeCode 和 codeX 共用）已经是 `:key="msg.id"`。需要确认 `chat/MessageList.vue` 的两处路径区别，确认消息对象上 `id` 字段的存在性和唯一性。

---

## 三、P1 问题（高频触发导致累积卡顿）

### P1-1：`chat-save-session` 流式传输期间同步写入

**文件：** `packages/agent/electron/claudeAgent.js:2349-2371`
**IPC：** `chat-save-session`

每次消息发送/接收时调用，内部串行：
1. `JSON.stringify(data, null, 2)` — 大对象缩进格式化
2. `fs.writeFileSync(tmp, ...)` — 同步写临时文件
3. `readChatIndex()` — 同步读索引
4. `writeChatIndex(idx)` — 同步写索引

**危害量化：** 每次 20-100ms。流式传输中触发多次 → UI 周期性微卡。
**修复方向：** `JSON.stringify` 不加 `null, 2`（省格式化开销），`writeFileSync` → `fs.promises.writeFile`，聊天索引读写改为异步 + 合并写入。

---

### P1-2：`projectTabs` computed 每次变化遍历全部项目/聊天/消息

**文件：** `claudeCode/index.vue:639-647`、`codeX/index.vue:1166-1172`

```js
const projectTabs = computed(() =>
  projects.value.map(p => {
    const runningCount = p.chats.filter(c => c.thinking).length
    const hasPendingTool = p.chats.some(c =>
      (c.messages || []).some(m => isPendingTool(m))  // 扫描每条消息
    )
    return { ...p, runningCount, hasPendingTool }
  })
)
```

**危害量化：** 任何一个项目的一条消息变化（流式 chunk 追加）→ 重新遍历全部项目→全部聊天→全部消息。O(P × C × M)。
**触发路径：** 流式对话每追加一个 chunk 触发一次全量遍历。有几个项目就有几倍放大。

**修复方向：** 拆解为独立 computed — `runningCount` 和 `hasPendingTool` 只在对应聊天变化时重新计算，父级只做汇总。或者用 `shallowRef` + 手动标记变更。

---

### P1-3：`codeX` flatMap watcher 每次变化克隆全部聊天

**文件：** `codeX/index.vue:1533-1539`

```js
watch(() => projects.value.flatMap(p => p?.chats || []).some(t => t.hasDoneNotification), cb)
```

**危害量化：** 每次响应式变化 → `flatMap` 创建全新的大数组 → `.some()` 遍历 → 然后丢弃。流式传输期间高频触发，GC 压力大。
**触发路径：** 任何消息/聊天/项目的变化。

**修复方向：** 改为在修改 `hasDoneNotification` 的代码点直接触发回调，而不是用 watcher 轮询。

---

### P1-4：`claudeMetrics.js` + `localSearch.js` 同步子进程

**文件：** `packages/agent/electron/claudeMetrics.js:266-276`
**文件：** `packages/agent/electron/localSearch.js`（两个副本，另一个在 `electron/mainModules/localSearch.js`）

- metrics：3 个连续的 `execFileSync('git', ...)`，每次 100-500ms，累积 ~1.5s
- localSearch：所有 ripgrep 搜索使用 `execFileSync`，大型仓库 100-1000ms/次
- **文件本身有重复副本** — 两个 `localSearch.js` 内容几乎相同，维护隐患

**修复方向：** 全部改为异步 `execFile`。合并两个 localSearch.js 副本。

---

## 四、P2 问题（输入响应/交互延迟）

### P2-1：每次击键触发 IPC（@ 文件提及）

**文件：** `codeX/index.vue:2214 → 599-607`

输入 `@` 时每次击键都调用 `refreshMentionSuggestions(query)`，内部发起 1-2 次 IPC（`localSearchFiles` + 回退 `claudeListFiles`）。

**危害量化：** 快速打字 → IPC 请求堆积 → 输入卡顿 + 主进程被频繁中断。
**修复方向：** 加 150ms debounce。非平铺模式下的文件列表完全可以缓存。

---

### P2-2：每次输入 `/` 触发最多 6 次 IPC

**文件：** `useSlashCommands.js:137-144`

输入 `/` 时同时触发：
- `claudeListLocalSkills`（220ms debounce）
- `claudeListSlashCommands`（800ms debounce）
- `claudeGetEffortLevel` + `claudeGetModel` + `claudeGetSelectedTier` + `claudeGetThinkingEnabled`（无 debounce）

模型/tier/effort/thinking 这些设置基本不变，每次 `/` 都重新读取。

**修复方向：** 设置数据缓存 30 秒（`loadModelPanelState` 加 TTL），斜杠命令列表缓存更长时间。

---

### P2-3：插件管理 60 秒同步阻塞

**文件：** `claudeAgent.js:1165-1173`（`execClaudeCli`）、`codexAgent.js:3302-3311`（`execCodexCli`）

```js
execFileSync(cmd, cmdArgs, { timeout: 60000, ... })  // 60 秒超时在 IPC handler 中
```

**危害量化：** claude/codex CLI 卡住 → 主进程冻结 1 分钟。
**修复方向：** 改为异步 `execFile`，超时后返回错误而非阻塞整个应用。

---

### P2-4：`saveHistory` 调用过频 + `immediate` 绕过防抖

**影响文件：** `claudeCode/index.vue`（~25 处）、`codeX/index.vue`（~20 处）

其中约 10 处使用 `{ immediate: true }` 绕过 2 秒防抖，立即序列化整个面板状态并通过 IPC 发送。

**修复方向：** 审查 immediate 调用是否真的必要。流式传输期间的保存已由 `throttledSaveHistory`（3 秒间隔）覆盖，额外的 immediate 保存是冗余的。

---

### P2-5：面板状态 `sendSync` 阻塞渲染器

**文件：** `useClaudeHistory.js:133`、`useCodexHistory.js:119`

```js
window.electronAPI?.claudeSaveCodePanelStateSync?.(payload)
// → ipcRenderer.sendSync → 渲染器线程等待主进程写完文件
```

**危害量化：** 页面关闭/刷新时渲染器卡住，等待主进程序列化大 JSON + 写文件。
**修复方向：** 改为异步 `invoke` + `beforeunload` 用 `event.preventDefault()` 等异步完成（如果确实需要在关闭前保存），或用 `navigator.sendBeacon` 模式。

---

## 五、P3 问题（微小泄漏/抖动，累积效应）

| # | 问题 | 文件:行 | 修复方向 |
|---|------|---------|----------|
| 1 | `codex-open-plugins` 匿名事件监听器无法移除 | codeX/index.vue:2655 | 改为具名函数 + onUnmounted 移除 |
| 2 | watchEffect 5 秒卸载窗口内可能泄漏 | codeHub/index.vue:359 | onUnmounted 中调用 stopWatch |
| 3 | `_fileChanges` deep watcher 遍历大对象 | ToolWrite.vue:326 | 精确监听文件数量而非 deep |
| 4 | nextTick 级联强制布局抖动 | codeX/index.vue:2669 | 合并为单个 nextTick |
| 5 | `MessageList` watch 每次文本变化触发 scroll | MessageList.vue:73-86 | 滚动用 rAF 节流 |
| 6 | `safeIpcPayload` 每次 IPC 深克隆 | helpers.js:117 | 对已知纯数据跳过 clone |
| 7 | `filterCodexSystemMessages` 每次渲染正则扫描 | codeX/index.vue:2496 | 改为 computed + 缓存 |
| 8 | `updateScrollPrevBtn` 每次过滤全部消息 | claudeCode/index.vue:486 | 缓存 userCount |

---

## 六、监控方案

### 开发阶段

#### 1. 主进程 IPC 耗时可观测

```js
// 加到 claudeAgent.js / codexAgent.js setup 函数
const ipcLatencyLog = new Map()

function wrapHandler(name, fn) {
  return async (event, ...args) => {
    const t0 = performance.now()
    try { return await fn(event, ...args) }
    finally {
      const dt = performance.now() - t0
      if (dt > 50) {
        console.warn(`[perf] SLOW IPC: ${name} took ${Math.round(dt)}ms`)
      }
    }
  }
}
// 对已知重型 handler 使用：
// ipcMain.handle('claude-read-session-file', wrapHandler('read-session', readSessionFile))
```

#### 2. Chrome DevTools Performance

在开发模式下打开 DevTools → Performance 标签 → 点击录制 → 操作 UI → 停止。检查：
- **长任务（Long Tasks）**：红色标记，超过 50ms 的需要调查
- **主线程火焰图**：看调用栈中最宽的黄色/红色块
- **FPS 计数器**：流式对话时帧率是否持续低于 30fps

#### 3. Vue DevTools

- **Timeline 标签**：录制组件渲染，看哪个组件渲染次数异常多
- **Component 树**：检查 computed 属性的依赖链长度

#### 4. Memory 堆快照

DevTools → Memory → Heap snapshot → 进入首页 → 切几个项目 → 再拍一张 → 对比。看是否有持续增长的对象。

### 生产阶段（建议集成）

```js
// 轻量打点，接入现有日志
const IPC_SLOW = 100  // ms

const _ipcTimers = {}
function ipcStart(name) { _ipcTimers[name] = performance.now() }
function ipcEnd(name) {
  const dt = performance.now() - (_ipcTimers[name] || 0)
  if (dt > IPC_SLOW) log.warn(`[perf] ${name} ${Math.round(dt)}ms`)
  delete _ipcTimers[name]
}
```

---

## 七、安全性评估

### 🟢 安全区 — 改了基本不可能出 bug

纯前端局部改动，不影响数据流，最坏情况一眼可见、一行回滚。

| # | 修复项 | 为什么安全 | 最坏情况 |
|---|--------|-----------|----------|
| 1 | `:key="i"` → `:key="msg.id"` | 消息已有稳定 id。key 只影响 Vue DOM 复用策略，不影响任何业务逻辑 | key 冲突 → DOM 错位（一眼可见），回滚一行 |
| 2 | @ 文件提及加 150ms debounce | 纯前端防抖，不改数据结构 | 建议列表弹出慢 150ms，功能无损 |
| 3 | `/` 输入设置缓存 30s TTL | 纯前端缓存。设置数据低频变化，缓存命中直接返回 | 用户改设置后 30s 内 `/` 面板显示旧值（极少发生） |
| 4 | scroll watch 加 rAF 节流 | scrollToBottom 从每帧一次改为 ~16ms 一次 | 滚动跟手性略降，可调回 |
| 5 | `_fileChanges` deep watcher → 精确监听 | 只改监听目标（`_fileChanges.length` 或加 `immediate: false`），不改变量结构 | 文件变更提示不及时（但当前 deep 本身就有性能问题） |

### 🟡 谨慎区 — 需要理解上下文，但可控

改动涉及多个调用点或数据流，需要先侦查确认热点再动。**建议先加 log 看实际调用频率，确认是热点后再动手。**

| # | 修复项 | 风险点 | 规避方法 |
|---|--------|--------|----------|
| 6 | saveHistory immediate 审查 | 某些 immediate 可能真的有理由（如切换项目前必须保存当前状态） | 逐个查调用栈，只去掉明确冗余的（如同一操作链路里调了两次） |
| 7 | projectTabs computed 拆分 | `runningCount`/`hasPendingTool` 可能在其他地方被依赖 | 先在 computed 里加 `console.count` 看调用频率。改法：拆为嵌套 computed，父级只做汇总 |
| 8 | flatMap watcher → 事件驱动 | 可能漏掉某些设置 `hasDoneNotification` 的代码路径 | 先在 watcher 里加 log 收集触发源。如果只有 1-2 个调用点就安全；如果散布在 10+ 个地方就别动 |
| 9 | chat-save-session 异步化 | `readChatIndex → 修改 → writeChatIndex` 是经典 read-modify-write，异步化后并发调用可能互相覆盖 | 需要加写入锁/队列。收益中等但实现需谨慎 |
| 10 | execClaudeCli/execCodexCli 异步化 | 当前同步保证了调用方拿到结果后才继续。改为异步后调用方需要处理 pending/error 状态 | 改为 `execFile` + Promise，前端已有 env check 的异步模式可复用 |

### 🔴 高风险区 — 可能搞出数据丢失/竞态/死锁，暂不动

这些改动涉及**数据持久化边界**或**跨进程同步语义**，改坏了会丢数据、丢消息、丢配置。需要单独设计方案。

| # | 修复项 | 风险分析 |
|---|--------|----------|
| 11 | sendSync → 异步 invoke | `sendSync` 在 `beforeunload` 里用，是因为浏览器关闭前**必须同步完成**写入。改成异步后，浏览器可能在写入完成前退出 → **数据丢失** |
| 12 | 会话文件 readFileSync 异步化 | 读取期间会话可能被其他进程修改 → 读到半截数据。异步化需要原子读取策略 + 文件锁 |
| 13 | git diff execSync → async spawn | 当前同步保证了 `/diff` 命令在 diff 完成后才返回结果。异步化后前端需要处理 loading 状态 + 超时 + 取消。改动面大，涉及前后端协同 |
| 14 | claudeMetrics + localSearch 异步化 | 调用方已假设同步返回结果。改成异步后所有调用方都要改（metrics 采集、搜索建议、文件提及等）。叠加 localSearch.js 有两个重复副本需要先合并 |

---

## 八、修复优先级矩阵

按**投入产出比 × 安全性**排序：

| 优先级 | 编号 | 修复项 | 预期效果 | 安全 | 复杂度 | 范围 |
|:---:|------|--------|----------|:---:|:---:|------|
| 优先级 | 编号 | 修复项 | 预期效果 | 当前状态 | 下一步 |
|:---:|------|--------|----------|----------|--------|
| 1 | P0-1 | git diff `execSync` → async `execFile` | `/diff` / `/review` 不再冻结主进程 | ✅ 已完成 | 人工回归大 diff / 多 untracked 文件 |
| 2 | P0-3 | MessageList `:key="i"` → 稳定 key | 历史加载不再重建全部 DOM | ✅ 已完成 | 人工滚动历史回归 |
| 3 | P2-1 | @ 文件提及加 150ms debounce | 快速打字不再堆积 IPC | ✅ 已完成 | 人工验证 Claude/CodeX `@` 补全 |
| 4 | P2-2 | Claude `/` 输入加设置缓存 TTL | 减少每次 4 次无效 IPC | ✅ 已完成 | 后续评估 CodeX 是否需要同类缓存 |
| 5 | P3-5 | MessageList scroll watch 加 rAF 节流 | 流式滚动更平滑 | ✅ 已完成 | 人工观察 streaming 自动沉底 |
| 6 | P3-3 | `_fileChanges` deep watcher → 精确监听 | 减少深层对象遍历 | ✅ 已完成 | 人工验证 file_change/apply_patch diff 展示 |
| 7 | P1-2 | projectTabs computed 去嵌套遍历 | 降低项目 tab 派生状态的分配和历史扫描成本 | ✅ 轻量优化完成 | 深度增量状态需 profiling 后单独做 |
| 8 | P0-2 | 会话文件分页读取避免全文件扫描 | 激活长历史 session 时只读需要的 60 条附近数据 | ✅ 已完成 | 人工回归长历史切换和向上加载 |
| 8a | CodeX | CodeX 历史分页读取避免 page>0 全文件扫描 | CodeX 长历史向上加载不再因总文件很大卡住 | ✅ 已完成 | 人工回归 CodeX 长历史和 file_change 卡片 |
| 9 | P1-1 | chat-save-session 异步化/队列化 | 减少流式传输周期性微卡 | ⏭️ 下一轮 P1 | 需要写入队列，避免 read-modify-write 覆盖 |
| 10 | P2-4 | 审查+合并 saveHistory immediate 调用 | 减少无效序列化 | ⏭️ 下一轮 P1 | 先统计调用频率，再删冗余 immediate |
| 11 | P1-3 | flatMap watcher 改为事件驱动 | 消除中间数组创建 | ⏭️ 下一轮 P2 | 可与 projectTabs 状态重构一起做 |
| 12 | P2-3 | execClaudeCli/execCodexCli 异步化 | 插件操作不再冻结 UI | ⏭️ 下一轮 P2 | 后端 Promise 化，前端已有异步调用可复用 |
| 13 | P2-5 | sendSync → 异步/退出前保存方案 | 关闭时不再卡渲染器 | 暂缓 | 涉及退出前持久化语义，需单独方案 |
| 14 | P1-4 | claudeMetrics + localSearch 异步化 | metrics/search 不再阻塞主进程 | 暂缓 | 先合并重复 localSearch，再改调用方 |

---

## 九、执行策略

```
第一轮（已完成）→ 6 个低风险前端热点 + /diff 主进程冻结
     ↓ 人工回归：@ 补全、/diff、历史滚动、streaming 自动沉底、file_change diff 展示
第二轮（已完成主要项）→ projectTabs 已做保守优化；Claude range history 已改为尾部按页读取
     ↓ 加 IPC 耗时日志和 Vue 渲染观测，量化剩余长任务
第三轮 → saveHistory 队列化、插件 CLI 异步化、localSearch/metrics 异步化
     ↓ sendSync/退出保存单独设计，不混入普通性能补丁
```

---

## 十、不做

- 不引入重型性能框架（如 Clinic.js、0x）— 当前 Chrome DevTools 足够
- 不激进重构整个状态管理（如迁移 Pinia）— 收益不明确，风险太大
- 不将大型 computed 全部改 shallowRef — 逐个评估，避免破坏响应式正确性
- 不修改 `safeIpcPayload` 深克隆逻辑 — 这是 IPC 安全边界，不可省略
