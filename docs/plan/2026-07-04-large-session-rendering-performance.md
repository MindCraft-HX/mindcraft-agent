# T176 大 Session 渲染性能问题专题分析

> 日期：2026-07-04
> 相关：ClaudeCode / CodeX 消息列表、输入框、后台扫描
> Task: T176
> 状态：已收口；Phase 1 完成，Phase 2a-0 探针证伪 renderContent 方向

## 0. 执行结论

### 0.0 收口结论（2026-07-04）

T176 的渲染方向已完成应做的部分，不再继续推进 computed 缓存、普通大消息折叠、虚拟列表或输入框拆分。

已完成并验证：

- CodeX history restore 的 completed tool 默认折叠。
- ToolBash 大输出懒挂载，避免冷加载直接挂完整 `<pre>`。
- 真实大 JSONL 采样中，最近 60 条的 expanded tools 从常见 29-43 降到 0-3，剩余展开项为 error tool。
- `renderContent` 探针数据显示：
  - 打字期间旧消息没有触发 `renderContent` 重跑。
  - 冷加载 `renderContent` 约 73 calls / 19.5ms。
  - 单次 max 约 8.5ms，avg 约 0.27ms。
  - 当前样本 max message text 约 5KB，没有 >80KB 大 assistant/user message。

结论：

- `renderContent` 不是当前剩余卡顿的主要瓶颈。
- computed 缓存和普通大消息折叠当前收益不足，继续做会偏离证据。
- T176 不再承接后续“切 session 后仍卡”的排查。

后续问题已转入并完成 T177 主线：`docs/plan/2026-07-04-session-switch-background-task-latency.md`。T177 已确认并修复 session 切换后的后台 IPC / metrics / draft / instruction 主进程队列串扰。

剩余“仍有点卡”的问题不再回到 T176 的 `renderContent` / computed 缓存方向，统一进入 T177-P2：`docs/plan/2026-07-04-renderer-dom-layout-and-cache-governance.md`。下一步先用 Performance trace 归因 renderer Scripting / Layout / Paint / DOM node 成本，再决定是否做分片挂载、detail 懒挂载、响应式边界收窄或虚拟列表。

当前卡顿不要继续按“所有 session 都被重度关联/全部重渲染”处理。已收窄到更具体的链路：

1. 切入大 CodeX session 后，当前页面一次性恢复最后 60 条消息。
2. 这 60 条里经常有 29-43 条 tool message。
3. 历史 tool message 当前大多是 `expanded: true`。
4. `ToolMessageCard.vue` 在 `msg.expanded` 为 true 时会挂载详情组件。
5. shell/bash tool 的详情组件 `ToolBash.vue` 会直接把完整 `msg.bashOutput` 挂进 `<pre>`。
6. 因此一个大 session 冷切入后，页面 DOM、样式计算、Layout、Paint、hit-test 都明显变重；之后输入、点击、鼠标移动、滚动都会共享这个变重的主线程环境。

这不是“命令行也应该一样卡”的问题。CLI 渲染主要是文本 buffer + 可见区域输出；这里是 Vue 组件树 + DOM + CSS hover + `<pre>` + diff/modal 状态 + 响应式对象，成本完全不同。

本专题的第一阶段只修这个已验证链路：**历史恢复的已完成 tool 默认折叠，大输出懒挂载**。不要先做虚拟列表、输入框大拆分、全局缓存体系或消息存储迁移。

## 0.1 回归嫌疑

用户反馈“以前不卡，最近大量重构后变卡”。目前最强嫌疑区是 T168 CodeX event rendering contract 及其后续修复：

- `4b8a53e feat(codex): T168 CodeX 事件渲染契约 — live stream 修复 + mapper 共享模块`
- `784bd90 fix(codex): finish T168 rendering contract regressions`

理由：

- T168 将 live/history tool 渲染统一到 `codexUiEventMapper`，目标是修复历史和实时渲染不一致。
- 当前 mapper 的 `buildToolMessageParts()` 默认 `expanded: true`。
- 当前 `buildHistoryToolMessage()` 会把历史输出写入 `bashOutput` / `newContent` / `toolResultContent`。
- 这让历史恢复更接近 live 完整 tool card，但对大 session 冷加载非常重。

