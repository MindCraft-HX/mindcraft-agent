# TODO

> 最后更新：2026-06-13
>
> ⚠️ **会话相关 bug 排查第一入口**：`docs/session-pitfalls.md`（跨 Agent 陷阱全景图）

## 当前重点

| 编号 | 分类 | 说明 | 优先级 | 状态 |
|------|------|------|:------:|------|
| T068 | feature | **简易对话（Chat）**：不绑定文件夹的轻量对话，支持知识问答 + 网页搜索 + 图片输入，复用已有 Provider 配置。含上下文清空 + LLM 压缩按钮。 | P1 | ✅ 已完成 (2026-06-13)，commit `d1eb6d2`；详见 `docs/agent-architecture.md` §10 简易对话 |
| T069 | housekeeping | **死依赖清理**：移除 19 个未使用的 npm 包 + 对应死代码，node_modules 减 ~90 MB | P1 | ✅ 已完成 (2026-06-12) |
| T039 | feature | 语音输入能力：支持把语音转文字输入到编程智能体对话 | P1 | 方案设计中 |
| T040 | eval | Remote 远程接入方案研究与实现 | P1 | 待开始 |
| T041 | refactor | mindcraft-agent 重构：在共享 Agent 层基础上裁剪宿主能力与导航 | P1 | 方案评审中 |
| T045 | refactor | Agent 抽离：提取 Claude / Codex / codeHub / agentCommon 为共享 `packages/agent` 层 | P1 | Phase A 已完成，进入稳定与复用阶段 |
| T066 | bug | CodeX 对话卡住/中断：①多轮后卡住（前端忽略 IPC 返回值 + `thread.error` 不设 resultReceived）②早期无反应（slowNotice 无 subtype） | P0 | ✅ 6 项修复 (2026-06-12)：G1(返回值检查+锁定时序)/G2(thread.error→resultReceived)/G3(slowNotice+subtype)/G4(abortSession→await)/O1(结构化拒绝)/O2(late event guard) (`docs/bugs/codex-stuck-interruption.md`) |
| T060 | bug | 文档链接跳转：①部分点击无反应（路径正则漏 Linux/WSL/空格/目录前缀）②跳转到文档但不打开（md-content 竞态丢失） | P1 | ✅ 4/5 根因修复 (2026-06-12)：D(竞态)/A(Unix路径)/C(目录前缀)/E(错误提示)，B(空格截断)暂缓。竞态修复又引入 keep-alive 回归：afb16f5 改为"始终排队"导致 mdViewer 已打开时新文档无人消费，已双通道修复（入队兜底 + 就绪直投）(`docs/bugs/doc-link-navigation.md`) |
| T046 | bug | ClaudeCode 会话重复 / 接力问题：重复 jsonl 绑定、active 丢失、renderer session 身份污染 | P0 | ✅ 5 个根因全部修复 (2026-06-11) (`docs/bugs/claude-session-duplicate-split.md`) |
| T047 | bug | 工具栏 @ 选择文件时输入框有文字就选不了（ClaudeCode + CodeX 共性问题） | P1 | ✅ 已修复 (2026-06-11) |
| T048 | bug | CodeX "额外目录"：默认展开/收缩逻辑缺失 + 缓存/数据流可能断裂 | P2 | ✅ 已修复 (2026-06-11) |
| T050 | bug+ux | 任务完成通知系统修复：提示音稳定性 + ClaudeCode 缺失 + 导航栏提醒 + "编程"→"项目" | P1 | ✅ 已修复 (2026-06-11) |
| T049 | bug | 关闭项目 Tab 重开后自定义会话命名全部丢失（ClaudeCode + CodeX） | P1 | ✅ ClaudeCode selectDir 漏传 `_userRenamed` 已修复 (2026-06-11) → CodeX 待确认复现路径 |
| T051 | bug | 系统标签剥离白名单不同步：用户 bubble 显示 SDK 注入的系统上下文（AGENTS.md / INSTRUCTIONS / 环境变量） | P0 | ✅ 统一为 helpers.js 模式匹配，覆盖 6 处调用点 (2026-06-11) |
| T052 | feature | mindcraft-agent 导入 mindcraft-electron API 配置：手动按钮触发 + 自动探测 userData + shared settings.json 兜底创建 Provider + 防重复 | P1 | ✅ 已实现 (2026-06-12) |
| T053 | bug | CodeX 系统标签泄漏：`filterCodexSystemMessages` 的 `hasRealText` 仅用剥离结果做过滤判断，未实际修改消息内容 | P0 | ✅ 已修复 (2026-06-11) |
| T054 | ux | 状态栏流速仪表盘简化：移除 input 速度（Claude 多轮上下文重复计数致数值误导），只保留 output 速度 | P2 | ✅ 已修复 (2026-06-11) |
| T055 | bug | 从首页/文档切回会话 tab 时不会自动沉底：keep-alive 恢复后 ResizeObserver 不触发 | P1 | ✅ ClaudeCode onActivated + CodeX onActivated 已修复 (2026-06-11) |
| T056 | security | API key 日志泄露：`claudeAgent.js` 和 `codexAgent.js` 的 console.log 输出 apiKeyPrefix/apiKeyLen | P0 | ✅ 已修复 — 移除 codexAgent.js 中敏感字段 (2026-06-11) |
| T057 | bug | ClaudeCode token 计数不对称：`getTokenMetrics` 中 input 取最后一轮（=），output 跨轮累加（+=），多轮后 output 虚高 → in/out 比例诡异 | P1 | ✅ 统一为 = 赋值 (2026-06-11) |
| T057 | bug | AskQuestion 10 分钟超时后发送空答案（`answers: {}`），Agent 行为未定义 | P1 | ✅ 审查确认：handleAskDialogClose 会自动选首选项，行为正确 (2026-06-11) |
| T058 | bug | PlanReview 10 分钟超时后仅关闭弹窗不发送决策，导致 Agent 永久挂起 | P1 | ✅ 已修复 — 超时改为 finishPlanReview({ type: 'reject', reason: 'timeout' }) (2026-06-11) |
| T059 | bug | CodeX 通知清除路径不完整：`onBackgroundTaskDone` 设置但无对称清除逻辑 | P2 | ✅ 已修复 — 添加 projects.flatMap watch 自动清除 (2026-06-11) |
| T060 | ux | 主题选择器 popover（`teleported=false`）可能被 sidebar `overflow:hidden` 裁剪 | P2 | ✅ 已修复 — 添加 `:popper-options="{ strategy: 'fixed' }"` 绕开 overflow 裁剪 (2026-06-11) |
| T061 | ux | Token 图表（ECharts）颜色硬编码暗色主题，在 Light/Brown 主题下不协调 | P3 | ✅ 已修复 — 引入 useClaudeThemeStore，4 套主题配色 + 切换监听 (2026-06-11) |
| T062 | perf | `speedInputPerSec` 后端仍在计算但 UI 不再展示，浪费 CPU + IPC 带宽 | P3 | ✅ 已修复 — 从 claudeAgent.js/claudeMetrics.js/codexAgent.js 移除 IPC 传输 (2026-06-11) |
| T063 | refactor | `mdRouting.js` `pendingPayloads` 无上限 + `allFilesCache` 无 TTL | P3 | ✅ 已修复 — pendingPayloads 上限 20 + 窗口关闭清空；allFilesCache 30s TTL (2026-06-11) |
| T064 | bug | npm run dev 白屏 + 僵尸进程：悬浮球 `/side` 路由经同源共享 localStorage 污染主窗口路由记忆；Electron 36 `console-message` 签名变更吞掉渲染报错 | P0 | ✅ 已修复 — 路由记忆 `/main` 白名单 + dev 守护自动退出 + predev 清端口 + 恢复 HMR (2026-06-11) (`docs/bugs/dev-white-screen-zombie-process.md`) |
| T065 | bug | 首页项目区域：①项目名始终显示"新项目"而非实际文件夹名（`project.name` 创建后永不更新）；②点击不同项目条目都跳转到最近一次项目（条目无独立点击处理，CodeHub 恢复最后活跃 Tab） | P1 | ✅ 已修复 — 从 cwd 推导项目名 + homeMetrics 暴露 projectId + Home.vue 带参数跳转 + codeHub 匹配 projectId (2026-06-12) |
| T067 | bug | 插件/Skill 市场不可用：①Skills "推荐" tab 为空（`skills-catalog.json` 文件不存在）②ClaudeCode 插件全部显示"未安装"（marketplace ID 不匹配） | P1 | ✅ 已修复 — 构建时生成 catalog + 运行时 API 兜底 + 插件 name-based fallback 匹配 (2026-06-12) |

