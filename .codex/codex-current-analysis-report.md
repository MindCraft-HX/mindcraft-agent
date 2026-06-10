# codeX 现状分析报告

日期：2026-05-26

范围：
- `src/components/codeX`
- `src/components/claudeCode`
- `electron/mainModules/codexAgentSdk.js`
- `electron/mainModules/claudeAgent.js`
- `electron/preload.js`

## 1. 结论摘要

当前 `src/components/codeX` 不是一个独立完成度较高的 Codex 面板，而是一个“从 `claudeCode` 复制后，做了部分 IPC / SDK 替换”的半迁移版本。

它现在的主要问题不是单点 bug，而是整体架构还停留在“Claude UI 壳 + Codex 基础流式事件映射”的状态：

- UI 层大量直接引用 `claudeCode` 组件，`codeX` 自己目录下已有的一部分组件实际上没有被使用。
- 前端交互模型仍沿用 Claude 的会话/权限/问答/历史展示方式，但 Codex 后端没有提供对应事件或接口。
- Codex SDK 事件模型和 Claude Agent 事件模型不同，当前 `useCodexAgentStream` 只做了薄映射，缺少完整状态机。
- 历史会话目前只是“保存当前面板状态”，不是像 Claude 那样能从真实会话文件/CLI 会话中扫描、恢复、分页加载。
- 权限询问、追问、计划面板、消息卡片虽然 UI 看起来像有，但有一部分实际上没有真实数据源支撑。

换句话说：目前的 `codeX` 更接近“能发消息、能显示部分流式结果的演示版”，还不能视为和 `claudeCode` 对齐的生产级实现。

## 2. 当前实现状态判断

### 2.1 codeX 仍然高度依赖 claudeCode 组件

`src/components/codeX/index.vue` 中直接从 `claudeCode` 引入了大量组件：

- `ProjectTabs`
- `SlashPopup`
- `MentionPopup`
- `InputToolbar`
- `ConfirmDialog`
- `SelectModel`
- `HistorySidebar`
- `ImageAttachmentBar`
- `ImageLightbox`
- `MessageList`
- `PlanModePanel`
- `AskQuestionDialog`
- `StatusBarMetrics`
- `ScrollToBottom`
- `ScrollToPrevMsg`

这说明：

- `codeX` 当前不是独立视图体系。
- `src/components/codeX/components/messages/*` 等文件虽然存在，但主入口实际没用它们。
- 后续一旦 Claude 组件继续演进，Codex 页面会被动继承 Claude 的行为和假设，进一步扩大耦合。

### 2.2 codeX 自己目录里有一批“复制后未切换”的文件

从代码结构看，`codeX` 目录里已有这些文件：

- `components/messages/MessageList.vue`
- `components/messages/AskQuestionDialog.vue`
- `components/messages/*`
- `components/SelectModel.vue`
- `components/InputToolbar.vue`

但主入口 `src/components/codeX/index.vue` 仍然从 `claudeCode` 导入同名组件，而不是从 `./components/...` 导入。

这说明当前存在两套实现：

- 一套是 `codeX` 目录里复制出来但未真正接管的文件。
- 一套是运行时仍然依赖的 `claudeCode` 文件。

这会造成后续维护时的典型问题：

- 改了 `codeX/components/*` 但页面不生效。
- 页面表现依然受 `claudeCode` 影响。
- 很难判断“哪个文件才是真正在线上执行的版本”。

## 3. 已确认的核心问题

## 3.1 历史对话实现不完整，当前不是 Claude 那种真实会话恢复

### codeX 当前已有的能力

`useCodexHistory.js` 只做了这几件事：

- 保存当前面板状态到 `~/.codex/codex-panel-state.json`
- 恢复 `projects/chats/messages`
- 保存 `sessionId / cliSessionId / runMode / cwd`

这只是“前端面板快照持久化”，不是完整会话历史系统。

### 与 Claude 的差异

Claude 侧除了面板状态，还有完整会话恢复链路：

- `claudeScanProjectsSessions`
- `claudeReadSessionFile`
- `claudeReadSessionFileRange`
- `claudeScanCliSessions`
- `claudeGetLastCompactSummary`

而 Codex 侧没有对应能力：

- 没有扫描真实项目会话
- 没有分页读取历史消息
- 没有基于 CLI/thread 的历史恢复
- 没有 compact/summary 相关恢复

### codeX 当前实现里的具体缺陷

1. `makeRestoredChat()` 没有建立 `_fullMessages`

Claude 的历史加载、懒加载、滚动恢复依赖 `_fullMessages` 作为完整消息缓存；Codex 这边恢复的 chat 结构里只有：

- `messages`
- `visibleStart`
- `currentAssistantId`

没有 `_fullMessages`。

但 `useCodexAgentStream` 和 `loadMoreHistory()` 又在尝试使用 `_fullMessages`，结果是：