注意：不能简单说“T168 是唯一原因”。旧 baseline 中部分 shell 历史路径也已经有 `expanded: true + bashOutput`。更准确的判断是：**T168 这条线扩大并固化了 live/history parity，当前性能瓶颈正好落在“历史 tool 完整展开”这个 parity 策略上**。因此修复方向不是回滚 T168，而是给 history restore 和 live stream 明确不同的 UI 展开策略。

## 0.2 已量化证据

本机 CodeX 大 JSONL 只读采样，调用 `codexAgent.__test__.readSessionFileRange(file, 0, 60)`：

| JSONL 大小 | 读取耗时 | messages | tools | expanded tools | terminal tools | bash 输出合计 | 单条最大 bash |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 62.19MB | 75.1ms | 60 | 38 | 38 | 34 | 180.3KB | 39.2KB |
| 58.94MB | 153.5ms | 60 | 43 | 43 | 35 | 53.9KB | 7.7KB |
| 46.50MB | 47.6ms | 60 | 41 | 41 | 36 | 114.4KB | 12.0KB |
| 20.24MB | 91.9ms | 60 | 40 | 40 | 38 | 164.3KB | 39.0KB |
| 19.27MB | 57.5ms | 60 | 38 | 38 | 28 | 114.5KB | 12.0KB |
| 16.66MB | 62.9ms | 60 | 29 | 29 | 24 | 92.0KB | 39.0KB |
| 11.48MB | 52.4ms | 60 | 34 | 34 | 25 | 244.4KB | 38.5KB |
| 11.43MB | 69.8ms | 60 | 40 | 40 | 22 | 49.1KB | 7.3KB |

补充观察：

- 2MB tail raw read + JSON.parse 通常只有几到十几毫秒，磁盘 tail read 不是唯一主因。
- `readSessionFileRange` 对 60 条历史的恢复耗时在 47-153ms 可接受，但恢复出来的 UI 对象会造成重 DOM。
- `renderContent()` 对 40KB markdown + 多代码块可到 10-30ms，可能是第二阶段问题，但不是第一阶段最强证据。

关键代码：

- `packages/agent/src/components/codeX/components/messages/ToolMessageCard.vue`
  - `v-if="msg.expanded"` 才挂载 tool detail。
- `packages/agent/src/components/codeX/components/messages/tools/ToolBash.vue`
  - `<pre class="bash-output">{{ msg.bashOutput }}</pre>` 直接挂完整输出。
- `packages/agent/src/components/codeX/utils/codexUiEventMapper.mjs`
  - `buildToolMessageParts()` 默认 `expanded: true`。
  - `buildHistoryToolMessage()` 合并历史输出。
- `packages/agent/electron/codexAgent.js`
  - `readSessionFileRange()` / `tryFlushCall()` 调用 `buildHistoryToolMessage(call, output, patchEnd, {})`。

## 一、问题现象

用户反馈以下场景存在明显卡顿：

1. **大 session 中输入框打字卡**：session 文件约 16MB，边渲染边输入时明显卡顿；空 session 不卡
2. **切 Tab 后操作卡**：刚切换到某个 CodeHub tab 后的前几秒内，点击 session、滚动、输入等操作都会"一卡一卡"
3. **发送消息时/Agent done 时卡**：即使没有开始流式渲染，发送完成和 agent done 完成时也会小卡一下
4. **鼠标移动也卡**：DevTools Performance 显示 `pointerover` 事件处理占用了大量主线程时间

## 二、已收集的 perf 数据

### 2.1 渲染期间主线程火焰图

- **Layout**: 15.0%
- **Layerize**: 13.1%
- **Paint**: 12.4%
- **Recalculate style**: 10.9%
- **Pre-paint**: 9.9%
- **Function call**: 18.8%
- **Event: pointerover**: 18.1%
- **Animation frame fired**: 11.2%

结论：主线程被**渲染管线**和**鼠标事件处理**占满，不是某个单一同步函数阻塞。

### 2.2 perf 探针聚合

```
codex.handleRefreshSessions    calls=11  avg=205ms   max=1482ms
claude.handleRefreshSessions   calls=6   avg=200ms   max=1204ms
codex.refreshMetricsForChat    calls=N   avg=23ms    max=330ms
claude.refreshMetricsForChat   calls=N   avg=138ms   max=834ms
codex.ensureChatMessagesLoaded calls=N   avg=239ms   max=1061ms
claude.ensureChatMessagesLoaded calls=N  avg=999ms   max=1927ms
saveHistory.build              calls=N   avg=~1ms    max=1.7ms
saveHistory.clone              calls=N   avg=~0.4ms  max=1.4ms
```