## T047 详情：工具栏 @ 选择文件时输入框有文字就选不了

### 现象

工具栏 @ 按钮点击后，若输入框里已有文字，则：
- 文件选择弹窗可能不出现；
- 或者弹窗出现了但点击某个文件后没有任何反应（文字没有插入）。

### 根因分析

**关键正则**：`(?:^|\s)@([^\s@]*)$` —— 要求 `@` 前面必须是空白字符或行首。

**问题链路**：

1. `triggerMention()`（`claudeCode/index.vue:1387` / `codeX/index.vue:580`）调用 `insertTextAtCaret('@')`
2. `insertTextAtCaret` 把 `@` 直接插到已有文字末尾，例如 `"hello"` → `"hello@"`（**没有前导空格**）
3. 值变更触发 `@input` → `onInputChange(e)` 同步执行
4. `onInputChange` → `extractMentionQuery(inputText, selectionStart)` 查 `"hello@"`，正则 `(?:^|\s)@` 不匹配（`o` 在 `@` 前面但不是空白）→ 返回 `null` → `clearMentionSuggestions()`
5. 虽然 `triggerMention` 的 `nextTick` 里显式调了 `refreshMentionSuggestions('')` 试图补刀，但这一步已经产生竞争
6. 即使弹窗出现了，用户点击某一项 → `applyMention(item)`（`claudeCode/index.vue:1364` / `codeX/index.vue:539`）**同样用同一个正则去定位 `@`** → 正则不匹配 → **`if (!match) return` 静默返回，什么都不发生**