- 运行期新增消息会判断 `_fullMessages` 是否存在
- 历史加载逻辑会判断 `_fullMessages` 是否存在
- 实际恢复出来的 chat 默认没有这个字段

这会导致“看起来有加载更多逻辑，实际永远走不起来”。

2. `loadMoreHistory()` 逻辑基本不可用

当前 `codeX/index.vue` 的 `loadMoreHistory()` 只有：

- 如果 `tab._fullMessages` 是数组，则从中 slice 更多消息

但现状里：

- 恢复 chat 不带 `_fullMessages`
- 发送消息时也没有统一维护 `_fullMessages`
- 后端没有分页读取接口

所以这个能力目前基本只是占位。

3. 历史恢复不是“真实来源恢复”，而是“上次内存状态快照”

这类实现有明显局限：

- 应用异常退出时流式中的数据可能不完整
- 如果某次消息没被及时保存，会直接丢失
- 无法像 Claude 那样在本地真实 session 文件中回溯更长历史
- 无法做大历史量的惰性加载

结论：`历史对话` 在 Codex 侧当前只能算“基础面板状态保存”，不能算完整实现。

## 3.2 权限询问链路不闭环，前后端存在断点

### 表面上已有的部分

Codex 前端确实有：

- `window.electronAPI.onCodexAgentPermission`
- `window.electronAPI.codexPermissionResponse`
- `useCodexAgentStream.onAgentPermission()`
- 工具消息卡片里的 pending permission UI

Codex 后端也有：

- `codex-get-permission-policy`
- `codex-set-permission-policy`
- `codex-permission-response`

### 真实问题

`electron/mainModules/codexAgentSdk.js` 中虽然有：

- `pendingPermissionResolvers = new Map()`

但代码里没有看到：

- 将 Codex SDK 的权限请求事件转成 `codex-agent-permission`
- 将某个 `requestId` 的 resolver 注册进 `pendingPermissionResolvers`

也就是说目前缺失关键桥接：

1. SDK 发出权限请求事件
2. 主进程收到并缓存 resolver
3. 主进程向渲染层发 `codex-agent-permission`
4. 前端确认后回传 `codex-permission-response`
5. 主进程 resolve SDK 的等待

现在第 2 到第 4 步只有“壳”，第 1 和第 2 的关键接线没有完成。

### 额外问题

`respondPermission(msg)` 当前无论用户选什么，都是：

- 直接 `allowed: true`

也就是说前端侧甚至还没有真正消费“允许/拒绝”结果。

结论：`权限询问` 当前是“UI 和接口名存在，但真正运行链路没有闭环”。

## 3.3 Ask Question / 用户追问能力在 Codex 侧基本未接入

### 当前状态

`codeX/index.vue` 中有：

- `AskQuestionDialog`
- `askDialogVisible`
- `askDialogQuestions`
- `respondAskQuestion()`

但实际没有看到：

- `onCodexAgentAskQuestion`
- `codexAskQuestionResponse`
- 后端 `codex-agent-ask-question`
- 后端 `codex-ask-question-response`

前端现有代码里：

- `respondAskQuestion(msg)` 只是把消息状态改为 done
- `handleAskDialogAnswer()` 只是关闭对话框
- `askDialogQuestions` 没有真正被赋值

这说明：

- Ask Question UI 是从 Claude 复制来的
- 但 Codex 没有相应事件源
- 当前这部分功能是未接入状态，不是 bug 修一下就能通

结论：`追问/选择题/请求用户输入` 当前在 Codex 侧实质上未实现。

## 3.4 流式返回格式只完成了基础映射，未形成完整消息状态机

### Codex 侧当前已做的映射

`useCodexAgentStream.js` 目前处理了这些 item：

- `agent_message`
- `reasoning`
- `command_execution`
- `file_change`
- `mcp_tool_call`
- `web_search`
- `todo_list`
- `error`

这是一个合理的起点，但完成度仍然偏低。

### 主要差异点

Claude 的流式消息模型是：

- `assistant` text block
- `tool_use`
- `tool_result`
- `thinking`
- `system`
- `result`

Codex SDK 是：

- `thread.started`
- `item.started / updated / completed`
- `turn.completed / failed`
- `thread.error`

两套模型差异非常大。当前 Codex 只是把 item 转成前端消息，但没有像 Claude 那样形成细致的状态流。

### 已确认的问题

1. `agent_message` 文本拼接逻辑不完整

当前逻辑：

- 第一次收到 `agent_message` 时创建 assistant 消息
- 后续只在 `isFinal` 时把 `currentAssistantId` 清空

但没有看到对增量文本拼接的完整处理。

如果 Codex SDK 的 `agent_message` 在 `updated` 阶段是增量/分段更新，当前实现可能：