- 后台扫描（`handleRefreshSessions`）和指标刷新（`refreshMetricsForChat`）虽然耗时长，但都是 **async IPC**，不会直接阻塞事件循环
- `saveHistory` 的深拷贝只有 1-2ms，**不是卡顿来源**
- `onAgentMessage` 单次很轻（0.03ms），但调用频繁

## 三、已排除的原因

| 猜测 | 结论 | 证据 |
|---|---|---|
| `saveHistory` 深拷贝阻塞 | ❌ 排除 | 探针显示 build/clone 只有 1-2ms |
| `onAgentMessage` 流式处理太重 | ❌ 排除 | 单次 0.03ms，空 session 不卡 |
| 后台扫描同步阻塞主线程 | ❌ 排除 | IPC 是 async，火焰图也无 IPC 同步阻塞 |
| perf 探针 overhead | ❌ 排除 | 探针关闭后（`window.__MCPF_PERF__` undefined）仍卡 |
| 消息数量无限增长 | ⚠️ 部分排除 | `MAX_MESSAGES=60` 存在，但单条消息可能很大 |

## 四、根因分析

### 4.1 核心问题：大消息列表的渲染管线过载

`MessageList.vue` 直接渲染 `tab.messages`：

```vue
<div
  v-for="msg in tab.messages"
  :key="msg.id"
  class="msg-row"
>
  <MessageItem :msg="msg" / >
</div>
```

虽然 `trimMessages` 限制最多 60 条，但 16MB / 60 ≈ 平均每条 270KB。当单条消息包含大量 markdown、代码块、表格时，渲染 60 条消息的 DOM 树本身就非常重。

### 4.2 关键问题：renderContent 在每次渲染时重复执行

`AssistantMessageBubble.vue` 中：

```vue
<div v-html="renderContent(msg.text)"></div>
```

`renderContent` 是完整的 markdown 解析器 + 语法高亮器（`render.js` ~700 行）。**每次组件重新渲染都会重新解析整条消息文本**。

当输入框变化触发 `MessageList` 重渲染时，所有 60 条消息的 `renderContent` 都会重新执行 → 重新生成 HTML 字符串 → 触发 Vue VDOM diff → 即使 DOM 没变化，CPU 已经被占满。

### 4.3 鼠标事件处理过重

火焰图显示 `Event: pointerover` 占 18.1%。`MessageList.vue` 中每条消息都有：

```css
.msg-row:hover { background: color-mix(in srgb, var(--cc-bg-hover) 35%, transparent); }
```

CSS hover 本身不应该是问题，但结合大量复杂 DOM，鼠标移动时浏览器需要频繁做 hit-test 和重绘。

### 4.4 输入框和消息列表共享响应式作用域

当前输入框（`inputText`）和 `MessageList` 都在同一个 `claudeCode/index.vue` / `codeX/index.vue` 组件内。输入框的任何变化都会触发整个父组件重新渲染，进而触发消息列表 VDOM diff。

### 4.5 后台扫描的间接影响

`handleRefreshSessions` / `refreshMetricsForChat` 是 async 的，但 IPC 返回后会触发：
- `project.chats` 重新赋值
- sidebar 重渲染
- 状态栏 metrics 更新

这些更新在主线程排队，如果用户恰好在此时输入/点击，体感就是"卡一下"。

## 五、候选方案评审

### 方案 A：历史 tool 默认折叠 + 大输出懒挂载（推荐 Phase 1）

**目标**：降低切入大 session 后的首屏 DOM、Layout、Paint、hit-test 成本。

**做法**：

1. 给 CodeX history restore 显式传入上下文，例如：

```js
buildHistoryToolMessage(call, output, patchEnd, { historyRestore: true })
```

2. 在 `codexUiEventMapper` 中区分 live 和 history：
   - live stream 新产生的当前 tool 可以继续默认展开，保留实时体验。
   - history restore 的已完成 tool 默认折叠。
   - error / pending / permission 类工具可以保留展开，避免隐藏需要用户处理的信息。
   - thinking/reasoning 继续折叠。