### 影响范围

- `packages/agent/src/components/claudeCode/index.vue` — `triggerMention()` (L1387)、`applyMention()` (L1364)
- `packages/agent/src/components/codeX/index.vue` — `triggerMention()` (L580)、`applyMention()` (L539)

### 修复方向

`triggerMention()` 中，读取光标前字符，若为有效文字（非空/非空白），则插入 ` @`（带前导空格）而非 `@`：

```js
function triggerMention() {
  const text = inputText.value || ''
  const el = inputEl.value
  const caretPos = Number.isInteger(el?.selectionStart) ? el.selectionStart : text.length
  const charBefore = caretPos > 0 ? text[caretPos - 1] : ''
  const needsSpace = charBefore && charBefore !== ' ' && charBefore !== '\n'
  insertTextAtCaret(needsSpace ? ' @' : '@')
  nextTick(() => {
    refreshMentionSuggestions('')
    inputEl.value?.focus()
  })
}
```

### 备注

- 手动敲 `@` 触发 mention 的路径不受影响（用户自然会敲空格或从行首开始）
- 两个 Agent 的实现几乎一样，应该统一修复

## T048 详情：CodeX "额外目录" 默认展开/收缩 + 缓存问题

### 现象

1. **默认展开**：不管有没有设置额外目录，"项目设置"区域始终默认展开
2. **缓存丢失**：选择过的额外目录文件夹在关闭侧栏/刷新/切换项目后可能消失

### 根因分析

#### 子问题 A：默认展开/收缩

`HistorySidebar.vue:224`：

```js
const psExpanded = ref(true)   // 永远 true
```

没有根据 `projectAdditionalDirs` 是否有值来初始化。

#### 子问题 B：缓存/数据流断裂

数据流有两条路径，存在不一致：

**路径 1（IPC 持久化）—— 主进程正常**：
- `setProjectAdditionalDirs()` → `codexSetProjectSettings(cwd, {additionalDirectories})` → 主进程 `Conf` 写入磁盘 ✅
- `loadProjectSettings()` → `codexGetProjectSettings(cwd)` → 主进程 `Conf` 读取 ✅

**路径 2（面板状态序列化）—— 缺失 `additionalDirectories`**：
- `useCodexHistory.js` `buildPanelState()` (L76-89)：序列化 `projects` 时 **没有包含 `additionalDirectories`**
- `applyProjects()` (L131-148)：恢复 project 对象时 **没有恢复 `additionalDirectories`**
- `loadProjectSettings()` 只在 `switchProject` 首次（`_settingsLoaded === false` 时）调用一次

**问题场景**：
1. 用户添加额外目录 → `additionalDirectories` 写入内存（project 对象）和 IPC 持久层
2. 面板状态序列化时丢失该字段 → 若发生面板状态重建（如 `applyProjects`），project 的 `additionalDirectories` 变为 `undefined`
3. 此后需等待 `switchProject` → `loadProjectSettings` 异步补回 → 但若 `_settingsLoaded` 已是 `true`，**不会再加载**
4. 用户看到：文件夹没了

### 影响范围

- `packages/agent/src/components/codeX/components/HistorySidebar.vue` — `psExpanded` (L224)
- `packages/agent/src/components/codeX/composables/useCodexHistory.js` — `buildPanelState` (L76)、`applyProjects` (L131)
- `packages/agent/src/components/codeX/index.vue` — `loadProjectSettings` (L363)、`setProjectAdditionalDirs` (L332)

### 修复方向

**子问题 A**：
```js
// 根据是否有目录来决定默认展开/收缩
const psExpanded = ref(props.projectAdditionalDirs?.length > 0)
// 或者 watch projectAdditionalDirs 变化来联动
```

