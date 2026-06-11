# TODO

> 最后更新：2026-06-11
>
> ⚠️ **会话相关 bug 排查第一入口**：`docs/session-pitfalls.md`（跨 Agent 陷阱全景图）

## 当前重点

| 编号 | 分类 | 说明 | 优先级 | 状态 |
|------|------|------|:------:|------|
| T039 | feature | 语音输入能力：支持把语音转文字输入到编程智能体对话 | P1 | 方案设计中 |
| T040 | eval | Remote 远程接入方案研究与实现 | P1 | 待开始 |
| T041 | refactor | mindcraft-agent 重构：在共享 Agent 层基础上裁剪宿主能力与导航 | P1 | 方案评审中 |
| T045 | refactor | Agent 抽离：提取 Claude / Codex / codeHub / agentCommon 为共享 `packages/agent` 层 | P1 | Phase A 已完成，进入稳定与复用阶段 |
| T046 | bug | ClaudeCode 会话重复 / 接力问题：重复 jsonl 绑定、active 丢失、renderer session 身份污染 | P0 | ✅ 5 个根因全部修复 (2026-06-11) (`docs/bugs/claude-session-duplicate-split.md`) |
| T047 | bug | 工具栏 @ 选择文件时输入框有文字就选不了（ClaudeCode + CodeX 共性问题） | P1 | ✅ 已修复 (2026-06-11) |
| T048 | bug | CodeX "额外目录"：默认展开/收缩逻辑缺失 + 缓存/数据流可能断裂 | P2 | ✅ 已修复 (2026-06-11) |
| T050 | bug+ux | 任务完成通知系统修复：提示音稳定性 + ClaudeCode 缺失 + 导航栏提醒 + "编程"→"项目" | P1 | ✅ 已修复 (2026-06-11) |
| T049 | bug | 关闭项目 Tab 重开后自定义会话命名全部丢失（ClaudeCode + CodeX） | P1 | ✅ ClaudeCode selectDir 漏传 `_userRenamed` 已修复 (2026-06-11) → CodeX 待确认复现路径 |

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
| 2026-06-11 | bug+ux | 修复 T050 任务完成通知系统：提示音共享化/持久 AudioContext/ClaudeCode 补全/始终播放；侧边栏"项目"脉冲提醒；"编程"→"项目"；flashFrame 链路确认 |
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