3. `ToolBash.vue` 对大输出做懒挂载：
   - 小输出可保持当前行为。
   - 超过阈值的输出只显示摘要，例如字符数/行数/前几行 preview。
   - 用户点击“显示完整输出”后才挂载完整 `<pre>`。
   - 完整输出仍保留在 message 对象中，DiffModal / copy / 查看完整内容不能丢。

4. 避免重复保存同一大字符串：
   - shell history 已有 `bashOutput` 时，评估是否还需要把同一内容复制到 `newContent`。
   - 如果 `newContent` 只为 modal raw content 兜底，不应在 shell 场景重复存完整输出。
   - 修改前先确认 `ToolMessageCard.vue`、`DiffModal`、copy/expand 路径依赖。

**优点**：

- 命中当前证据最强的瓶颈。
- 改动小于虚拟列表和输入框拆分。
- 不改变官方 JSONL，只改变 MindCraft UI 恢复策略。
- 不破坏 T168 的“事件语义统一”，只是明确 live/history 展开策略不同。

**风险**：

- 用户切回历史 session 时，需要多点一次才能看到完整历史 tool 输出。
- 如果某些历史 tool 的展开状态本来承载重要信息，默认折叠可能影响浏览效率。

**风险控制**：

- error / pending / permission 保持展开。
- tool header 必须展示足够摘要：工具类型、命令、cwd/file path、状态、输出大小。
- 大输出 preview 保留前几行，避免完全黑盒。
- 加契约测试固定 live/history 差异，避免后续又被“统一”回 `expanded:true`。

### 方案 B：缓存 `renderContent` 结果（候选 Phase 2）

**做法**：在 `AssistantMessageBubble.vue` / CodeX 对应组件中，用 `computed` 缓存 `renderContent(msg.text)` 的结果：

```vue
<script setup>
import { computed } from 'vue'
const props = defineProps({ msg: { type: Object, required: true } })
const renderedContent = computed(() => renderContent(props.msg.text))
</script>

<template>
  <div v-html="renderedContent"></div>
</template>
```

**优点**：
- 改动极小（两个文件，几行代码）
- 直接消除输入时重复解析 markdown 的开销
- 风险低，向后兼容

**缺点**：
- 只解决"输入时重复 renderContent"的问题
- 不解决消息列表 DOM 本身太重、鼠标移动卡的问题

**当前判断**：有价值，但不作为第一刀。现有证据更指向重 DOM，而不是每次按键必然重跑所有 markdown 解析。做这个前应先加计数或用 Vue devtools/Performance 证明 input 会导致历史 bubble 重 render。

### 方案 C：输入框独立组件化（候选 Phase 3）

**做法**：把输入框区域从 `claudeCode/index.vue` / `codeX/index.vue` 拆成独立组件 `ChatInput.vue`，`inputText` 作为组件内部状态，通过事件向上提交。

**优点**：
- 打字时只重新渲染输入框组件，不动消息列表
- 解决"输入框变化触发 60 条消息 VDOM diff"的问题

**缺点**：
- 需要改 props/events 传递，涉及 `sendMessage`、图片附件、草稿、模型选择等逻辑
- 需要保证输入框相关状态（`canSend`、`pendingImages` 等）的响应式

**当前判断**：风险中等偏高，容易碰草稿、附件、发送状态、快捷键、session registry、panel state。除非 Phase 1/2 后输入仍明显卡，否则不要先做。

### 方案 D：消息列表虚拟滚动（暂缓）

**做法**：只渲染视口内可见的消息，滚动时动态加载/卸载。

**优点**：
- 最彻底解决大消息列表渲染问题
- 无论 session 多大，视口内只渲染 5-10 条

**缺点**：
- 改动大，需要重新设计滚动、自动滚动到底、加载更多历史等逻辑
- 可能影响现有交互（如搜索、跳转消息、划词复制）

**当前判断**：这是长期方案，不是 T176 Phase 1。当前已有 60 条分页和滚动恢复逻辑，虚拟列表会同时影响 `loadMoreHistory`、scroll restore、auto bottom、streaming smart scroll，风险太高。

### 方案 E：限制 assistant/user 单条消息大小 + 折叠（候选 Phase 2/3）