**子问题 B**：
1. `buildPanelState()` 中序列化 `additionalDirectories: p.additionalDirectories || []`
2. `applyProjects()` 中恢复 `additionalDirectories: p.additionalDirectories || []`
3. 或者：保持 IPC 持久化为主路径，但确保 `loadProjectSettings` 在每次 project 激活时都可靠执行（去掉 `_settingsLoaded` 的一次性限制，改用更稳健的策略）

## T050 详情：任务完成通知系统修复

### 问题

1. **提示音不稳定**：codeX 每次创建/销毁 AudioContext 可能被 autoplay 策略挂起；ClaudeCode 完全没有提示音
2. **导航栏缺少提醒**：后台项目结束后，侧边栏"项目"图标不会亮，用户不知道有任务完成
3. **"编程"命名不直观**：侧边栏导航项叫"编程"，用户觉得"项目"更准确
4. **任务栏闪烁确认**：验证 flashFrame 链路完整

### 修复

1. **提示音**：提取 `playDoneSound` 到 `agentCommon/utils/playDoneSound.js`，使用持久 AudioContext + 播放前 `resume()`；ClaudeCode 补上 `onTaskDone` 回调；提示音移到 `shouldNotifyOnTaskDone` 之外 — **任何任务完成都响，不受窗口焦点/活跃 Tab 影响**
2. **侧边栏提醒**：Main.vue 提供 `codehubHasNotification` ref，codeHub 监听 `unifiedTabs` 中 `hasDoneNotification` 并更新；侧边栏"项目"图标增加脉冲动画 + 右上角橙色圆点
3. **重命名**：`src/Main.vue` 侧边栏标签和 title `"编程"` → `"项目"`
4. **任务栏闪烁**：`flash-taskbar` IPC → `win.flashFrame(true)` 链路完整，仅在后台/非活跃项目时触发

### 影响文件

- `packages/agent/src/components/agentCommon/utils/playDoneSound.js` (新增)
- `packages/agent/src/components/codeX/index.vue` — 改用共享 playDoneSound
- `packages/agent/src/components/codeX/composables/useCodexAgentStream.js` — onTaskDone 移到 shouldNotifyOnTaskDone 之外
- `packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js` — 新增 onTaskDone 参数 + reason 判断
- `packages/agent/src/components/claudeCode/index.vue` — 引入 playDoneSound，传入 useClaudeAgentStream
- `packages/agent/src/components/codeHub/index.vue` — inject codehubHasNotification，watch unifiedTabs
- `src/Main.vue` — provide codehubHasNotification，侧边栏通知 CSS，标签重命名

## T053 详情：CodeX `filterCodexSystemMessages` 系统标签泄漏

### 现象

CodeX 刷新后，用户气泡显示 SDK 注入的完整系统上下文：`<INSTRUCTIONS>`（含 AGENTS.md 全文）、`<environment_context>`（cwd/shell/date）等 XML 块，以及 "AGENTS.md instructions for ..."、bash 命令等非 XML 前缀文本。

### 根因

`filterCodexSystemMessages`（CodeX 的 JSONL 消息过滤管线）在处理 `role === 'user'` 消息时：

1. `stripCodexSystemContextTags` 被调用**仅用于 `hasRealText` 判断**（决定是否过滤整条消息）
2. **从不修改消息的 `m.text` / `m.content`**——系统标签原封不动保留
3. 消息通过过滤后直接展示，含全部系统上下文

对比 ClaudeCode 的 `normalizeFlatSessionMessagesToUiMessages` / `normalizeSessionEventsToUiMessages`——它们在构建 `out.push({text: ..., content: ...})` 时使用剥离后的文本。

### 修复

在 `filterCodexSystemMessages` 的 `role === 'user'` 处理末尾，`hasRealText` 检查通过后、返回前，显式对 `m.text` 和 `m.content` 的每个文本块调用 `stripCodexSystemContextTags` 进行剥离。

改动量：CodeX `index.vue` 中 `filterCodexSystemMessages` 函数内加 10 行（两个仓库同步）。

### 影响文件

- `packages/agent/src/components/codeX/index.vue` — `filterCodexSystemMessages`（L2241 后）
- `packages/agent/src/components/codeX/index.vue` — mindcraft-electron 同步

### 备注

- 非 XML 前缀文本（如 "AGENTS.md instructions for ..." 行）不属于 XML 标签剥离范围，需要后续考虑是否用模式匹配处理
- ClaudeCode 不受影响——它的 normalize 函数一直在正确剥离

## T045 当前状态