- 只显示第一段
- 或者重复显示
- 或者不能稳定合并

这一点需要按 Codex SDK 的真实 item 结构重新设计，而不是直接套 Claude 的 text block 思路。

2. `command_execution` 只做了粗粒度聚合

当前展示依赖：

- `item.command`
- `item.aggregated_output`
- `item.exit_code`
- `item.status`

问题在于：

- 没有处理中间增量 stdout/stderr 的更细粒度刷新
- 没有权限请求前后的执行阶段区分
- 没有和文件修改事件关联成一次完整操作

3. `file_change` 只取了第一条 change

当前：

- `const firstChange = item.changes?.[0]`
- `filePath = firstChange?.path || ''`

这意味着多文件变更时：

- UI 只突出第一条路径
- 丢失整体变更上下文
- 很难和 diff 展示对齐

4. `mcp_tool_call / web_search / todo_list` 只做最终态展示

当前多数都是：

- 只在 `item.completed` 时 push 一条卡片

结果是：

- 无法反映工具执行中的状态
- 没有 pending/running 过程
- 与 Claude 的工具调用体验不一致

5. `saveHistory()` 调用节流不充分

Claude 侧有专门的 `throttledSaveHistory()`。

Codex 侧 `onAgentMessage()` 基本每次事件后直接 `saveHistory()`，会导致：

- 流式事件密集时频繁调度保存
- IPC 和磁盘写入压力更大
- 还可能增加 UI 卡顿风险

### 结论

`流式返回格式` 目前不是“还缺几个样式”，而是事件抽象层还很薄，需要重新定义 Codex 的消息归一化模型。

## 3.5 runMode / 权限策略的 UI 与运行时没有真正打通

### 当前情况

`codeX/index.vue` 里有：

- `activeRunMode`
- `InputToolbar` 的 `runMode`

但发送消息时：

- `window.electronAPI.codexAgentQuery({ prompt, images, cwd, sessionId })`
- 没有把 `runMode` 传给主进程

主进程 `codex-agent-query` 也没有接收 `runMode`。

真正生效的是主进程里全局读取的：

- `permissionPolicy`

### 问题

这意味着当前页面上的 run mode 更像是“UI 上可切换的本地字段”，不是实际控制运行行为的参数。

更具体地说：

- 每个 chat 的 `runMode` 会被保存
- 但不会影响这次请求的审批策略
- 也不会像 Claude 一样动态更新 session 的运行模式

结论：`runMode` 目前在 Codex 侧是伪接入。

## 3.6 计划面板 / todo 面板有显示，但数据语义还不稳定

当前 `trackingPanelVisible` 的判断逻辑是：

- 只要消息里出现 `toolName === 'todo_list'` 且 `todoItems?.length`

这有几个问题：

- 没有区分当前 todo 是否已过期
- 没有关联到具体 turn
- 没有处理多次 todo_list 更新
- 没有像 Claude 那样更完整地维护计划状态

所以现在的计划面板更像是“找到最近 todo_list 就显示”，不是完整任务跟踪系统。

## 3.7 多处复制残留与命名残留，说明迁移未收口

已确认的残留包括：

1. 文案残留

- `MessageList.vue` 空状态标题仍然是 `Claude Code`
- `AskQuestionDialog.vue` 标题仍然是 `Claude 需要你的回答`

2. 组件命名残留

- `src/components/codeX/components/ClaudeToolbar.vue`
- `src/components/codeX/composables/useClaudeTabs.js`
- `src/components/codeX/composables/useClaudeHistory.js`
- `src/components/codeX/composables/useClaudeAgentStream.js`

这些文件虽然未必都在主链路使用，但说明迁移过程中没有完成清理。

3. 目录大小写不一致

路由里是：

- `@/components/codex/index.vue`

实际目录是：

- `src/components/codeX`

Windows 下大小写不敏感，所以现在可能工作正常；但这会带来：

- 构建链不稳定
- 跨平台风险
- 后续重命名/索引时混乱

## 3.8 乱码问题仍然大量存在

当前 `codeX`、`claudeCode` 里都能看到大量明显的中文乱码。

这会直接影响：

- 输入框 placeholder
- 空态说明
- 弹窗提示
- 状态文本

这类问题虽然不是 Codex 特有，但在 `codeX` 迁移阶段会进一步放大，因为你很难区分：

- 是逻辑没实现
- 还是文本资源本身已经损坏

建议把编码问题单独作为一个清理项优先处理。

## 4. 与 claudeCode 的能力差距清单

目前已确认 `claudeCode` 有而 `codeX` 缺失或未真正打通的能力：