**做法**：
- 单条消息超过一定大小（如 10KB）时默认折叠
- 代码块默认折叠或只显示前 N 行
- 用户点击"展开"再查看完整内容

**优点**：
- 直接减少 DOM 节点数
- 对大段代码/日志特别有效

**缺点**：
- 需要设计折叠 UI
- 可能影响用户体验（需要多一次点击）

**当前判断**：可以在 tool 输出折叠之后再评估。第一阶段只处理 tool detail，不改变普通消息阅读体验。

### 方案 F：消息列表使用 `shallowRef` / 增量更新（暂缓）

**做法**：历史消息数组用 `shallowRef` 管理，流式更新时只修改最后一条消息的 `text`，不触发整个数组的重新遍历。

**优点**：
- 减少 Vue 响应式追踪和 VDOM diff 的范围
- 配合方案 A 效果更好

**缺点**：
- 需要仔细处理消息增删、加载历史等场景
- 可能影响 Vue 的自动更新

**当前判断**：这是响应式边界重构，风险高于 Phase 1。除非有明确 profiler 证明 Vue tracking/VDOM diff 是主瓶颈，否则不要先做。

## 六、推荐方案

建议分阶段实施：

### Phase 1：CodeX 历史 tool 折叠与大 bash 输出懒挂载（本轮执行）

范围：

1. `codexUiEventMapper.mjs` / `.cjs`
   - 支持 `historyRestore` 或等价上下文。
   - history restore 的 completed tool 默认 `expanded: false`。
   - live stream 行为不变。
   - error / pending / permission 类保持展开。

2. `codexAgent.js`
   - 两处 `buildHistoryToolMessage(call, output, patchEnd, {})` 改为传入 history 上下文。
   - 不要改变官方 JSONL 读取内容。

3. `ToolBash.vue`
   - 对大输出只挂 preview，不默认挂完整 `<pre>`。
   - 用户展开完整输出时再挂载完整内容。
   - 小输出行为尽量保持兼容。

4. 测试
   - history shell/tool 默认折叠。
   - live shell/tool 仍按当前策略展开。
   - error tool 保持展开。
   - 大 bash 输出默认不渲染完整 `<pre>`，展开后可看到完整输出。

明确不做：

- 不改 session registry。
- 不改官方 JSONL。
- 不改 metrics。
- 不做虚拟列表。
- 不拆输入框。
- 不重写 MessageList。
- 不把大输出写入 SQLite。

### Phase 2：验证后再决定是否做 renderContent 缓存 / 普通大消息折叠

触发条件：

- Phase 1 后切入大 session 的 Layout/Paint 明显下降，但输入时仍明显卡。
- Performance 或计数证明 input 会导致 assistant/user bubble 重复执行 `renderContent()`。
- 有单条 assistant/user 消息超过 100KB 且首屏可见，造成明显渲染压力。

可选动作：

- 给 assistant/user bubble 的 `renderContent()` 增加 computed 或 LRU cache。
- 对超大 assistant/user 消息增加折叠 preview。
- 先做 CodeX，再评估 ClaudeCode 是否有同类数据。

### Phase 3：输入框组件隔离 / 虚拟列表（长期，暂缓）

只有在 Phase 1/2 后仍不能接受，并且 profiler 指向 VDOM diff 或 DOM 节点总量时再做。此阶段必须单独开方案，不应混入 T176 Phase 1。

## 七、后台扫描的优化方向

虽然后台扫描不是当前卡顿的主因，但切 Tab 后的"持续竞态感"与它有关：

1. **签名缓存快路径**：主进程已有目录签名，可以让 IPC 在没变化时直接返回 `{ unchanged: true }`，避免无意义的扫描和 Vue 更新
2. **Vue 更新去重**：扫描结果和现有 `project.chats` 相同时，不重新赋值
3. **metrics 刷新去重**：`refreshMetricsForChat` 调用次数过多，需要查调用来源

**注意**：此方向依赖本地存储重构后的路径设计，建议等重构落定后再深入。

## 八、Phase 1 实施细节

### 8.1 history/live 展开策略

建议新增一个小 helper，避免散落判断：

```js
function shouldExpandToolByDefault(item, ctx, status) {
  if (status === 'error') return true
  if (status === 'pending') return true
  if (ctx.historyRestore) return false
  if (item.type === 'reasoning') return false
  return true
}
```