- `packages/agent` 已落地，包含 renderer / electron / preload 三个入口
- Full 版宿主已经切到共享层接线
- 旧的宿主侧 Agent 主体实现已移除，不再保留双份源码
- 关键回归与构建已通过
- 当前阶段不再继续大规模拆分，后续以正常修 Bug 和支撑 `mindcraft-agent` 复用为主

## mindcraft-agent 下一步建议

1. 明确 `mindcraft-agent` 保留的 Agent 能力边界。
2. 先做宿主层裁剪设计，不急着继续拆共享层。
3. 只有出现 Full / Agent 明确分叉点时，再追加共享配置抽象。

## 最近完成

| 日期 | 分类 | 说明 |
|------|------|------|
| 2026-06-13 | refactor | Chat：删除 Chat Completions 回退，统一用 Responses API；新增 `reasoning_summary_text.delta` 处理；CodeX 通路 60s 超时 + thinking 50K 上限；渲染端 timeout stop_reason 处理；gitignore `_test/` 测试目录（commit `d1eb6d2`） |
| 2026-06-13 | bug | Chat thinking/卡死修复（commit `b19846b`）：Anthropic 通路 thinking 50K 上限 + 60s 超时；实测 `thinking: { type: 'disabled' }` 对 deepseek-v4-flash 有效；实测 OpenAI 通路 `reasoning.effort` 影响耗时但 reasoning 文本几乎不可见 |
| 2026-06-12 | housekeeping | 死依赖清理（T069）：移除 19 个未使用 npm 包 + 5 个死代码文件 + .babelrc + vite vendor chunk，node_modules 减少约 90 MB |
| 2026-06-12 | bug | 修复表格渲染失败：①表头/数据行检测从严格正则切换为 splitTableRow + 列数一致性校验，支持缺首尾管道格式（`A \| B` / `\| A \| B`）②分隔行连字符 ≥3 放宽为 ≥1（对齐 GFM）③段落断行同步更新防止贪婪吃掉表格行。新增 14 项表格测试覆盖 GFM 变体/防误报/路径链接共存/块元素组合 |
| 2026-06-12 | bug | 修复 T067 插件/Skill 市场不可用：①Skills "推荐" tab 为空 — 新增 `build/generate-skills-catalog.js` 构建时从 agent-skills-cli API 拉取 Top 100 生成 catalog 文件，skills-get-state handler 增加运行时 API 兜底 ②ClaudeCode 插件全部"未安装" — plugins-get-state 增加 name-based fallback 匹配解决 marketplace ID 不一致 |
| 2026-06-11 | bug | 修复 T057 ClaudeCode token 计数不对称：`getTokenMetrics` 中 input 取最后一轮（=）而 output 跨轮累加（+=），多轮对话后 in/out 比例诡异。统一为 = 赋值对齐 CodeX |
| 2026-06-12 | bug | 修复 T066 CodeX 对话卡住/中断 6 项：G1(前端返回值检查+锁定时序修复，~28行)/G2(thread.error→resultReceived，+3行)/G3(slowNotice+subtype+渲染，+8行)/G4(abortSession→await，~6行)/O1(return 0→结构化拒绝，改2行)/O2(late event _awaitingDone guard，1行)。核心思路：闭合前后端状态同步反馈缺口，不新增状态标志 |
| 2026-06-11 | bug | 修复 T064 dev 白屏+僵尸进程：`/side` 路由污染共享 localStorage 路由记忆（白屏根因，与端口无关）；修复 Electron 36 console-message 签名导致渲染报错被吞；新增 dev 守护自动回收孤儿进程 + 路由自检日志；恢复 HMR |
| 2026-06-11 | feature | 实现 T052 mindcraft-agent 一键导入 mindcraft-electron API 配置：Settings UI 增加按钮 + IPC handler + 多候选目录探测 + 文件夹选择兜底 |
| 2026-06-11 | bug+ux | 修复 T050 任务完成通知系统：提示音共享化/持久 AudioContext/ClaudeCode 补全/始终播放；侧边栏"项目"脉冲提醒；"编程"→"项目"；flashFrame 链路确认 |
| 2026-06-11 | bug | 修复 T055 从首页/文档切回会话 tab 不自动沉底：ClaudeCode onActivated + CodeX onActivated 中调用 scrollToBottom |
| 2026-06-11 | ux | 修复 T054 状态栏流速仪表盘：移除 input 速度，只保留 output 速度（in/out 双指标语义混淆 + Claude inputPerSec 多轮重复计数虚高） |
| 2026-06-12 | bug | 修复 T065 首页项目区域两个 bug：①项目名始终显示"新项目"——从 cwd 推导文件夹名（homeMetrics.js Claude `/[/\\]/` + CodeX `.replace(/\\/g,'/').split('/')`）；②点击不同项目都跳最近一个——homeMetrics 暴露 projectId + Home.vue `@click.stop` 带 `?agent=&projectId=` 跳转 + codeHub `restoreActiveTab()` 优先匹配 projectId |
| 2026-06-12 | doc | 创建打包/部署文档 `docs/build-and-deploy.md`：build.js 已知坑、正确打包命令、版本发布 step-by-step、图标缓存、latest.yml 上传清单、常见问题；更新 CLAUDE.md Build & Deploy Rules 章节 |
| 2026-06-12 | bug | 修复 T060-D 竞态修复的 keep-alive 回归：afb16f5 "始终排队到 pendingPayloads" 导致 mdViewer 已打开时新文档无人消费——onMounted 只调用一次 `getPendingMdContent`，keep-alive 保留组件实例后不再触发。改为双通道：入队兜底 + mdViewerReady 时直投 `send('md-content')`。`did-start-loading` 重置标志保证刷新场景不误投 |
| 2026-06-11 | bug | 修复 T053 CodeX `filterCodexSystemMessages` 系统标签泄漏：`hasRealText` 仅用剥离结果做过滤，未实际修改消息 `m.text`/`m.content` → `<INSTRUCTIONS>`/`<environment_context>` 原封不动展示 |
| 2026-06-11 | bug | 修复 T047/T048 @ 工具栏选择文件、目录钻入、平铺模式；CodeX 额外目录缓存 |
| 2026-06-11 | bug | 修复 T049 ClaudeCode 关闭 Tab 重开后自定义命名丢失：`selectDir` 漏传 `_userRenamed`（mindcraft-electron 同步修复） |
| 2026-06-11 | doc | 创建跨 Agent 会话陷阱全景图 `docs/session-pitfalls.md`，新增 5 大 trap pattern 和排查决策树；补充 agent-architecture.md 会话管理章节；更新 CLAUDE.md 排查路由 |
| 2026-06-11 | bug | 修复 T046 P0 根因 E/B/A：中断恢复死锁、Provider 切换清空 cliSessionIds、多 pending 盲匹配 |
| 2026-06-11 | bug | 修复 T046 P1/P2 根因 C/D：错误路径孤儿 JSONL（finally 块 fallback 扫描）、hasPendingNewChat 过时（循环内重新计算） |
| 2026-06-11 | bug | 修复 T046 P0-A 回归：`for await` 循环中 `sender` TDZ 错误，首次对话抛出 "Cannot access 'sender' before initialization"（`claude-agent-early-cli-session` 调用在 `const sender` 声明之前） |
| 2026-06-11 | bug | 定位 T046 ClaudeCode 会话重复的 5 个根因（A-E），更新专题文档 `docs/bugs/claude-session-duplicate-split.md` |
| 2026-06-10 | bug | 修复 Codex 同一 `sessionId` 重复 query 造成多次 cleanup / 旧 turn 收尾误清新 turn 状态的问题；主进程增加 run ownership，重复运行中请求直接忽略，cleanup/done/metrics 仅作用于当前 run |
| 2026-06-10 | bug | 补强 ClaudeCode 会话”接力”问题：加载/保存/刷新时清理重复 jsonl 绑定，补齐 active project/chat fallback，并同步 codeHub 顶部 tab；同日继续复现后确认还存在 renderer session 身份污染链路 |
| 2026-06-10 | bug | 修复 Claude 任务面板在会话内全局递增 task id 场景下无法收口的问题，改为 `TaskCreate -> 真实 task.id -> TaskUpdate` 显式绑定链路 |
| 2026-06-09 | refactor | 完成 Agent 抽离 Phase A，共享层收敛到 `packages/agent/**` |
| 2026-06-09 | bug | 修复 ClaudeCode 历史恢复时误切到旧会话的问题，恢复上次激活的 project/chat |
| 2026-06-09 | bug | 修复共享层 `localSearch` 的 bundled `rg` 路径与建议链路问题 |
| 2026-06-08 | bug | 修复 Codex 会话生命周期、状态栏、diff 恢复与任务卡显示等一轮问题 |