- 基于真实 session 文件的历史扫描
- 历史分页加载
- `_fullMessages` 完整滑动窗口维护
- compact summary / compact boundary 处理
- ask question 事件与回传闭环
- runMode 动态更新到运行中的 session
- slash commands 拉取
- local skills 扫描
- memory 管理与注入
- 更完整的 provider / tier / language / effort / thinking 配置
- 更成熟的 metrics 查询与恢复
- 更完整的环境检测和版本更新逻辑

这不是说 Codex 必须全部照搬 Claude，而是当前 `codeX` 页面复用了 Claude 的交互外形，用户自然会预期这些能力存在。但目前 Codex 后端并没有相应支撑。

## 5. 根因判断

根因不是单一代码错误，而是迁移策略问题：

1. 先复制了 Claude 的前端页面结构
2. 只替换了部分 Codex API/IPC 名称
3. 没有先定义“Codex 的真实协议层”
4. 导致 UI 假设仍然基于 Claude
5. 但后端事件源已经换成完全不同的 Codex SDK

因此现在出现的是系统性错位：

- 展示层假设 Claude
- 事件层实际是 Codex
- 中间归一化层不完整

## 6. 建议的整改优先级

## 第一优先级：先把协议层和真实能力边界定义清楚

建议先不要继续在 `codeX/index.vue` 上直接补零散功能，而是先定义：

- Codex 会产生哪些事件
- 前端统一消息模型是什么
- 哪些能力是 Codex 原生支持
- 哪些能力只是 Claude 独有，不应硬搬

建议先产出一份 Codex 消息归一化模型，例如：

- assistant text
- reasoning
- command execution
- file changes
- mcp tool
- permission request
- todo / plan
- system / error

先把这一层定清楚，再改 UI。

## 第二优先级：把 codeX 从 claudeCode 组件依赖中拆出来

至少主链路组件应改为真正使用 `codeX/components/*`：

- MessageList
- AskQuestionDialog
- SelectModel
- InputToolbar
- HistorySidebar

否则后面一边修 Codex，一边还被 Claude 组件行为影响，成本会持续上升。

## 第三优先级：重做历史体系

建议明确二选一：

1. 轻量方案
   只保留面板快照历史，不做真实 session 扫描。

2. 完整方案
   建立 Codex thread/session 的本地恢复、分页、懒加载能力。

当前是两边都沾一点，但都没做完整，最容易形成伪功能。

## 第四优先级：补权限与 ask-question 真实闭环

这部分要先确认 Codex SDK 本身是否提供：

- permission request 事件
- user input / question 事件

如果 SDK 没有，UI 就不应继续保留 Claude 那套完整交互假象。

如果 SDK 有，就要完整补齐：

- 主进程事件监听
- requestId/resolver 生命周期
- 渲染层弹窗
- 回传接口

## 第五优先级：清理复制残留和乱码

包括：

- 删除未使用的 `useClaude*` / `ClaudeToolbar` 残留文件，或明确废弃
- 统一目录名：`codeX` / `codex` 选一种
- 统一 import 路径大小写
- 清理乱码文案

这些不是“锦上添花”，而是继续开发前必须先降噪。

## 7. 建议的下一步实施顺序

建议按下面顺序推进：

1. 先梳理 Codex SDK 真实事件能力，明确支持边界
2. 抽一层 `codex message normalizer`
3. 让 `codeX/index.vue` 全部改用自己目录下组件
4. 修复权限链路
5. 决定历史方案并重做历史恢复
6. 最后再补 slash / memory / plan 之类扩展能力

## 8. 最终判断

当前 `src/components/codeX` 的主要问题可以总结为三句话：

- 它现在是“Claude 页面外壳”迁移到 Codex 的半成品，而不是独立完成的 Codex 实现。
- 缺口不只在功能数量，更在于前端交互模型与 Codex SDK 事件模型没有真正对齐。
- 如果继续在现有结构上零散补丁，后续维护成本会越来越高；更合理的是先收口协议层，再拆掉对 `claudeCode` 的运行时依赖。

## 9. 补充说明：agentCommon 的定位

补充澄清：

- `src/components/agentCommon` 作为公共组件/公共能力层，这个方向本身是对的。
- 当前已经有一部分真正公共的能力被放进了 `agentCommon`，例如消息卡片、工具卡片、`useScrollBottom`、`useImageAttachments`、`helpers`。
- 因此，报告里提到的“复用问题”，不是反对抽公共层，也不是说 `agentCommon` 做错了。

真正的问题是当前公共层边界还没有完全收口，形成了三层并存：

- `agentCommon`：部分通用能力
- `claudeCode`：仍然承载很多实际运行中的共享 UI
- `codeX`：又复制了一套自己的实现

所以更准确的表述应该是：

- 你现在的目标架构方向没问题。
- 当前问题在于 `codeX` 还没有稳定落到 `agentCommon + codex-specific` 的结构。
- 运行时共享层目前事实上仍有相当一部分在 `claudeCode`，这才是后续要继续收敛的重点。