具体实现可按现有 mapper 结构调整，但必须满足：

- `buildToolMessageParts(item, { isFinal: true, historyRestore: true })` 对 completed shell/file/mcp/function tool 返回 `base.expanded === false`。
- `buildToolMessageParts(item, { isFinal: false })` 或 live upsert 路径保持当前行为。
- `patch_apply_end` / `file_change` history 默认折叠，但 header 仍能展示文件路径。
- `error` 默认展开。
- 如果有 permission/pending 类工具，默认展开。

注意 `.mjs` 和 `.cjs` 当前是双份文件，必须同步修改并加测试防漂移。不要只改其中一份。

### 8.2 大 bash 输出懒挂载

建议阈值：

- `LARGE_BASH_OUTPUT_CHARS = 12000`
- 或 `LARGE_BASH_OUTPUT_LINES = 200`

行为：

- 小输出：保持当前 `<details><pre>{{ msg.bashOutput }}</pre></details>` 体验。
- 大输出：
  - 默认只显示 summary + preview。
  - preview 建议前 80-120 行或前 8000 字符，二者取更小。
  - 显示完整字符数/行数，便于用户理解为什么折叠。
  - 点击后才挂完整 `<pre>`。

不要把 `v-show` 用在完整 `<pre>` 上；`v-show` 只是隐藏，DOM 仍会挂载。必须用 `v-if` 延迟挂载完整输出。

### 8.3 `newContent` 去重评估

当前 shell history 可能同时持有：

- `bashOutput`
- `newContent`
- `toolResultContent`

三者可能是同一大字符串。Phase 1 可以先不强行删，避免影响 modal/copy；但至少要审计：

- `ToolMessageCard.vue` 的 `modalRawContent` shell 路径优先读 `bashOutput`。
- `ToolBash.vue` 只需要 `bashOutput`。
- `ToolWrite.vue` 才需要 `newContent`。

如果确认 shell 不依赖 `newContent`，可在 history shell 中不再复制 `newContent = output`。这属于内存优化，不是首要 DOM 优化；如果不确定，先保留，避免功能回归。

### 8.4 ClaudeCode 是否同步

Phase 1 优先 CodeX，因为采样和回归嫌疑都集中在 CodeX。ClaudeCode 后续再按数据评估。

如果顺手看 ClaudeCode，只做调查，不要混改。ClaudeCode 历史 normalizer 中也有默认展开策略，例如：

- `packages/agent/src/components/claudeCode/index.vue`
- 搜索 `block.expanded !== false`、`expanded`、tool history normalizer。

ClaudeCode 的输出结构和 UI 组件不同，不要复制 CodeX 的实现过去。

## 九、测试要求

必须新增或扩展测试，不要只靠人工试：

1. `codexUiEventMapper` 单元测试
   - history shell completed 默认 `expanded: false`。
   - live shell 默认展开策略不变。
   - history error 默认 `expanded: true`。
   - history reasoning 默认 `expanded: false`。

2. `codexAgent.__test__.readSessionFileRange` 或历史 contract 测试
   - 构造带 command/function call + output 的 JSONL。
   - 读取后 shell message 保留 `bashOutput`。
   - 读取后 shell message 默认折叠。
   - 不丢 file_change / apply_patch 的路径和 diff 摘要。

3. `ToolBash.vue` 组件测试（如果当前测试栈方便）
   - 大输出默认只渲染 preview，不渲染完整输出。
   - 点击显示完整输出后才出现完整内容。
   - 小输出保持当前行为。

如果组件测试成本过高，至少补纯函数 helper 测试，把大输出 preview 逻辑抽到可测函数，例如：

```js
buildBashOutputPreview(output, { maxChars, maxLines })
```

## 十、人工验收

使用同一个大 CodeX session 做修复前后对比。建议选择本机已出现的数据量级：

- 16MB+ JSONL。
- 最近 60 条中 20+ tool。
- bash 输出合计 90KB+。

验收步骤：

1. 打开 dev，启用 perf flag。
2. 切到 CodeX 项目。
3. 连续点击 3-5 个大 session，再切回同一个大 session。
4. 观察：
   - session 内容出现后，鼠标移动不应明显一顿一顿。
   - 输入框打字不应被页面重 DOM 拖住。
   - tool header 仍显示命令/文件/状态。
   - 历史 shell tool 默认折叠。
   - 点击 shell tool 可展开。
   - 大输出初始只显示 preview，点击后可看到完整输出。