## 2026-06-12 Local Notes

- doc viewer: synced `src/components/mdViewer/viewerRegistry.mjs` code-text extensions with `electron/mainModules/documentLocator.js`
- added preview coverage for `.py`, `.java`, `.toml`, `.env`, `.sh`, `.c`, `.hpp`
- verified with:
  - `node --test tests/document-viewer-registry.test.mjs`
  - `node --test tests/document-tabs.test.mjs`
  - `node --test tests/document-locator.test.cjs`
- table rendering: fixed GFM pipe/hyphen detection in `render.js` (`splitTableRow` + column-count gating), 14 new tests in `agent-markdown-render.test.mjs`
- mdRouting: fixed T060-D regression — `afb16f5` always-queue broke keep-alive path; restored dual-channel (queue safety net + direct `send('md-content')` when `mdViewerReady`). Cross-commit analysis confirmed no other conflicts among 13 commits (2026-06-12)

## T068 详情：简易对话（Chat）功能方案

### 第二轮修复（2026-06-12，commit `deace67`）

用户实测反馈 9 项问题，全部修复：

1. **流式不生效/挂起**：根因是 `stream.finalMessage` 被当属性用（实为方法）；另移除 done 事件竞态，invoke 返回值为权威结果；所有流事件带 `chatId` 防串流
2. **看不到用户气泡**：用户消息现在先入会话再发请求（会话消息 = 单一数据源，API 消息按 provider 重建）
3. **模型选择**：接口分类（Anthropic/OpenAI）+ 从已配置 Provider 读取 tier 模型（Haiku/Sonnet/Opus/Reasoning）
4. **思考档位**：关/低/中/高 segmented 控件；Claude→budget_tokens(2048/8192/16384)，OpenAI→reasoning_effort；旧字段 thinkingEnabled/thinkingBudget 自动迁移为 thinkingLevel
5. **图片输入**：复用 useImageAttachments + ImageAttachmentBar，粘贴/拖拽即显示，多图上限 10
6. **死循环防护**：主进程 abort handler（claude/codex-chat-abort + AbortController Map）、SDK maxRetries:0、90s 无活动看门狗、工具循环上限 5
7. **等待提示 + 停止**：等待响应/深度思考中（N 字）指示、流式中红色停止按钮
8. **会话重命名**：双击标题或悬停编辑按钮内联改名；默认标题取首条用户消息前 30 字
9. **位置调整**：对话入口移至文档之后（侧边栏 + 首页卡片）

### 第三轮修复（2026-06-13，commits `b19846b` + `d1eb6d2`）

**问题**：deepseek-v4-flash 卡死（thinking 内容无上限 + 无总体超时）

**修复**：
- Anthropic + CodeX 两条通路均加安全上限：`MAX_THINKING_CHARS = 50_000`、60s `AbortSignal.timeout`
- Anthropic thinking 关闭：发送 `thinking: { type: 'disabled' }`（实测有效）
- CodeX 统一用 Responses API（删除 Chat Completions 回退）+ 新增 `reasoning_summary_text.delta` 事件处理
- 渲染端新增 `stop_reason: 'timeout'` 处理，显示错误并清理空气泡

**API 测试结论**（`_test/` 目录，已 gitignore）：

| 模型 | `reasoning_text.delta` | `reasoning_summary_text.delta` | effort 影响耗时 |
|------|:---:|:---:|:---:|
| deepseek-v4-flash (Anthropic) | N/A | N/A | `type: 'disabled'` 有效（0 chars thinking） |
| gpt-5.4 (Responses) | ❌ 0/3 | ⚠️ 1/3（非确定性） | ✅（none ~9s → medium ~15s → high ~42s） |
| gpt-5.5 (Responses) | ❌ 0/6 | ❌ 0/6 | ✅（none ~19s → medium ~35s） |

### 第四轮修复（2026-06-13）：qwen3.7-plus SSE 解析兼容

**问题**：qwen3.7-plus 模型返回空响应（含图片和无图片均空）。

**根因**：`claudeAgent.js` SSE 解析器检查 `startsWith('data: ')`（带空格），但 qwen3.7-plus 返回的 SSE 格式是 `data:{"type":...}`（无空格），所有事件被静默丢弃。

**跨模型 SSE 格式差异**（api.mindcraft.com.cn）：

| 模型 | SSE data 行格式 |
|------|------|
| deepseek-v4-pro | `data: {...}` (有空格) |
| deepseek-v4-flash | `data: {...}` (有空格) |
| **qwen3.7-plus** | **`data:{...}` (无空格)** ← Bug |
| claude-sonnet-4 | `data: {...}` (有空格) |

**修复**：`claudeAgent.js:1964` + `codexAgent.js:3420` 改为 `startsWith('data:')` + `trimmed.slice(5).trim()`，兼容两种格式。

### 第五轮修复（2026-06-13）：上下文自动压缩 + UI 清理

**新增**：`useChatStream.js`
- 粗糙 token 估算（中文 ~1.5 chars/token），模型对应上下文窗口（claude 180K / qwen/deepseek 100K / gpt-5 200K）
- 发送消息前自动检查：估算 token 超 70% 窗口时静默调用 `compressContext()` 压缩历史
- API 返回 `context_length_exceeded` 类错误时，提示用户手动压缩