5. DevTools Performance 对比：
   - Layout / Paint / Recalculate Style / pointerover 占比应下降。
   - DOM node 数应下降。
   - 切 session 后长任务数量应减少。

可接受标准：

- `ensureChatMessagesLoaded` 的读取耗时可能仍是 40-150ms，不要求它归零。
- 重点是内容加载后 UI 不继续卡住。
- hot switch 保持快。
- 没有历史输出丢失。
- 没有 live 当前回合 tool 输出被错误折叠到看不见。

## 十一、Code Review 检查点

审核时重点看这些问题：

1. 是否只改 UI 恢复/展示策略，没有写官方 JSONL 或改变 transcript。
2. `.mjs` / `.cjs` mapper 是否同步。
3. live stream 是否被误改。
4. error/pending/permission 是否仍默认展开。
5. `ToolBash.vue` 大输出完整 `<pre>` 是否真的用 `v-if` 懒挂载，而不是 `v-show`。
6. preview 是否不会复制超大字符串多次。
7. 是否新增测试覆盖 history/live 展开差异。
8. 是否没有引入新的全局状态、localStorage、session registry 字段。
9. 是否没有把 T176 顺手扩散到 metrics、provider storage、draft、scroll。
10. 是否保留完整输出查看能力。

## 十二、待验证问题

1. 在 16MB session 中，滚动到顶部是否会触发"加载更多历史"？（验证分页是否生效）
2. 单条消息最大有多大？是否有个别消息几 MB？
3. `pointerover` 卡顿是 CSS hover 还是 JS 事件监听导致？
4. `refreshMetricsForChat` 33 次调用的具体来源是什么？

这些不是 Phase 1 阻塞项。Phase 1 只需要解决“默认挂载大量历史 tool detail”。

## 十三、Phase 1 执行结果

Phase 1 已完成（commit `d6e1c1c` + `b47a56f`）：

- CodeX history tool 默认折叠（`shouldExpandToolByDefault` + `historyRestore` 上下文）
- ToolBash 大输出懒挂载（threshold: 12000 chars / 200 lines, preview → v-if 完整挂载）
- 8 项 code review 修复（含 resultStatus guard 回归、split 尾部换行 off-by-one、i18n）
- 测试：68 pass / 0 fail，真实大 session 采样验证 expanded tools 从 29-43 → 0-3

人工验收反馈：有优化效果但未完全解决。冷渲染期间打字仍卡。

## 十四、Phase 2 方案：renderContent 探针先行，数据驱动选方案

### 核心判断

- 不要猜"computed 缓存能否解决"或"打字是否触发重渲染" — 用探针测。
- 先量化 `renderContent` 在三种场景下的行为：冷挂载、输入打字、增量 append。
- 根据数据决定做 computed 缓存、大消息折叠、两者都做、或转查其他方向。

### Phase 2a-0：renderContent 量化探针（本轮）

只加统计，不改渲染行为：

1. 每次 `renderContent()` 记录：来源组件、`msg.id`、文本长度、代码块数、耗时 `performance.now()`
2. 区分场景：冷挂载、输入打字、增量 append、切 session
3. 输出聚合：calls、total ms、max ms、重复调用次数、按消息类型分桶
4. 仅在 debug/perf flag 开启时激活

验收标准：
- 切入大 session 时 `renderContent` 总耗时？
- 打字期间旧 `msg.id` 有没有重复调用？
- append 新消息时旧 `msg.id` 有没有重复调用？
- 最大耗时来自 assistant/user/system 哪类消息？
- 是否有 >80KB 或 >15 code blocks 的单条消息？

### 决策分支

| 数据结论 | 对应方案 |
|---------|---------|
| 重复调用高（打字/append 触发旧消息重跑） | Phase 2b: computed 缓存 |
| 冷渲染高且集中在大消息 | Phase 2c: 大消息折叠（>80KB 或 >15 code blocks） |
| 两者都高 | 两个都做 |
| 都不高 | 转查 layout/DOM/style 或分帧渲染 |

### 不做

- 虚拟列表
- Worker/off-main-thread 渲染
- 修改 storage / metrics / draft / session registry