**删除**：`ChatView.vue` 顶部右侧的 Claude/CodeX provider 标签（用户认为无意义）

### 定位

不绑定文件夹的轻量对话。豆包风格界面，解决「选文件夹太重」的痛点。

### 方案决策（2026-06-12 讨论结论）

- **路径 B**：新增独立 Agent 类型和组件，不复用现有 claudeAgent/codexAgent 引擎（太重，3000+ 行，深度绑定项目）
- **Provider 复用**：读取用户已在 ClaudeCode/CodeX 中配好的 API Key/URL/Model，零新配置
- **API 直调**：Anthropic Messages API（Claude 通路）+ OpenAI Responses API（CodeX 通路），绕过现有 Agent 引擎
- **第一期能力**：知识问答 + 网页搜索 + 图片输入
- **第一期不做**：文件解析（解析库 mammoth/xlsx/pdfjs-dist 是宿主 App 独占依赖，对 Agent 流程无用）
- **网页搜索**：自建通用 `web_search` tool schema，Electron 主进程执行 HTTP 搜索，结果回传 LLM
- **Agent 工具路由**：自建轻量 tool loop（~150 行），处理 tool_use → 执行 → tool_result 循环

### 组件树

```
ChatView.vue                    ← 新增，路由 /main/chat
├── ChatSidebar.vue             ← 对话列表（Step 6）
├── ChatMessageList.vue         ← 复用 agentCommon 渲染层
├── ChatInput.vue               ← 底部输入区
│   ├── ImageAttachmentBar      ← 复用
│   ├── 模型选择器 + 思考开关
│   ├── 搜索开关
│   └── 发送按钮
└── ImageLightbox               ← 复用
```

### 实现步骤

| Step | 内容 | 预估 |
|------|------|:---:|
| 1 | ChatView.vue + 路由 + 侧边栏入口 | ~200 行 |
| 2 | chatApi.js：读 Provider + Anthropic Messages API streaming | ~150 行 |
| 3 | Agent tool loop：web_search 工具 + 执行 + 回传 | ~100 行 |
| 4 | OpenAI Responses API adapter | ~100 行 |
| 5 | 图片输入（复用 useImageAttachments） | ~80 行 |
| 6 | 会话持久化 + 对话列表 | ~150 行 |
| 7 | 思考模式 + 深度选择 | ~50 行 |

**总预估：~800 行新增代码**。详见 `docs/chat-feature-plan.md`。

## T069 详情：死依赖清理

### 清理内容

移除 19 个未使用的 npm 包 + 对应死代码文件：

**删除的 dependencies（运行时）：**
- `browser-image-compression` — 未使用（useImageAttachments 直接 FileReader）
- `fabric-with-erasing` — 未使用（截图标注遗留）
- `js-audio-recorder` — 未使用（T039 语音功能未实现，包已放置）
- `marching-squares` — 已删（base64.js 的边缘工具函数）

**删除的 devDependencies（构建/工具）：**
- `babel-core`, `babel-loader`, `babel-preset-env`, `babel-preset-es2015`, `babel-preset-stage-0`, `babel-register` — Webpack 时代遗留，项目已用 Vite
- `@vue-office/docx`, `@vue-office/excel` — 从未被 import
- `exceljs`, `docx` — 从未被 import
- `jspdf`, `html2canvas`, `html2pdf.js`, `dom-to-image` — 从未被 import
- `file-saver`, `qrcode` — 从未被 import
- `mammoth`, `xlsx`, `pdfjs-dist`, `mockjs` — 仅被已删除的 UploadFile/fileHandler/mock 引用

**删除的死代码文件：**
- `.babelrc` — Babel 配置（Vite 不需要）
- `src/utils/fileHandler.js` — mammoth/xlsx/pdfjs-dist 的文件解析逻辑（仅 UploadFile 使用）
- `src/components/UploadFile/index.vue` — 文件上传/解析组件（依赖 fileHandler.js）
- `src/mock/index.js` — Mock 数据（依赖 mockjs）
- `src/utils/base64.js` — 边缘工具（依赖 marching-squares）

**构建配置更新：**
- `vite.config.js` — 移除 `vendor-doc-preview` 手动分块（mammoth/pdfjs-dist 已删除）

### 影响评估

- 构建通过，无引用断裂
- node_modules 减少约 90 MB
- 不影响 ClaudeCode/CodeX Agent 流程（仅删除宿主 App 独占功能）
- 文档预览（mdViewer）不受影响（UploadFile 和 mdViewer 是不同的功能）
