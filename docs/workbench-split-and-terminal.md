# IDE 主界面、分屏与项目终端方案

> 状态：架构评审完成；可按阶段进入开发，禁止跳过前置门槛
>
> 最后评审：2026-07-18
>
> 架构复核：已按 2026-07-18 代码现状完成最终边界、安全、生命周期与兼容性审计
>
> 目标：把 MindCraft Agent 从页面式工具集合演进为项目感知的一体化 Vibe Coding IDE，同时不破坏现有 Agent 会话、文档编辑和桌面安全边界。

## 开工判断（Go / No-Go）

整体架构可以开工，但“可以开工”不等于可以从终端或大模板重写直接开始。开发入口和阻断条件固定如下：

| 节点 | 当前判断 | 进入条件 |
| --- | --- | --- |
| Phase 0：现状保护与风险验证 | **GO** | 现在即可开始；只增加 characterization/contract tests、依赖 inventory 和独立 spike，不改变正式 UI |
| Phase 1：共同平台底座 | **NO-GO，等待 Phase 0** | 现有行为已被测试锁定；typed API、window role、revision persistence、preload bundle 和 CloseCoordinator 契约可独立验证 |
| Phase 2A：业务边界轨 | **NO-GO，等待 Phase 1** | CodeHub、文档、Chat、typed intent 可在旧 UI 下独立运行，不依赖 Workbench 布局 |
| Phase 2B：Electron 安全轨 | **NO-GO，等待 Phase 1** | sandbox preload 已通过主窗口/独立窗口回归，插件隔离和 HTML sink inventory 有明确迁移路径 |
| Phase 3：Workbench 与真实内容接线 | **NO-GO，等待 Phase 2A** | external tab/input dock adapter、document controller 和 typed intent 均已在旧 UI 下稳定运行；可与 Phase 2B 并行开发 |
| Phase 4：项目终端 | **NO-GO，强阻断** | Phase 2B 安全门槛和 Phase 3 布局/激活协议全部通过，`node-pty` 在 Windows/macOS 安装包真实运行 |

因此可以把本文交给开发 Agent，从 Phase 0 开始按依赖图实现；不能用“按全文一次性完成”的方式让一个 PR 同时修改所有边界。Phase 2A 与 2B 在共同底座后并行，Workbench 不必等待整套插件安全迁移才开始开发；终端必须等待业务轨与安全轨汇合。每个 Phase 的完成条件都是下一依赖节点的合并门槛，不只是建议检查项。

## 架构质量终审

最终判断是：**产品架构通过，实施有条件 GO，终端仍为强门禁项**。这里的“通过”建立在本文红线和 fitness tests 被实现的前提上，不代表当前代码已经具备这些性质。

| 质量属性 | 结论 | 依据 | 主要剩余风险 |
| --- | --- | --- | --- |
| 解耦度 | 良好 | host 只负责布局；Agent、document、Chat、PTY 各有唯一 owner；通过 public adapter/typed intent/IPC 交互 | 若 Workbench 直接 import provider 私有 store、document 反向依赖布局、或 host 用 DOM/ref 操纵 composer，会迅速退化 |
| 可扩展性 | 良好，符合 V1 | item registry、versioned layout、composite tab projection、workspace context 可增加新 item；终端与左右内容区正交 | V1 的“两栏”是明确产品上限；未来任意 docking 必须升 layout schema v2，不能在 v1 数组上继续打补丁 |
| 健壮性 | 有条件良好 | 单 owner、revision/epoch、dirty conflict、CloseCoordinator、view crash cleanup 和降级恢复均可测试 | Electron native view、文件系统外部写入和 node-pty 打包是三类平台风险，必须靠 spike/E2E 而非代码推断 |
| 可维护性 | 良好 | 依赖方向固定，改造按可回滚阶段拆分，旧兼容层有删除条件，核心状态机可做纯逻辑测试 | `Main.vue`、`mdViewer/index.vue`、CodeHub 若继续承接新状态会形成新 god component，必须先抽 controller/adapter |
| 性能 | 良好但需基准验证 | 布局只存轻量 descriptor，激活热路径无扫描/I/O，业务实例稳定移动，文档数量有上限 | 最多 16 个曾激活文档可能保留编辑器实例；Phase 3 必须记录 heap/切 tab/拖 splitter 基线 |
| 安全性 | Workbench 可分轨推进；终端当前 NO-GO | terminal data plane 隔离、sender role/owner、authorized workspace registry 和插件隔离门槛明确 | 当前主 renderer/独立窗口配置与 preload surface 仍不满足终端上线条件 |

依赖方向必须固定为：

```text
Main composition root
├─ Workbench core（只认识 item adapter / descriptor / intent）
├─ Document domain adapter ─> document controller（不知道 group/pane）
├─ Agent adapter ──────────> @mindcraft/agent public API
└─ Host terminal control ──> root preload ─> main terminal manager

@mindcraft/agent  -X-> src/workbench / src/documents / root terminal
document domain   -X-> Workbench store
Workbench core    -X-> provider private store / PTY / document text
main renderer     -X-> terminal data plane
```

`Main.vue` 只做 composition、window chrome、route projection 和顶层 modal；不得继续吸收 layout mutation、document dirty、terminal lifecycle 或 provider activation 细节。Workbench core 不直接 switch `agent/document/chat` 业务实现：composition root 注册 item adapter，core 只调用统一的 title/tab projection/activate/move/close hooks。上述依赖由 import-boundary contract test 锁定。

仍存在四个不可通过抽象彻底消除的风险：native view 层级/坐标、外部进程与文档保存的竞争、renderer crash 下未落盘 dirty buffer、native addon 跨平台分发。本文选择显式限制和故障降级，不承诺不存在的强一致性；任何实现若声称完全解决，必须提供对应平台 E2E 证据。

## 先用白话说明“主工作区”

`Workbench` 只是代码里的内部名称，中文可以直接理解为“主工作区”：左侧导航栏右边、窗口控制按钮下面的整块可操作区域。

它不是一个新功能入口，也不会在导航栏里显示一个叫 Workbench 的模块。用户最终看到的仍然是 Agent、文档、简易对话和终端，只是这些内容可以同时摆在主工作区里。

| 方案里的词 | 用户实际看到的东西 |
| --- | --- |
| Workbench / 主工作区 | 左侧导航栏右边的整块主界面 |
| Pane / Group（技术名） | 分屏后左边或右边的一块区域 |
| Item（技术名） | 区域里打开的 Agent、文档或简易对话 |
| Input dock（技术名） | Agent 底部共用的“对话输入 / 终端”区域 |
| cwd | 当前项目文件夹，例如 `D:\project\demo` |

## UI 格局示意

下面的图只表达区域关系，不代表最终颜色和像素尺寸。

可点击的单文件原型：[打开 UI 交互示意](./workbench-ui-demo.html)。建议按“文档 -> 在右侧打开 -> 终端”的顺序点击体验。

### A. 不分屏：保持现在的主要使用方式

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                      MindCraft              ─  □  ×        │
├──────┬─────────────────────────────────────────────────────────────────────┤
│      │ [Claude · 项目 A] [Codex · 项目 B]  +                              │
│ 首页 ├─────────────────────────────────────────────────────────────────────┤
│ 项目 │                                                                     │
│ 文档 │                       Agent 对话区域                                │
│ 对话 │                                                                     │
│ 插件 │                                                                     │
│      │                                                                     │
│      ├─────────────────────────────────────────────────────────────────────┤
│ >_   │  当前项目：项目 A                         [>_ 终端]                 │
│ 设置 │                                                                     │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

- 左侧导航基本不变。
- 左下角增加 `>_` 终端按钮；它负责聚焦 Agent，并把共用输入区切换到终端模式，不会跳到新的终端页面。
- 没有分屏时，Agent 继续占满主要区域。

### B. Agent + 文档左右分屏

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                      MindCraft              ─  □  ×        │
├──────┬──────────────────────────────────────┬──────────────────────────────┤
│      │ [Claude · 项目 A] [Codex · 项目 B]  │ [README.md] [×]       [拆分] │
│ 首页 ├──────────────────────────────────────┼──────────────────────────────┤
│ 项目 │                                      │                              │
│ 文档 │          Agent 对话区域              │       文档预览 / 编辑         │
│ 对话 │                                      │                              │
│ 插件 │                                      │                              │
│      │                                      │                              │
│      │                                      ┆ 可拖动改变左右宽度           │
│      ├──────────────────────────────────────┴──────────────────────────────┤
│ >_   │  当前项目：项目 A                         [>_ 终端]                 │
│ 设置 │                                                                     │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

打开方式：

- 文档标签或文件链接右键选择“在右侧打开”。
- 文档工具栏提供一个“向右拆分”图标。
- 中间分隔线可拖动；默认比例为 Agent 60%，文档 40%。

### C. Agent + 简易对话左右分屏

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                      MindCraft              ─  □  ×        │
├──────┬──────────────────────────────────────┬──────────────────────────────┤
│      │ [Claude · 项目 A] [Codex · 项目 B]  │ [简易对话：需求讨论] [×]     │
│ 首页 ├──────────────────────────────────────┼──────────────────────────────┤
│ 项目 │                                      │                              │
│ 文档 │          编程 Agent 对话             │       简易 Chat 对话          │
│ 对话 │                                      │                              │
│ 插件 │                                      │                              │
│      │                                      │                              │
│      │                                      │                              │
│      ├──────────────────────────────────────┴──────────────────────────────┤
│ >_   │  当前项目：项目 A                         [>_ 终端]                 │
│ 设置 │                                                                     │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

- 简易 Chat 可以像文档一样放在右侧。
- 右侧区域可以有多个标签，例如 `[README.md] [需求讨论]`，但同一时刻显示一个。
- 如果把简易 Chat 放左侧、文档放右侧，也可以形成“文档 + Chat”布局。

### C2. 左右标签可以互相拖动

- 左右两侧的标签可以直接拖到对方标签栏，移动的是同一个内容，不会复制一份页面。
- 右侧最后一个标签拖回左侧后，右侧区域自动关闭；左侧不能被拖成空白区域。
- Agent 首版仍是单实例，可以左右移动，但不能复制成两个 Agent。
- 未保存文档可以直接移动；移动不关闭资源、不触发 dirty guard，也不应卸载/重建组件或触发项目扫描。只有真正关闭文档或退出应用才询问保存/放弃。

这个交互的状态操作不复杂：把 `itemId` 从一个区域的列表移动到另一个列表。真正需要守住的是稳定实例 Teleport、空区域合并、焦点恢复和组合 tab 的命令分发。

### C3. HTML 文档显示方式

HTML 不再只显示预览，也不默认直接运行预览。它采用与 Markdown 类似的模式切换，但默认模式不同：

```text
[源码（默认）] [预览] [分屏]
```

- `源码`：默认，用现有 CodeMirror HTML language 显示和编辑代码。
- `预览`：在 sandbox iframe 中渲染；默认禁止脚本、顶层导航和不受控外部能力。
- `分屏`：左侧源码、右侧安全预览，编辑后 debounce 刷新预览。
- 超过可编辑大小上限时源码只读；加载/渲染失败时仍能看到源码和明确错误。

### D. 在 Agent 输入区切换到项目终端

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                      MindCraft              ─  □  ×        │
├──────┬──────────────────────────────────────┬──────────────────────────────┤
│      │ [Claude · 项目 A]                    │ [README.md]                  │
│ 首页 ├──────────────────────────────────────┼──────────────────────────────┤
│ 项目 │          Agent 对话区域              │       文档预览 / 编辑         │
│ 文档 │                                      │                              │
│ 对话 │                                      │                              │
│ 插件 │                                      │                              │
│      │ [对话输入] [>_ 终端 · 项目 A] [+] [扩展] [×]                       │
│      │ PS D:\project\project-a> npm run dev │                              │
│ >_   │                                      │                              │
│ 设置 │                                                                     │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

- 终端复用 Agent 原输入框位置，不再上下堆叠两套输入区域。
- `[对话输入]` 与 `[>_ 终端]` 是模式切换，同一时刻只显示一个输入面板。
- 点击“扩展”后终端向上占用更多 Agent 对话区域，适合查看较完整日志；再次点击恢复。
- 可以创建多个终端标签，每个终端注明项目和 shell；V1 通过向上扩展显示更完整的终端，不把终端移动到内容分屏。

### E. 用户实际操作流程

```text
选择 Agent 项目 A
    ↓
点击文档中的“在右侧打开”
    ↓
左边继续和 Agent 对话，右边查看或编辑文档
    ↓
按 Ctrl+` 或点击左下角 >_
    ↓
Agent 输入区切换为项目 A 的 PowerShell，可以直接 npm install / npm run dev
```

如果当前没有选中项目文件夹，点击终端时先提示选择文件夹，不会把终端静默打开到应用安装目录。

## 1. 结论

采用 VS Code 式的两层主工作区，而不是把终端做成一个孤立的导航页面：

```text
主窗口
├─ 左侧导航
└─ 主工作区（代码内部称为 Workbench）
   ├─ 上部：1-2 个可分屏区域
   │  ├─ Agent（CodeHub）
   │  ├─ 文档
   │  └─ 简易 Chat
   └─ Agent 输入区：对话输入 / 项目终端二选一
```

产品决策：

1. 分屏属于主窗口能力，代码放在 `src/workbench/**`，不塞进 `codeHub` 或某个 provider 页面。
2. 首版最多两个区域，先做可靠的左右分屏；以后再增加上下分屏。
3. 文档和简易 Chat 都可以放到左侧或右侧；Agent 首版只保留一个实例，避免收到两份事件或切错项目。
4. 终端复用 Agent 输入区，不新增一个需要整页跳转的“终端模块”，也不额外叠加第二套输入框；左侧底部只增加切换/聚焦按钮和快捷键。
5. 终端 cwd 默认跟随当前 Agent 项目，但创建后锁定到创建时的 cwd；切换项目不偷偷改变正在运行的 shell。

该方案同时保留未来扩展到文件树、搜索、问题/输出面板、插件分屏和多窗口的空间。

## 2. 为什么不是其他方案

### 2.1 不把终端做成普通导航路由

单独的 `/main/terminal` 实现简单，但用户在 Agent 和终端之间只能整页切换，违背“边看 Agent 边执行命令”的核心目的，也无法自然表达一个项目下的多个终端。

导航栏可保留一个“打开/聚焦终端”的按钮，但它切换的是 Agent 输入区，而不是跳转到独立页面。

### 2.2 不把分屏塞进 CodeHub

`codeHub` 当前拥有 Agent 项目 tab 和 provider 激活逻辑。文档、简易 Chat、终端并不属于 provider 会话；塞进去会让 host-only 页面反向进入 `packages/agent`，破坏现有目录边界。

正确依赖方向是：主窗口负责摆放 Agent、文档和简易 Chat，而不是让 Agent 页面反过来管理整个桌面界面。

### 2.3 不直接引入完整 docking 框架

Golden Layout 一类框架适合任意嵌套、拖拽停靠和浮动窗口，但首版需求只有 1-2 个 group。完整 docking 会过早引入复杂生命周期、序列化和 Vue 接线。

技术实现上，V1 使用小型左右布局模型和 CSS 拖动分隔线。若希望减少拖动细节，可评估 `splitpanes`，但布局状态、内容生命周期和持久化仍由 MindCraft 自己掌握，不能把第三方组件状态作为事实源。

## 3. 现状与改造点

当前 `src/Main.vue` 通过一个 `<router-view>` 在 `codeHub`、`mdViewer` 和 `chat` 之间整页切换，并依赖 `keep-alive` 保持状态。这意味着仅靠 Vue Router 无法让两个路由组件同时可见。

现有能力可以复用，但需拆开“内容模型”和“页面实例”：

| 现有能力 | 可复用内容 | 必要改造 |
| --- | --- | --- |
| `packages/agent/src/components/codeHub/index.vue` | Agent 项目 tab、provider 生命周期 | 向 host 发布轻量 active workspace context；V1 只挂载一个实例 |
| `src/components/mdViewer/index.vue` | 文档 viewer/editor、dirty guard、懒加载 | 抽出文档 store/controller，按 `documentId` 渲染单项，不能在两个 pane 各自维护全局 tabs |
| `packages/agent/src/views/ChatView.vue` | 简易 Chat UI、会话列表、流和 userData 会话 | V1 保持一个单实例 `chat:simple` 内容项，通过稳定 host 移动；不按 session 拆 Workbench item |
| `src/router.js` | 深链接和导航兼容 | 路由变为“打开/聚焦 Workbench item”的意图，不再是唯一可见组件状态 |
| `electron/mdRouting.js` | 外部/Agent 文件打开队列 | 从“强制切到 mdViewer 路由”改为向 Workbench 发送 open-item intent |

不要在 V1 同时挂载两个 CodeHub。Claude/CodeX 面板包含全局 IPC 监听、运行时 Map 和激活副作用；复制实例会造成事件重复消费、项目激活竞争和内存翻倍。V1 推荐布局是 Agent + 文档、Agent + Chat，或者文档 + Chat；Agent item 始终唯一。

### 3.1 开发红线：先拆边界，再接 UI

本次不是在 `Main.vue` 的 `<router-view>` 外再套一层 CSS，也不是把现有三个整页组件复制到两个 group。下列边界是为了避免改动变成跨模块补丁，属于实施前必须建立的契约：

| 领域 | 唯一 owner | Workbench 只能做什么 | 明确禁止 |
| --- | --- | --- | --- |
| 布局与 tab 摆放 | host `src/workbench/useWorkbenchStore.js` | 存 `itemId`、group、焦点、比例等轻量描述 | 存消息正文、文档草稿、PTY 输出或 provider session 数据 |
| Agent | 一个 `CodeHub` 实例 | 挂载、隐藏、聚焦和移动其显示位置 | 创建第二个 CodeHub，或从 host 直接调用 provider 内部状态 |
| 文档资源 | host document controller/store，以 main 返回的 canonical file key 为 key | 将 `documentId` 放入 group 并渲染单文档视图 | 每个 group 各维护一套 `mdViewer` tabs、dirty state 或 `openDocTabs` 持久化 |
| 简易 Chat | 现有单一 `ChatView` / session / stream owner | 移动或聚焦唯一的 `chat:simple` 内容项 | 每个 pane 调用一次 `useChatSession()`，或把每个 session 变成 Workbench item |
| 终端 | main `terminalBroker` + utility `terminalHost` + 隔离 terminal view | host 只管理输入区模式、终端 tab 轻量投影和原生 view bounds | 在主 renderer/main UI 线程持有 PTY，暴露 terminal data bridge，或把命令/输出写进布局/provider registry |

为满足“跨栏拖动不重复业务内容”，V1 采用唯一实现：`WorkbenchItemHost` 在 WorkbenchShell 下为每个已打开 item 建立稳定实例，通过 Vue `Teleport` 把实例投放到目标 group 的稳定 content anchor。移动 tab 只改变 Teleport target，不改变组件 `key`，不得用两个 group 各自的 `v-if` 重新创建组件。`agent:codehub` 与 `chat:simple` 从首次打开到明确关闭/应用退出始终只有一个实例；文档 item 也以稳定 `itemId` 挂载，关闭后才销毁。

为控制内存，V1 同时打开的 Workbench item 上限为 20，其中 document item 上限为 16；达到上限后必须提示用户关闭已有 item，不做静默 LRU 卸载。布局恢复时只恢复上限内的轻量 descriptor，正文仍按当前文档懒加载链路加载。后续如果引入可回收视图池，必须另行登记缓存 owner、失效和 dirty/streaming pin 规则。

“稳定实例”不是启动时 eager mount 全部恢复项：layout restore 只创建 descriptor/loading metadata，item 第一次成为 active/visible 时才 mount；一旦 mount，在移动、park、被同组其他 tab 覆盖时保持实例，直到真正 close 或主窗口销毁。这样跨栏不丢状态，同时避免启动即创建 16 个编辑器。

group content anchor 必须始终存在：parked/hidden group 使用 `v-show` 或等价 CSS 隐藏，不能 `v-if` 销毁 anchor；真正 merge secondary 时先把全部 item 的 Teleport target 原子切到 primary 并完成一个 `nextTick`，再销毁 secondary anchor。任何时刻 item 只能有一个有效 target，找不到 target 时落到稳定 parking anchor 并标记 inactive，不能回退重建组件。

现有 `mdViewer` 同时包含文件列表、内部 tabs、文件读取、草稿、dirty guard 和 `openDocTabs` 持久化，不能直接为每个 pane 挂载一份。实施时先拆为 `DocumentHome`、按 canonical file identity 唯一的 document controller/store、`DocumentItemView`，再让 Workbench 成为文档 tab 位置的唯一 owner。旧 `openDocTabs` 只允许一次性迁移为 Workbench descriptor，切换完成后删除旧写路径，禁止 Workbench tab 和旧文档 tab 同时决定同一文件的位置。`ChatView` V1 不拆 session item，作为 `chat:simple` 单实例整体移动，保留其内部会话列表和当前 stream owner。

Agent 的原生输入框目前分别位于 ClaudeCode 与 CodeX 的 provider 组件内部。因此“终端复用 Agent 输入区”必须先在 `packages/agent` 建立通用、与终端无关的 `AgentInputDockShell`：provider 将现有 composer 放入 `chat` slot，用 `v-show` 保持实例，并通过公开注册函数向 CodeHub 提供 active external dock anchor；CodeHub 再通过公开 adapter 把该 anchor 暴露给 host。Workbench 在 anchor 中渲染可信的 `TerminalDockChrome`、模式/tab/动作控制条和一个独立的 terminal viewport 占位；只把 viewport 的 DOMRect 通过 typed host IPC 交给 main。真正的 xterm UI 运行在 main 管理的隔离 `WebContentsView` 中，只覆盖 viewport，绝不能盖住 host DOM 控制条，否则原生层会吞掉 tab、扩展和关闭按钮。切回 chat 时隐藏 native view，不销毁草稿、附件、输入历史或焦点状态；切换 Claude/CodeX 时复用同一个 terminal view。`packages/agent` 不得 import `src/workbench` 或 terminal 代码；host 也不得通过 DOM 查询、CSS 穿透或 provider 私有 ref 隐藏输入框。

原生 terminal view 的 bounds 同步只允许 trusted host 调用：anchor 使用 `ResizeObserver` + rAF 合并更新；窗口 move/resize、DPI/zoom、侧栏变化、终端扩展和 Agent 跨栏后重新计算。隐藏/parked/切回 chat 时立刻调用 `View.setVisible(false)` 并把焦点显式交回 host；恢复时先设置 bounds，再 `setVisible(true)`，仅在用户请求终端焦点时调用 `webContents.focus()`。host window resize 过程中不逐像素同步 PTY cols/rows，view 自己 Fit 后再节流发送 resize。

`WebContentsView` 原生层位于 DOM 之上，不能被 Vue modal/Popover 盖住，因此所有主窗口原生子视图统一注册到 host-level `NativeSurfaceCoordinator`。它是 `BrowserWindow.contentView` add/remove、z-order、最终 visibility、bounds revision、窗口 hide/minimize 和全局 modal occlusion 的唯一 owner；terminal/plugin manager 各自拥有业务 webContents、preload 和 crash cleanup，但不能直接 add/remove 或决定最终层级。Settings、Agent permission/ask/plan dialog、文件选择前的 host modal、全屏图片预览等遮挡层打开时 coordinator 隐藏会遮挡的 native surface，关闭后按最新 route/mode/revision 恢复；切 Home/Plugin 时 terminal 隐藏，切回 Workbench 时 plugin surface 隐藏，V1 不允许两个交互原生 surface 重叠。terminal view 自己处理复制粘贴和右键菜单，主 renderer 的 context menu/search/shortcut 不得跨 view 抢输入。

Workbench item 生命周期固定为：

| item | mount | close/hide | destroy |
| --- | --- | --- | --- |
| `agent:codehub` | Workbench 首次创建时 eager mount | 不提供关闭，只能切换/移动/隐藏在非活动 tab；离开到 Home/Plugin 时 WorkbenchShell 以 `v-show` 隐藏并显式发布 `surfaceState.visible=false` | 主窗口销毁 |
| `chat:simple` | 第一次打开时 lazy mount | 关闭 tab 仅从布局隐藏，实例和进行中的 stream 保持；再次打开复用 | 主窗口销毁 |
| `document:*` | 第一次打开对应文件时 lazy mount | 跨栏/折叠仅隐藏或移动；真正 close 才走 dirty guard 并从布局移除 | close 成功或主窗口销毁 |
| `document:home` | 第一次点文档导航时 lazy mount | 可隐藏，保留轻量首页状态 | 主窗口销毁 |

`agent:codehub`/`chat:simple` 即使暂时没有 group 引用，也属于 resident singleton，不计入 document 上限但计入 20 item 总上限。只有 visible/open refs 写入布局；resident runtime 本身不是第二份事实源。

### 3.2 Tab 只保留一条视觉层级

CodeHub 已有 Claude/CodeX 项目 tab；Workbench 再加一条普通 Agent tab 会形成双层 tab，也会混淆布局身份和 provider 项目身份。V1 采用组合 tab strip：

- `agent:codehub` 仍是布局中唯一 Agent item，CodeHub 仍是项目 tab 的事实源。
- `@mindcraft/agent` 提供公开、轻量的 CodeHub tab adapter：只读 project tab summaries，以及 activate/reorder/close/create 命令；host 不读取完整 project/chat/messages。
- CodeHub 在 `tabPresentation="external"` 时隐藏内部 tab strip，WorkbenchGroup 在同一条 tab strip 中投影 CodeHub 项目 tabs、document items 和 `chat:simple`。
- CodeHub 项目 tab 不是 Workbench item，不写入 layout descriptor。点击/关闭/排序继续委托 CodeHub；Workbench 不复制其 project/session identity。
- Agent 项目 tabs 只能在 Agent 所在 group 内排序。需要换侧时，拖动任一 Agent 项目 tab 或执行“移动 Agent 到另一侧”会整体移动唯一 `agent:codehub` surface，所有 Agent 项目 tabs 一起过去，不允许把不同 Agent 项目拆到两侧。
- Agent 项目 tabs 在组合 strip 中始终是一个连续 cluster，对应 layout 中单个 `agent:codehub` slot。document/chat tab 可放在 cluster 前后，但不能插进两个 Agent 项目 tab 中间；拖到 cluster 内部时按落点吸附到 cluster 前/后，避免 Workbench 持久化 provider tab 顺序。
- CodeHub 没有项目 tab 时，cluster 显示一个不可关闭的“Agent”占位 tab和 `+`，点击继续打开现有 Agent picker；空项目不能导致 `agent:codehub` 从 layout 消失。
- document tab 与 `chat:simple` 可以独立跨 group 移动；移动保持相同 `itemId` 和组件实例。
- 组合 tab 的命令按 tab kind 分发：Agent 项目 tab 的关闭/排序交给 CodeHub，document tab 走 dirty close，`chat:simple` 只隐藏；`Ctrl+W` 作用于当前视觉 tab，不能统一调用一个“删除 item”函数。

如果 external adapter 尚未完成，Workbench 不得以“双层 tab”作为临时正式 UI；开发期间可以通过显式实验开关验证骨架，但 Phase 3 完成条件必须是单层 tab。

### 3.3 稳定挂载不等于始终活跃

Teleport + resident singleton 会让现有 `onActivated/onDeactivated` 不再等价于“当前视觉 tab”。Workbench 必须向每个 item 注入/传递明确的 `surfaceState = { visible, active, groupId }`：

- `visible` 只决定是否显示；隐藏不停止 Agent/Chat stream，也不销毁草稿。
- `active` 由 active group + active visual tab 唯一计算；只有 active surface 可以处理全局快捷键、主动 focus、scroll restore、CodeMirror search 和 xterm keyboard input。
- CodeHub 的现有 shortcut handlers、Claude/CodeX 的 focus/scroll 副作用必须同时检查 Workbench surface active 和内部 active provider；后台 IPC/stream listener 继续工作。
- document item 不得每个实例都注册一套 window keydown。保存、查找、关闭和 tab 导航由 Workbench shortcut router 按 active item 分发，编辑器只处理自身获得焦点后的局部按键。
- parked、hidden、被其他 tab 覆盖的 surface 不得拦截快捷键或抢焦点。移动 Teleport target 后在 `nextTick + rAF` 恢复目标 group 焦点，旧 anchor 不保留 active 状态。
- UI 主题、i18n、provide/inject 仍由 Vue 逻辑树提供；依赖目标 DOM 祖先的 CSS 变量必须提升到 Main theme root，不能让同一 item 移到另一侧后颜色变化。

这是显式激活协议，不允许继续依赖 router keep-alive hook 推断。后台任务是否继续和 UI 是否有键盘权是两个不同状态。

## 4. 技术内部：主工作区（Workbench）模型

### 4.1 核心身份

必须分开四种身份：

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `workspaceKey` | 项目工作区身份，优先使用规范化 cwd | `cwd:D:/repo` |
| `groupId` | 一个 editor group | `group-primary` |
| `itemId` | Workbench 内可打开项 | `document:D:/repo/README.md` |
| `resourceId` | 业务事实源身份 | file path、chat session id |

`workspaceKey` 不是 `chatKey`，也不是 provider project id。Claude 与 CodeX 指向同一个规范化 cwd 时可以共享终端和文档上下文，但各自 Agent 会话身份保持独立。

文档身份再分两层：renderer 可立即计算的 `lexicalDocumentKey` 只用于请求去重和临时 loading shell；所有 file-backed open intent 必须先经 main document locator，通过 `path.resolve + realpath`（Windows 同时规范 drive/case）返回 `canonicalDocumentKey` 和 file signature，之后 document controller 才创建正式 item。正式 `itemId`/Vue key 从创建起稳定，不能在 canonical resolve 后换 key导致 remount；controller 维护 lexical alias -> canonical resource 映射。两个别名、符号链接或大小写不同路径解析到同一真实文件时只创建/聚焦一个资源。不存在/新建文件使用 main 授权父目录后的 normalized target key，首次创建成功后 canonical 升级只更新 resource metadata，不更换稳定 itemId。若历史/竞态已产生两个 dirty alias，则进入显式 alias-conflict，禁止自动选一份覆盖。

### 4.2 布局状态

V1 数据结构：

```js
{
  version: 1,
  orientation: 'horizontal',
  activeGroupId: 'group-primary',
  groups: [
    {
      id: 'group-primary',
      size: 0.62,
      activeItemId: 'agent:codehub',
      itemIds: ['agent:codehub']
    },
    {
      id: 'group-secondary',
      size: 0.38,
      activeItemId: 'document:D:/repo/README.md',
      itemIds: ['document:D:/repo/README.md', 'chat:simple']
    }
  ],
  items: {
    'agent:codehub': { type: 'agent', singleton: true },
    'document:D:/repo/README.md': {
      type: 'document',
      resourceId: 'D:/repo/README.md',
      workspaceKey: 'cwd:D:/repo'
    },
    'chat:simple': {
      type: 'chat',
      resourceId: 'simple-chat',
      singleton: true
    }
  },
  inputDock: {
    mode: 'chat',
    terminalExpanded: false,
    expandedSizePx: 420
  }
}
```

边界：

- 最多两个 group；每个 group 最小宽度 320px。
- 视口不足时不创建第二 group，已有布局自动折叠为单 group，但保留 item，不丢状态。
- splitter 拖动只改内存，拖动结束后节流持久化；拖动过程中不触发磁盘 I/O。
- item 业务状态由各领域 owner 管理；布局只存引用和轻量 UI 状态，不复制 messages、文档正文或终端输出。
- descriptor schema 必须做版本校验、字段 allowlist、item 数量/字符串长度上限和原型污染防护；读取失败或部分 item 失效时局部降级到默认布局，不让坏配置造成白屏。
- `workspaceKey` 只表达创建/归属上下文，不决定 Agent provider 身份；`chat:simple` 的当前会话仍由 Chat owner 管理。
- 上例 `inputDock.mode` 和 `terminalExpanded` 是 renderer 运行时状态，不进入持久化 descriptor；serializer 只保存经过范围校验的 `expandedSizePx` 偏好。启动/刷新后固定恢复 `mode='chat'`、`terminalExpanded=false`。
- layout 内存状态有单调 `revision`，每次 mutation 先递增；debounce save 携带 `{ windowInstanceId, revision }`，main 只接受当前 main-workbench owner 且 revision 不小于最后已提交值。旧异步 save 晚到不得覆盖新布局；renderer reload 后由 main 分配新的 `windowInstanceId/epoch`，旧 renderer 的迟到请求全部拒绝。

### 4.3 Item 注册表

新增 host 侧 registry，例如：

```text
src/workbench/
  WorkbenchShell.vue
  WorkbenchGroup.vue
  WorkbenchTabs.vue
  workbenchRegistry.js
  useWorkbenchStore.js
  layoutModel.mjs
  workspaceContext.js

src/documents/
  DocumentHome.vue
  DocumentItemView.vue
  documentController.js
  documentIdentity.mjs
  documentConflict.mjs

src/adapters/
  agentWorkbenchAdapter.js
  documentWorkbenchAdapter.js
  simpleChatWorkbenchAdapter.js

electron/workbench/
  workbenchIpc.js
  layoutRepository.js

electron/documents/
  documentIpc.js
  documentIdentity.js
  documentWatchManager.js

electron/lifecycle/
  closeCoordinator.js

electron/surfaces/
  nativeSurfaceCoordinator.js

src/lifecycle/
  closeParticipantRegistry.js
```

`src/components/mdViewer/index.vue` 在迁移期只作为 compatibility shell 组合 `DocumentHome/DocumentItemView`，完成 Workbench 切换后删除其 tab owner；不能把拆出的 controller 又放回这个大组件。item adapter 由 `Main.vue` 的 composition root 注册，Workbench core 只看到统一 port，不 import 上述具体 domain。所有 IPC channel 仍统一登记在 `packages/agent/shared/ipcChannels.js`，但 handler 按 root host domain 分文件，不能回填到 `packages/agent/electron`。

adapter 的最小接口是轻量 port：`getSnapshot()`、`subscribe(listener) -> dispose`、`activate(context)`、`deactivate(context)`、`requestClose(reason)`、可选 `getWorkspaceContext()`；snapshot 只能含 tab projection/surface metadata，订阅只在真实轻量状态变化时推送，不能轮询或触发 scan。不得返回完整 message、document text、provider project 或 Vue 私有 ref。adapter mount/unmount 必须对称 dispose。新增 item type 只有实现该 port 并在 composition root 注册，不应修改 Workbench core 的 switch/if 链。

每类 item 声明：

- `type` 与稳定 `itemId` 生成规则
- Vue renderer
- 是否 singleton
- 标题/图标解析
- `canSplit`、`canClose`、`canMove`
- serialize/restore 的轻量字段
- dirty close hook

V1 item 类型固定为 `agent`、`document`、`chat`。终端由 Agent 的 input dock 管理，不注册为 Workbench item，也不参与左右内容分屏。

### 4.4 路由兼容

保留现有 `/main/codeHub`、`/main/mdViewer`、`/main/chat` 作为公开兼容 URL；新增的 WorkbenchShell 是 `/main` 下唯一常驻内容宿主，这三个 URL 不再各自挂载一份整页组件。router guard 只做 schema validation、兼容 redirect 和 window-role 限制；route 成功确认后，由唯一 navigation coordinator 解析为导航意图：

```text
openItem(intent, { target: 'active' | 'beside' })
```

- 点击侧栏项目：聚焦 `agent:codehub`。
- 点击侧栏“文档”：优先在原 group 聚焦最近使用的 document item；尚无文档时在 active group 打开/聚焦 `document:home`，选择文件后创建/聚焦对应 document item。
- 点击侧栏“简易对话”：直接在 active group 打开或聚焦唯一 `chat:simple`，其内部恢复最近会话或创建首个会话。
- 普通侧栏点击保持现有整区切换体验，不会自动创建 secondary group；只有“在侧边打开”、拆分命令或 tab 拖动才改变为左右分屏。
- 如果目标 item 已经在另一个 group，侧栏点击只聚焦所在 group，不复制、不移动该 item。
- 深链接和外部 `.md` 关联仍有效，但最终由 Workbench 决定 item 位置。

路由与布局的边界固定如下：

- `route -> intent` 单向驱动 Workbench；布局变化不反向把 pane、ratio、tab 顺序或 `itemId` 写入 URL。
- `/main/codeHub?agent=&projectId=&chatId=&sessionId=` 继续由 CodeHub 解析 provider/project/session，Workbench 只负责先聚焦 `agent:codehub`。
- `/main/mdViewer` 无 payload 时聚焦最近使用的 document item，没有才打开 `document:home`；外部文件/Agent 链接 payload 通过统一 `OPEN_WORKBENCH_ITEM` push + `DRAIN_WORKBENCH_INTENTS` ready/drain 队列打开具体文档，不再依赖 `mdViewerReady`。
- `/main/chat` 聚焦 `chat:simple`；旧 `mindcraft_agent_chat_target_session` 只在迁移期读取一次，之后改为 typed intent 中的 `sessionId`，由 Chat owner 切换内部会话。
- 首页、文件关联、第二实例、Agent 消息链接、Git Changes Drawer 等入口都调用同一个 typed intent builder；禁止一部分 `router.push`、一部分直接改 store、另一部分单独发 IPC。
- `mindcraft_agent_last_route` 继续只写公开 `/main` path，不记录查询中的敏感/临时状态，也不记录内部 Workbench item id。应用启动时先恢复 versioned layout，再应用 route intent；显式 route target 优先于 layout 的 active item，但不清空其他 group。
- 旧 `/mdViewer`、`/main/claudeCode`、`/main/codex` 继续重定向；独立 Claude/CodeX 窗口仍走兼容 Agent 路由，必须保持现有行为。

typed intent 至少包含 `{ requestId, type, resourceId?, target, source, workspaceKey?, agentTarget?, chatTarget? }`。renderer 与 main 都按 schema 校验；同一 `requestId` 幂等，ready/drain 队列有数量上限和超时清理。路由只表达导航意图，不持久化完整布局。

`Main.vue` 的挂载拓扑固定为：

```text
Main shell（侧栏、窗口控制、设置）
├─ WorkbenchShell（整个主窗口生命周期只创建一次）
│  └─ v-show：当前 route 属于 codeHub / mdViewer / chat
└─ 非 Workbench router-view
   └─ Home / PluginMarket / 隔离 Plugin host 等 host-only 页面
```

切到 Home/Plugin 时 WorkbenchShell 只隐藏、不卸载，Agent 任务和 Chat stream 继续。主窗口和独立 Agent 窗口必须有 main 权威分配的 `windowRole`：`main-workbench | standalone-agent`；独立窗口创建时通过专用 preload/受控 additional argument 暴露只读 role，main 同时按 `webContents.id -> role` 登记并校验，不能只信 renderer 自报。`Main.vue` 在 `main-workbench` 才挂 WorkbenchShell；`standalone-agent` 继续直接渲染兼容 CodeHub 路由，且不获得 Workbench/terminal control API。composition root 创建 navigation coordinator 并把 route 输入交给它；不要让 `/main/codeHub`、`/main/mdViewer`、`/main/chat` 各自再创建一个 WorkbenchShell，也不要在 router guard 中直接 mutate layout/document/Agent store。

活动内容变化时，navigation coordinator 用 `router.replace` 投影到对应公开 path（Agent -> `/main/codeHub`、文档 -> `/main/mdViewer`、Chat -> `/main/chat`），只更新内容类型与允许的 Agent query，不编码 group/item。每次事务有单调 `navigationEpoch` 和 `origin = external-route | sidebar | workbench-projection`；projection 产生的 route 回声只更新侧栏/highlight，不再次 open/focus item。外部 route/第二实例 intent 按 requestId 幂等，迟到 epoch 不覆盖新激活项。侧栏高亮以当前公开 path 为准，因此点击组合 tab、键盘切 tab和导航到 parked item 后都必须同步 path；单纯拖 splitter 或在不改变 active item 的情况下重排 tab 不更新 route。

## 5. 项目上下文契约

### 5.1 上下文来源

新增 host 可消费的轻量 `ActiveWorkspaceContext`：

```js
{
  workspaceKey: 'cwd:D:/repo',
  cwd: 'D:/repo',
  label: 'repo',
  source: 'codeHub',
  agentType: 'claudeCode',
  providerProjectId: '...',
  changedAt: 1784300000000
}
```

该 context 通过 CodeHub 的公开 component emit/adapter 发布，host 只订阅一份；禁止 provider 分别写 localStorage、全局 window 变量或 host store。同步发布只包含已有内存字段，不做 realpath、磁盘访问或 session scan。`workspaceKey` 使用跨平台 lexical normalization（绝对路径、统一分隔符、Windows drive/case 规则）用于 UI identity；UI identity 和其中的 `cwd` 只是显示/关联提示，不能作为 main 创建 PTY 的授权依据。

main 维护独立的 authorized workspace registry：key 是 `workspaceKey`，value 是 main 从 app-owned project record 或用户显式文件夹选择结果解析出的规范化 realpath。CodeHub 激活只发布 key；terminal control 请求也只提交 key，main 必须从 registry 取真实 cwd，再检查路径仍存在且为目录。未知/失效 key 触发受控文件夹选择或明确报错，绝不接受 renderer 临时提交任意 cwd。registry 只保存项目根授权，不保存 provider transcript/session，也不写入 `.claude`、`.codex` 或项目目录。

UI context owner 是当前唯一 CodeHub 实例；授权 registry owner 是 main。CodeHub 仅在 active Agent project 真正变化时发布，不扫描磁盘、不写 provider 配置。host 只消费轻量字段，不能自行把一个 file path 升级为 terminal workspace grant。

fallback 顺序：

1. 当前 active CodeHub project 的 cwd。
2. 当前 active document 所在的已知 workspace root；不能把任意文件父目录永久冒充项目根。
3. 用户显式选择的 folder。
4. 无 cwd：终端入口要求选择目录，不默认落到应用安装目录或用户 home。

### 5.2 终端跟随规则

- `New Terminal`：使用当前 context cwd 创建，终端标题显示 workspace label 和 shell。
- 终端创建后 `cwd` immutable；shell 内 `cd` 不回写 workspace context。
- 切项目后，已有终端继续运行并显示旧项目标签；再次执行 `New Terminal` 才创建新 cwd 终端。
- `Focus Terminal`：优先聚焦当前 workspace 最近使用的 terminal，没有则创建。
- 可以显式“将终端移动到当前项目”，其语义是新建一个 terminal，不修改旧 PTY 的 cwd。

PTY 环境由 main 构建最小 allowlist 后在 fork `terminalHost` 时传入，只加入 `TERM`/`COLORTERM` 等终端必需字段；绝不合并 Claude/CodeX provider 配置、单次 Agent query env、API key 或认证对象。shell 内修改环境只属于该 PTY。main/terminalHost 不向 renderer 返回完整 env。

这样避免长任务在切 Agent tab 后突然跑到另一个目录。

## 6. 终端架构

### 6.1 技术选型

隔离 terminal renderer（独立 `WebContentsView`）：

- `@xterm/xterm`
- `@xterm/addon-fit`
- 后续按需增加 web-links/search，不在 V1 堆 addon

main broker + utility process：

- `utilityProcess.fork()` 启动独立 `terminalHost`；只有 terminalHost 加载 `node-pty` 并持有 PTY/子进程
- Windows 优先 PowerShell：`pwsh.exe` 存在则使用，否则 `powershell.exe`
- macOS/Linux 使用用户登录 shell (`$SHELL`)，缺失时回退 `/bin/zsh` 或 `/bin/bash`

本仓库 Electron 36.9.2 内置 Node 22.19.0，ABI 为 135。`node-pty@1.1.0` 当前包已包含 Windows x64/arm64 和 macOS x64/arm64 预编译文件，但仍必须在依赖落地后验证 Electron ABI 加载和打包产物；不能只以普通 Node 22 下 `require()` 成功作为验收。

不要用现有 `execCmd(cmd, dir)` 模拟终端：它是一次性、缓冲输出的任意命令执行接口，不支持交互输入、ANSI、resize、Ctrl+C 或长期进程。

### 6.2 Owner 与进程生命周期

新增：

```text
electron/terminal/
  terminalBroker.js
  terminalHost.js
  terminalHostProtocol.js
  terminalIpc.js
  shellResolver.js
  terminalValidation.js
  terminalViewManager.js
  terminalPreload.js

src/workbench/terminal/
  TerminalDockChrome.vue
  useTerminalDockController.js

electron/terminal-renderer/
  index.html
  terminal.js
  terminal.css
```

`terminalViewManager` 创建一个随主窗口生命周期的 sandboxed `WebContentsView` 并注册给 `NativeSurfaceCoordinator`：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、独立 partition、无 DevTools（生产）、最小 terminal preload。terminal view 不加载远程 URL，不复用主 renderer session/localStorage，不运行插件或 Markdown。主 renderer 只有 dock control/bounds API，没有 `TERMINAL_WRITE/DATA`；PTY 数据面只在 terminal view 和 main 之间流动。

terminal view 生命周期是显式状态机：`absent -> loading -> ready-hidden -> visible -> crashed/destroying -> absent`。只有收到 terminal preload 的 `TERMINAL_VIEW_READY(viewEpoch)` 后才可签发 create grant、show 或 focus；loading 期间的 host intent 只按 requestId 保留最后一个目标状态，超时进入可重试错误，不排队无限增长。每次重建递增 `viewEpoch`，旧 view 的 ready/data/state/bounds ack 全部丢弃。view crash 时先不可见并 kill 其全部 owned PTY，再向 host 投影错误；V1 不自动重启并伪装恢复旧 terminal tab，用户重试会创建新 view/PTY。

Electron 36.9.2 本地 `electron.d.ts` 已确认提供 `WebContentsView`、`BrowserWindow.contentView.addChildView/removeChildView`、`View.setBounds/getBounds` 和 `View.setVisible/getVisible`。实现时只有 `NativeSurfaceCoordinator` 可 add/remove 与设置最终 bounds/visible；terminal manager 只负责创建/destroy terminal view 并提交 desired state。日常显示切换使用 `setVisible`，不反复 remove/add；同一个 view 只能注册一次。V1 只有一个 terminal view，内部 xterm tabs 表示多个 PTY，避免为每个终端创建 renderer 进程。

main `terminalBroker` 是授权、renderer owner mapping、terminal descriptor、active id 和 host 生命周期的事实源；utility `terminalHost` 是 PTY 对象、输入/输出 seq 和进程退出的唯一 owner。两者通过 versioned、schema-checked message protocol 交互：

- broker `Map<terminalId, { hostEpoch, ownerTerminalViewId, ownerHostWindowId, workspaceKey, shell, createdAt, status }>`；另有按 terminal view 的有序 `terminalIds` 与 `activeTerminalId`
- terminalHost `Map<terminalId, { pty, seq, attached, pendingOutput }>`，不接触 BrowserWindow、layout、provider 或 settings
- create/write/resize/kill 先由 broker 校验 renderer role/owner/schema，再转发给当前 `hostEpoch`；terminalHost 同样校验 message version、epoch、terminalId 和大小上限
- 每窗口和全局数量上限，例如 8/16
- terminalHost 输出先到 broker，broker 只单播给 owner terminal view，不广播给主 renderer或其他窗口；broker 不长期缓存输出
- terminal view / owner host window destroyed、renderer crash/reload、app quit 时 broker 请求 terminalHost 杀掉相关 PTY；等待有界 ack 后 kill utility process 作为兜底，V1 不承诺跨重启恢复运行进程
- create 后 terminalHost 保留有严格字节上限的短暂 `pendingOutput`，terminal view 创建 xterm listener 后调用 attach；attach 返回/推送从 `seq=1` 开始的首屏数据，避免 shell prompt 早于 listener 而丢失。attach 后只保留 terminal view 的 xterm scrollback，不做长期输出缓存
- terminalHost 发生 error/exit 时 broker 将全部 descriptor 标为 exited/crashed、隐藏 view 并投影错误；旧 hostEpoch 消息丢弃。V1 不自动恢复 shell，用户重试创建新的 terminalHost/PTY。native addon 崩溃不得带崩 Electron main
- 不持久化 terminal descriptor、shell 输出、命令历史或环境变量

### 6.3 IPC 契约

所有 channel 先进入 `CORE_CHANNELS`，并分成 control plane 与 data plane：

| Channel | 方向 | Payload |
| --- | --- | --- |
| `TERMINAL_VIEW_VISIBILITY` | main-workbench renderer -> main | `{ requestId, viewEpoch, visibilityRevision, factors }`；提交最终可见性因子，不直接翻转 view |
| `TERMINAL_VIEW_BOUNDS` | main-workbench renderer -> main | `{ requestId, viewEpoch, visibilityRevision, bounds }`；rAF/throttle |
| `TERMINAL_VIEW_FOCUS` | main-workbench renderer -> main | `{ requestId }`；只聚焦已有 view |
| `TERMINAL_VIEW_NEW` | main-workbench renderer -> main | `{ requestId, workspaceKey }`；不携带 cwd、shell 或命令输入 |
| `TERMINAL_VIEW_SELECT` | main-workbench renderer -> main | `{ requestId, terminalId }`；只选择 owner 的已有终端 |
| `TERMINAL_VIEW_KILL_ACTIVE` | main-workbench renderer -> main | `{ requestId }`；由 terminal view 的 active id 决定目标 |
| `TERMINAL_VIEW_STATE` | main -> main-workbench renderer | `{ terminals: [{ terminalId, title, status }], activeTerminalId }`；无 cwd、输入或输出 |
| `TERMINAL_VIEW_READY` | terminal view -> main | `{ viewEpoch }`；preload/data listener 已就绪 |
| `TERMINAL_CREATE_GRANT` | main -> terminal view | `{ requestId, cwdToken }`；一次性授权 |
| `TERMINAL_CREATE` | terminal view -> main | `{ requestId, cwdToken, cols, rows, shellProfile? }` |
| `TERMINAL_ATTACH` | terminal view -> main | `{ terminalId, lastSeq: 0 }` |
| `TERMINAL_WRITE` | terminal view -> main | `{ terminalId, data }` |
| `TERMINAL_RESIZE` | terminal view -> main | `{ terminalId, cols, rows }` |
| `TERMINAL_KILL` | terminal view -> main | `{ terminalId }` |
| `TERMINAL_ACTIVATE` | main -> terminal view | `{ terminalId }`；切换可见 xterm 实例 |
| `TERMINAL_DATA` | main -> terminal view | `{ terminalId, seq, data }` |
| `TERMINAL_EXIT` | main -> terminal view | `{ terminalId, exitCode, signal }` |

规则：

- main 生成 `terminalId` 和一次性/短时 `cwdToken`，不信任任何 renderer 自报 owner 或 cwd。main 用 authorized workspace registry 将 `workspaceKey` 解析为真实 cwd；token 绑定 `ownerHostWindowId + ownerTerminalViewId + workspaceKey + expiresAt`，由 main 直接推送给 owner terminal view，不返回主 renderer。terminal view 只能消费一次该 token 创建 PTY。
- `terminalBroker` 是 terminal descriptors 和 `activeTerminalId` 的事实源；terminalHost 持有 PTY，terminal view 持有 xterm 实例，host 只消费 `TERMINAL_VIEW_STATE` 的轻量投影并发送 select/new/kill intent。select 由 broker 校验 owner 后更新 active id并单播 `TERMINAL_ACTIVATE`，不能由 host、terminal view 和 terminalHost 各维护一套 tab 顺序或活动状态。
- `create` 返回 descriptor 后，terminal view 先注册 data/exit listener再 `attach`；terminalHost 按 seq 经 broker 发送 pending output。重复 attach 以 `lastSeq` 幂等，不得重复写入 xterm。
- renderer `create/write/resize/kill/attach` 必须由 broker 校验 `event.sender.id === ownerTerminalViewId`；broker -> terminalHost message 再校验 `hostEpoch + terminalId`。主 renderer 即使伪造 channel也被拒绝。
- `cwd` 必须 `path.resolve`、存在且为目录；拒绝空值、文件路径和 NUL。
- `cols/rows/data` 做类型、长度和上限校验；resize rAF/throttle，不能每个像素事件发 IPC。
- shell 参数使用固定 profile 生成，V1 不接受 renderer 传任意 executable/args。
- terminal view 收到 data 按 `terminalId` 和单调 `seq` 路由，销毁实例后立即解绑 listener。
- broker push 必须在发送前检查 `webContents.isDestroyed()`；terminalHost -> broker 与 broker -> view 两段分别有 byte high-water mark，超过上限时分块/合并并报告可恢复 overflow 状态，不能无限积压内存。所有 main -> renderer push channel 也按目标 webContents 固定注册/单播，不能通过通用 `on(channel)` 订阅器暴露给其他 renderer。
- show/hide/bounds/focus/occlusion 都携带单调 `visibilityRevision + viewEpoch`。coordinator 先验证 surface owner/epoch，再只应用最新 revision；旧的 ResizeObserver、route watcher 或 modal close 回调晚到不能重新显示已隐藏 view。terminal 最终可见性只由 `hostVisible && workbenchRoute && terminalMode && dockVisible && !occluded && !windowHidden` 计算，main 不接受多个调用方各自直接翻转 visible。

### 6.4 安全前置条件

集成终端本质上允许用户执行任意本地命令，这是产品功能，但不等于任意网页或插件都应获得 PTY 权限。

当前主窗口仍配置了 `webSecurity: false`、`sandbox: false`、`nodeIntegration: true`。虽然 `contextIsolation` 已开启，终端功能上线前仍需要完成一次 Electron 安全审计，并至少做到：

1. 主窗口必须恢复 `webSecurity: true`、`nodeIntegration: false`、`nodeIntegrationInWorker: false`、`contextIsolation: true`、`sandbox: true`；这不是建议项，是 Phase 4 上线门槛。独立 Agent 窗口也要进入同一迁移清单，不能让旧窗口成为绕过路径。
2. terminal data plane 只通过隔离 terminal view 的最小 preload 暴露，不进入主 renderer 的 `window.electronAPI`。主 renderer 只获得 show/hide/bounds/focus/new/kill-active control plane；不暴露输入字节、输出、PTY 对象、任意 executable/args 或环境变量。所有 channel 使用 `CORE_CHANNELS`，main 按 sender role/owner 校验。
3. 移除 renderer Node 依赖：当前 CodeX 的 `electron-conf/renderer` 迁到既有 preload/main setting API；删除无有效调用者的 `execCmd` 任意命令 bridge，而不是把它当作终端后门保留。
4. 收窄现有 preload：不得继续暴露 Node `Buffer` 构造器、`path`/`os` 对象能力或宽泛的任意 key 设置写入给不可信内容；文件和设置 API 使用具名、校验过的 typed methods。旧调用按 allowlist 迁移并由 contract test 锁定。
5. 当前 `PluginView.vue` 通过 Blob dynamic import 在主 renderer 同一 JS realm 执行插件，插件可访问全局 `window.electronAPI`。terminal data plane 已通过独立 view 隔离，但插件仍能滥用 host 文件/Agent/control API，因此终端上线前仍必须将插件迁入独立 sandboxed `WebContentsView` 或关闭运行第三方插件代码；不得为省事开启 `webviewTag`。隔离内容使用独立最小 preload，仅暴露 `pluginApi`，禁止 terminal、Agent、文件系统、设置和通用 IPC。只把 `electronAPI` 不作为 prop 传入不构成隔离。
6. HTML 文档预览使用无 `allow-scripts`、无 `allow-same-origin` 的 sandbox iframe；`srcdoc` 注入默认 `default-src 'none'` 的独立 CSP，只按产品需要放行 data/blob 图片等静态资源，并对 HTML 和 URL 做 sanitizer。顶层导航、弹窗和下载全部禁止，链接默认 inert 或交回 host 的 typed open intent。HTML Preview 不得拿到 preload、host origin storage 或 terminal bridge。
7. 主 renderer 现有模型消息和文档大量使用 `v-html`，且 `src/utils/MarkdownIt.js` 允许 raw HTML。终端上线前必须统一建立经过测试的 HTML sanitizer/Trusted Types sink：模型、Markdown、mermaid、diff/highlight 和插件图标分别使用最小 allowlist；禁止事件属性、`script/style/iframe/object/embed`、危险 URL scheme 和可执行 SVG。不能把“Markdown parser 已转义部分文本”当作完整 XSS 防线。
8. 主页面增加阻断 inline/eval/未知远程脚本的 CSP，并按 Vite/Electron 实际产物验证；确需 worker/style/data/blob 的能力逐项 allowlist。CSP 与 sanitizer 都要覆盖流式更新，因为流式 `v-html` 也是 sink。
9. main broker 对 terminal create/write/resize/kill 做 sender role、owner、schema、大小、频率与实例数校验；terminalHost 对 broker protocol/epoch 再校验。输出只单播到 owner terminal view，terminal view/host window 销毁、崩溃、reload 或 app quit 全部 kill；terminalHost exit 不得结束 Electron main。
10. 不记录输入内容、输出内容、环境变量、token、cwd 完整敏感值或命令历史到诊断日志；错误只记录分类、terminalId 的非敏感短标识和退出状态。

开启 `sandbox: true` 有明确顺序约束：当前 root preload 直接 require Node `path`/`os` 和 `../packages/agent/preload`，不能先改 BrowserWindow 开关，否则 preload 会加载失败并造成白屏。先把 root + Agent bridge 构建为单一 sandbox-compatible preload bundle，只依赖 Electron 允许的 preload 能力并用纯 JS 校验/转换替代 Node helper；再切 BrowserWindow 安全配置，随后跑主窗口、Claude 独立窗口、CodeX 独立窗口和 packaged E2E。安全迁移必须是独立提交/阶段，不能和 Workbench 大模板重写混在同一个不可回滚 diff 中。

终端安全门槛以测试事实为准：若主 renderer 能调用 terminal data-plane channel，插件仍在主 realm 动态执行，`execCmd` 仍存在，或未净化的 `v-html` sink 仍可执行测试 payload，则 Phase 4 必须判定为未完成，不能通过“已建立后续安全任务”延期上线。

终端不是 Agent sandbox 的一部分。用户终端默认拥有当前用户权限，不能复用 Claude permissionMode 或 Codex sandboxMode 来制造错误安全感。

### 6.5 Native addon 与打包

依赖落地时必须完成一个独立 spike：

- 在 Electron utility process（不是系统 Node、也不是 Electron main）中加载 `node-pty`。
- Windows x64 开发与打包 smoke：PowerShell 启动、输入、ANSI、resize、Ctrl+C、退出。
- macOS arm64 打包 smoke：默认 shell、签名、公证、spawn-helper 执行权限。
- electron-builder 对 `.node`、ConPTY/OpenConsole 和 macOS spawn-helper 做正确 unpack/include；如需要配置 `asarUnpack`，Windows/macOS builder 文件同步更新。
- 清理无关架构的 PDB/prebuild，避免包体无谓增长，但不能误删目标平台产物。
- 安装后 smoke 不能只测 Vite dev。

若 `node-pty@1.1.0` 在实际 Electron/签名链路不稳定，再评估锁定 beta 或维护 fork；不建议优先采用只覆盖部分平台/ABI 的第三方 prebuilt fork。

## 7. UI 与交互

### 7.1 分屏

入口：

- item tab 右键：`向右拆分`、后续 `向下拆分`
- item toolbar：split icon
- 命令：`Open to the Side`
- 拖 tab 到另一个 group

行为：

- 左侧导航负责打开或聚焦内容，tab 与分屏操作负责决定内容放在哪一侧；导航本身不强制分屏。
- 新文档从 Agent 打开时默认仍在当前 group；显式“在侧边打开”才分屏，避免每次点击都打乱布局。
- 已在另一侧打开的文档或对话通过导航聚焦原位置，不生成重复 tab，也不擅自移回 active group。
- 关闭 secondary group 的语义是把其中 item 合并回 primary，不关闭资源，因此不触发 dirty guard；只有点击 document tab 的关闭按钮、`Ctrl+W` 关闭文档或退出应用才走 dirty guard。
- active group 有清晰但克制的边框/标题状态；键盘焦点决定命令目标。
- V1 不做任意 pane 嵌套和浮动窗口。

小窗口折叠规则固定：宽度不足以同时满足侧栏和两个 `320px` group 时，secondary group 变为非可见 parked group，primary 占满；item 的 group 归属不改写，宽度恢复后原位展开。parked group 不能保持键盘焦点或拦截快捷键；导航命中 parked item 时先把它提升为 primary active，或在宽度允许时恢复分屏。不得通过把两个 group item 合并到一个数组来实现响应式折叠，否则窗口 resize 会永久改变用户布局。

首发快捷键：

| 操作 | Windows/Linux | macOS |
| --- | --- | --- |
| 打开/聚焦终端 | `Ctrl+\`` | `Cmd+\`` |
| 新建终端 | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| 拆分到右侧 | `Ctrl+\\` | `Cmd+\\` |
| 聚焦下一 group | `Ctrl+1/2` 或命令面板 | `Cmd+1/2` |
| 关闭当前 item | `Ctrl+W` | `Cmd+W` |

快捷键必须接入现有 shortcut store。`Ctrl+W` 根据当前组合 tab kind 路由到 CodeHub project close、document dirty close 或 `chat:simple` hide；active focus 位于 parked/不存在的 group 时先 normalize。xterm 获得焦点时让复制、粘贴、终端输入和 Ctrl+C 优先，不能被 CodeHub/文档全局监听器抢走。

### 7.2 终端输入区

- Agent 输入框上方增加 `[对话输入] [>_ 终端 · 项目 A]` 模式标签，以及 `+`、kill、expand/restore、close。
- terminal tab 标题：`repo: PowerShell`，重复时加序号。
- cwd 失效时显示可恢复错误，不静默回退。
- 输入区展开或窗口 resize 后调用 FitAddon，再向 main 发 cols/rows。
- 主题从现有四套 `--cc-*` token 映射到 xterm theme；不要硬编码仅适合 dark 的 ANSI 背景。
- 链接识别 V1 可不做；后续点击本地路径必须复用 document locator 和项目上下文校验。

## 8. 持久化与缓存

### 8.1 Workbench layout

| 项 | 约束 |
| --- | --- |
| owner | host `useWorkbenchStore` |
| key | `workbench.layout.v1`；V1 主窗口只有一份默认布局，独立 Agent 窗口不消费 |
| source of truth | userData app setting 中的 versioned layout descriptor |
| value | group、item reference、ratio、active item、input dock `expandedSizePx` 偏好；不含当前 mode/expanded 状态 |
| invalidation | schema version、未知 item type、资源不存在时局部丢弃 |
| limit | V1 2 groups、20 items、16 document items；字段字符串和 descriptor 总体积设上限 |
| mutation | renderer 内存同步更新；splitter pointerup、tab drop/close/open 后 300ms debounce 写入；app quit 前 main flush |

不把 layout 写到 localStorage 作为长期事实源。现有 route/tab localStorage 与 `openDocTabs` 只做一次性迁移输入，迁移成功写入 `migrationVersion` 后不再读取/回写。持久化必须使用具名 Workbench setting IPC，而不是让 renderer 通过通用 `setSetting(anyKey, anyValue)` 写任意 app setting。

layout 保存使用 main 的 temp-file + fsync/close + atomic rename（平台失败时保留 last-known-good）协议；读取按 current -> last-known-good -> default 降级，并记录不含路径/正文的错误分类。迁移使用 `migrationState = pending | committed`：先从旧数据构建并校验新 descriptor，原子写入成功后才 committed；只有 committed 才停止读取旧源并删除旧写路径。应用或 renderer 在中途崩溃时可安全重试，同一 migration version 必须幂等。

只持久化 clean descriptor；dirty 文档正文不进入 layout。应用关闭、更新安装和 renderer 崩溃时，dirty guard/恢复策略必须明确：正常用户关闭走统一 `beforeCloseAll()`，逐个询问保存/放弃/取消；托盘隐藏不是关闭，不触发丢弃；renderer crash 不承诺恢复未保存正文，但不能把旧 clean 内容覆盖文件。V1 若不实现 crash draft journal，需在 UI 与非目标中明确。

真正退出使用 host lifecycle `CloseCoordinator`，不依赖浏览器 `beforeunload` 异步弹窗。它不是 Workbench store 的方法：renderer 的 `closeParticipantRegistry` 按固定顺序注册 document dirty、Agent/Chat flush 和未来其他资源，Workbench 只注册 document controller participant；main 只认识 `ready/cancel/error` 聚合结果，不 import renderer domain。

关闭协议：

1. main 收到 app quit、更新安装或开发窗口 close 时生成 `closeRequestId`，先发 `APP_REQUEST_CLOSE`，暂缓销毁窗口。
2. renderer 的 participant registry 执行 `beforeCloseAll()`；dirty 文档使用一个聚合列表/逐项决策保存、放弃或取消，不能同时弹多个 modal；保存串行执行并在每项写入前重新检查 canonical file signature。Agent/Chat 只 flush 已有同步/短时持久化接口，不等待无限后台任务。
3. renderer 回复 `APP_CLOSE_READY` 或 `APP_CLOSE_CANCEL`；main 仅接受 owning main window 和匹配 requestId，设置超时并防重复。
4. cancel 恢复正常 UI；ready 后 main 依次 kill PTY、flush settings/DB、执行原有 runtime/update quit 流程。更新安装也必须走同一协调器，不能直接跳过 dirty guard。
5. renderer crash 或超时不能弹出假成功；普通用户退出保留窗口并提示，强制更新/系统关机按平台限制记录非敏感原因并走已定义降级。测试模式可显式选择 discard，生产默认不静默丢文档。

生产环境点击窗口关闭目前是隐藏到托盘，继续保持该语义：hide 不触发 CloseCoordinator，也不 kill PTY；用户选择“退出应用”或更新安装才是真正 quit。开发模式窗口 close 目前直接 quit，改造后也必须先走 CloseCoordinator。

### 8.2 Terminal

| 项 | 约束 |
| --- | --- |
| owner | main `terminalBroker`（授权/descriptor）+ utility `terminalHost`（live PTY） |
| key | broker 生成 `terminalId`，绑定 `hostEpoch` |
| source of truth | live PTY process |
| cache | attach 前有严格字节上限的 pending output；attach 后 xterm scrollback 仅 terminal view 内存 |
| invalidation | exit、kill、owner window destroyed、app quit |
| limit | scrollback 行数、每窗口实例数、data chunk 上限 |
| mutation | 只有 terminalHost 创建/销毁 PTY；broker 校验和转发，terminal view 发输入/resize，主 renderer 仅发 control intent |

V1 应用重启后不恢复运行中的 shell，也不持久化 terminal descriptor 伪装为存活 tab；重启后 input dock 回到 chat 模式。不要序列化 terminal output、命令历史、cwd 环境快照或环境变量。

## 9. Work Graph

### 9.1 切换 Agent 项目

| 优先级 | 工作 |
| --- | --- |
| P0 | CodeHub 更新 active tab/project；发布轻量 `ActiveWorkspaceContext` |
| P1 | Agent 当前 session 首屏按既有链路恢复 |
| P2 | 更新“新建终端”的默认 cwd 和 workspace label；不触碰现有 PTY |
| P3 | session scan、metrics、背景 repair 继续按现有 scheduler 运行 |

禁止在项目切换同步段创建终端、扫描 shell profile、持久化整棵布局或读取文件树。

### 9.2 打开文档到侧边

| 优先级 | 工作 |
| --- | --- |
| P0 | 创建/复用 document item，创建 secondary group，立即显示 loading shell |
| P1 | 按现有文档读取链路加载当前文件首屏 |
| P2 | 回填标题、viewer type、scroll state，交互结束后持久化布局 |
| P3 | recent docs、其他文档懒恢复 |

同一 canonical file identity 只能有一个 document resource owner；多个 group 若以后允许同文件双视图，必须共享 text/dirty state，不能复制编辑缓冲区。

文档 controller 必须跟踪 main 返回的 canonical identity 和已加载文件签名，并处理 Agent/终端/外部编辑器写文件：

- clean 文档收到文件变化后 debounce 重新读取，并保持合理 scroll/focus；不在 file watcher 回调里同步读取大文件。
- dirty 文档检测到磁盘签名变化后进入 conflict 状态，禁止直接保存覆盖；用户选择“比较/重新加载并放弃本地/仍然覆盖”后才继续。
- 可编辑大小上限内的加载结果使用 `{ canonicalDocumentKey, mtimeMs, size, contentHash }`；保存必须调用 main typed `DOCUMENT_COMPARE_AND_SAVE` 并携带 expected signature。main 在写入前重新读取/校验 hash，匹配后使用同目录 temp file + flush/close + replace，返回新 signature；不匹配返回 conflict，renderer 不能绕过 typed API直接 `writeFileSync`。
- 自己保存时记录 main 返回的 write token/new signature，watcher 将匹配事件视为 self-write，避免误报外部冲突。明确“仍然覆盖”也要携带用户确认 token，短时、单次、绑定 canonical key 和当前内容 hash。
- main `documentWatchManager` 按 canonical key 去重底层 watcher，renderer document controller 只订阅资源事件；最后一个 document subscriber close/reload/window destroy 后释放。watcher/subscriber 数量、事件队列和 debounce 有上限；布局/缓存不保存 watcher 或全文。
- OS 文件 API 没有通用 compare-and-swap；hash 校验到原子 replace 之间仍有极窄竞争窗口。V1 通过同目录原子替换、保存后复核 signature 和明确 conflict 降低风险，不宣称跨所有编辑器强一致。若保存后复核异常，文档保留 dirty/conflict，不标记 clean。

没有这层契约，用户在 Agent 修改文件后从文档编辑器保存，会静默覆盖 Agent 改动，因此它是 Phase 2A 的完成条件，不是后续增强。

### 9.3 创建终端

| 优先级 | 工作 |
| --- | --- |
| P0 | Agent 输入区切换到 terminal creating state；trusted host 请求 main 校验 workspace 并显示隔离 terminal view |
| P1 | terminal view 消费 cwdToken；broker resolve 固定 shell profile 并请求 terminalHost spawn PTY，返回 id；xterm attach 并 fit |
| P2 | broker-owned terminal tab descriptor/最近使用项更新并投影给 host |
| P3 | 无自动 scan、无命令日志、无 provider registry 写入 |

取消/去重：control plane 与 terminal view data plane 各使用 `requestId`；main 以 owner + requestId 防止双击创建重复终端，完成或超时后清理 pending request/cwdToken。spawn 超时不保留半初始化 Map entry。

## 10. 分阶段实施

### 10.0 交付与回滚纪律

本方案必须拆成可独立验证、可独立回滚的变更，禁止一个大 PR 同时重写 `Main.vue`、两个 provider 输入区、文档状态、插件运行时和 Electron 安全配置。推荐提交/PR 序列：

1. characterization/contract tests：冻结现有路由、CodeHub 单实例、文档 dirty、Chat stream、独立窗口和 preload surface，不改 UI。
2. 共同平台底座：typed IPC/schema、main-authoritative window role、revision persistence、sandbox-compatible preload bundle 和 CloseCoordinator 骨架；不改变正式 UI/安全开关。
3. 业务边界轨：Agent 公共 adapter、document controller、Chat 激活边界和 typed intent；均先在旧 UI 下运行。
4. 安全轨：renderer Node 迁移、BrowserWindow 安全开关、CSP/sanitizer 和插件隔离；与业务边界轨分 PR 并可并行。
5. Workbench：layout、组合 tab、双栏和真实内容接线；依赖业务边界轨，不得 import 安全轨内部实现。
6. 隔离 terminal view + PTY：只在安全轨与 Workbench 验收均通过后启用。

每个阶段合入前运行相关单测、contract、build；涉及 BrowserWindow/preload/IPC 的阶段额外跑 Electron E2E，涉及 node-pty 的阶段跑 packaged smoke。旧路径只在新链路验收通过后删除；不得长期保留双写和两个事实源。feature flag 只用于迁移/回滚，使用 app-owned typed setting 或 build-time flag，禁止散落 localStorage；每个 flag 必须登记 owner、默认值、启用条件、回滚行为、删除阶段和两侧测试，不能成为永久分叉实现。

### Phase 0：现状保护与风险验证

- 为现有整页 Agent/文档/Chat、CodeHub 单实例、文档 dirty close、Chat stream、独立 Agent 窗口、文件关联和 preload surface 增加 characterization/contract tests。
- 定义并测试 `layout descriptor -> item registry -> domain controller` 单向数据流、`surfaceState`、`ActiveWorkspaceContext`、external tab/input dock adapter 和 typed route intent 的纯数据契约；此阶段不接正式 UI。
- inventory 所有 renderer Node 依赖、preload API、`v-html` sink、插件动态执行路径、窗口 role 和 quit/update 入口，形成可逐项清零的清单。
- 做 `node-pty + Electron 36` Windows/macOS 开发与打包 spike，不接正式 UI、不加入产品依赖链；确认版本、ABI、asar、签名、公证和失败回退。

#### 2026-07-18 开发记录

- 已增加 layout model、typed navigation intent、host/Agent import boundary、layout persistence 和 Codex runtime config 的 contract tests；`npm run test:contract` 当前通过 460 tests。
- 已在 Windows x64 开发环境做独立 spike：`node-pty@1.1.0` 在 Electron 36.9.5 utility process（ABI 135）内加载成功，能启动 PowerShell 并收到 ANSI 输出。复现命令为 `npm install --no-save --package-lock=false node-pty@1.1.0` 后运行 `./node_modules/.bin/electron tests/terminal-pty-spike-host.cjs`。
- 此结果不等价于终端功能可上线：未把 `node-pty` 加入产品依赖，Windows 安装包、macOS arm64 签名/公证包以及 resize/Ctrl+C/退出 smoke 仍是 Phase 4 的强制验收项。

完成条件：基线测试能在后续阶段准确发现路由污染、重复挂载、dirty 丢失、stream 中断、preload 扩权和独立窗口回归；四类契约可用纯逻辑测试表达；PTY 在 Windows 安装包与 macOS 签名包真实运行，或明确判定终端路线暂不可行。Phase 0 不拆业务组件、不改变窗口安全开关、不修改用户可见布局。

### Phase 1：共同平台底座

- 在 `CORE_CHANNELS` 建立 typed IPC/schema/size limit 与 main-authoritative `windowRole`；先保持现有 bridge 行为，禁止在此阶段扩展 renderer 权限。
- 构建 sandbox-compatible root + Agent preload bundle，但暂不强制切换所有 BrowserWindow 安全开关；先证明主窗口和独立 Agent 窗口加载/回滚路径稳定。
- 为 Workbench layout/app-owned setting 建立具名 typed API、revision/epoch 校验、原子写入和损坏备份恢复，不继续依赖任意 key `setSetting`。
- 建立 `CloseCoordinator` 的 main/renderer 握手骨架，先保持当前托盘 hide、正常 quit 和 update 行为，再由 Phase 2A document controller 注册 dirty hook。
- 建立统一 HTML sanitizer 接口和 sink inventory；Phase 2A 的 HTML preview 只能消费该接口，不能自行再造 sanitizer。

#### 2026-07-18 开发记录

- 已实现 versioned layout descriptor 的 main-side repository：原子写、last-known-good 回退、单调 revision 和 main-authoritative window instance 校验。
- 已实现 `main-workbench | standalone-agent` 的 main-side role registry；layout load/save 与 close response 仅接受已登记的 main workbench sender，renderer 不能自报 role 或写入任意 settings key。
- 已实现 CloseCoordinator 的 renderer participant registry 与 main/renderer handshake 骨架；当前未接管退出路径，故不会改变托盘 hide、普通 quit 或更新安装的既有行为。document dirty participant 在 Phase 2A controller 落地后注册。
- Phase 1 尚未完成：sandbox-compatible preload bundle、HTML sanitizer/sink inventory 和真实 Electron 窗口 E2E 仍未完成，不能据此打开 Phase 2/4 的 gate。

完成条件：现有主窗口、独立 Agent 窗口、文件关联、托盘 hide、正常 quit/update 和 preload bridge 回归通过；window role、layout revision、CloseCoordinator requestId 和 typed IPC schema 有纯逻辑/contract tests；此阶段不改用户布局、不拆业务组件、不给 renderer 新增通用能力。

### Phase 2A：业务边界拆分（保持旧 UI）

- 把现有 `mdViewer` 拆为 `DocumentHome`、按 canonical file identity 唯一的 document controller/store 和 `DocumentItemView`，保留现有 dirty guard、懒加载、滚动、编辑模式与旧路由 compatibility shell。
- 加入 document file signature/watcher 和 dirty external-change conflict；HTML 接入 `源码（默认）/ 预览 / 分屏` 安全模式。
- 为 CodeHub 实现公开 external tab adapter、`surfaceState`、`ActiveWorkspaceContext` 和 `AgentInputDockShell`；默认仍使用旧内部 tab/输入区，在 feature flag 下验证 external 模式。
- `ChatView` 保持唯一实例和内部 session owner；只增加可被稳定 host 激活/隐藏的公开边界，不拆 session item。
- 实现 `OPEN_WORKBENCH_ITEM` typed intent、ready/drain、幂等和旧 `mdRouting` compatibility adapter；覆盖首页、文件关联、第二实例、Agent 链接和 Git Changes Drawer。
- 建立 main authorized workspace registry；project record/用户选择是授权源，renderer context 不能签发任意 cwd。

完成条件：旧整页 UI 下行为不变；每类业务状态只有一个 owner；CodeHub/Chat 不重复挂载，composer 在 external 模式切换时不销毁；文档 controller 的 canonical identity、compare-and-save、dirty/外部冲突通过测试；HTML 源码模式通过测试，preview 实现可在 flag 后等待 Phase 2B sanitizer/CSP 子门槛；新旧 route intent 对照结果一致且无长期双写。完成后才能让 Workbench 接管摆放。

### Phase 2B：Electron 安全轨（可与 2A 并行）

- 迁移 CodeX `electron-conf/renderer`，删除 `execCmd`，把通用 Buffer/path/os/settings/file 能力收敛为具名 typed API。
- 按“先 preload、后 BrowserWindow 开关”恢复主窗口与独立 Agent 窗口的 `webSecurity/contextIsolation/nodeIntegration/sandbox` 安全基线。
- 完成统一 `v-html` sanitizer/Trusted Types sink 和 CSP，覆盖流式模型消息、Markdown、mermaid、diff/highlight、插件图标与 HTML preview。
- 把第三方插件迁入独立 sandboxed webContents + 最小 plugin preload；terminal/plugin 原生视图统一接入 `NativeSurfaceCoordinator`，并建立 main-workbench、standalone-agent、terminal、plugin 的 sender role/owner allowlist。

完成条件：现有用户行为与独立 Agent 窗口回归通过；主窗口安全配置满足 6.4；第三方插件无法访问 host/Agent/terminal API；`execCmd`、renderer Node import 和未净化 HTML sink 的阻断型测试通过。该轨必须独立提交和回滚，不能夹带 Workbench 模板改造。Phase 3 可与本轨并行开发，但 HTML preview 在其 sanitizer/CSP 子门槛通过前保持关闭；Phase 4 必须等待本轨全部完成。

### Phase 3：Workbench 与真实内容接线

- 新增 host `WorkbenchShell`、group、组合 tabs、splitter、item registry、`WorkbenchItemHost + Teleport anchor` 和 versioned persistence。
- 接入唯一 CodeHub、真实 document item、`document:home` 和唯一 `chat:simple`；Workbench 只持有轻量 descriptor，不复制领域状态。
- 把 route/navigation 正式切到 typed open/focus intent，保持旧公开路径、独立窗口、第二实例、文件关联和 Agent 链接兼容。
- 支持显式左右分屏、真实 tab 跨栏移动、secondary merge、窄屏 parked group、焦点/快捷键治理和 CloseCoordinator dirty hook；达到 20/16 上限时明确提示。
- 迁移旧 `openDocTabs`/route 状态后删除旧写路径；feature flag 验收通过再切默认，并删除迁移 flag，禁止长期双实现。

完成条件：普通点击侧栏文档/简易对话仍能直接整区切换且不会自动分屏；只有一条组合 tab strip；Agent 项目 tab 仍由 CodeHub 管理，移动 Agent 会整体移动唯一 surface；Agent + 文档、Agent + Chat、文档 + Chat 均可并排；真实 tab 移动不重挂载、不丢 dirty、不打断 Chat stream；hidden/parked surface 不抢快捷键或焦点；布局热路径无 session scan 或磁盘 I/O；刷新、退出和更新符合身份/dirty 契约。

### Phase 4：Agent 输入区项目终端 V1

- 接入 sandboxed terminal `WebContentsView`、xterm、main broker、utility terminalHost、control/data plane IPC 和 owner cleanup。
- 默认 cwd 跟随 `ActiveWorkspaceContext`，创建后锁定。
- 在 Agent 输入区实现“对话输入 / 项目终端”互斥模式；左下角入口负责聚焦 Agent 并切到终端。
- 终端支持向上扩展和恢复，不创建独立页面、底部面板或第二套堆叠输入框。
- 多 terminal tabs、resize、kill、Ctrl+C、复制粘贴、四主题适配。
- 补 Windows/macOS packaged E2E。

完成条件：Phase 2B 与 6.4 的安全门槛持续通过；main renderer 无 terminal data plane；对话输入与终端同一时刻只显示一个，切回对话不丢 composer 状态；终端可向上扩展查看完整输出并恢复；真实长任务、交互命令、ANSI、中文、resize、项目切换、renderer/terminal view crash 和窗口关闭均符合契约，无孤儿进程。

### Phase 5：后续 IDE 能力扩展

- 可选上下分屏、拖拽 group、终端链接/路径跳转。
- 在相同 workspace context 上增加文件树、搜索、Problems/Output，而不是另建互不感知的导航页。

终端进入内容分屏、独立底部面板或独立页面均不属于当前路线；若未来真实使用反馈要求改变，再单独评审其生命周期和输入区关系。

## 11. 测试与验收

### 11.1 纯逻辑/契约测试

- layout split/merge/move/normalize/version migration。
- layout revision/epoch：旧 debounce save、旧 renderer 和迁移中断不能覆盖最新/last-known-good descriptor；atomic write 失败安全降级。
- item singleton、document path 去重、active group fallback。
- 跨 group 移动保持同一 `itemId`，最后一个 secondary item 移出后自动合并。
- 窄窗口 parked group 不改写持久化归属；焦点/导航/宽度恢复按 7.1 normalize。
- layout descriptor 不含 message、document text、dirty buffer、terminal output、provider session 或 PTY 对象；未知或失效 item 安全丢弃。
- descriptor allowlist、schema version、20/16 数量上限、字符串/总体积上限和 prototype-pollution payload 拒绝。
- document controller 按 canonical file identity 单 owner；lexical alias/symlink/Windows case 路径合并正确，双 dirty alias 进入 conflict；`chat:simple` 单实例；两侧打开、聚焦或移动同一资源不会触发第二次初始化、第二条 stream 或第二套持久化。
- document compare-and-save：expected hash 匹配才写入；不匹配、用户 override token 过期、自身写事件、保存后复核异常和 alias merge 均符合 conflict 契约。
- CodeHub 无论分屏、收起或 item 移动均维持单实例；组合 tab adapter 只暴露轻量 summaries/commands；host 不可 import provider 私有模块，`packages/agent` 不可 import `src/workbench`。
- item adapter snapshot/subscribe 不包含重型业务数据、不轮询、不触发 scan，dispose 后无 listener；layout restore 不 eager mount 全部 document editor。
- surface visible/active/group 协议唯一计算；hidden/parked item 无全局快捷键、focus 或 search ownership，后台 stream 不受影响。
- external input dock 激活/恢复不会丢 Agent 草稿、焦点、滚动或当前运行会话。
- workspaceKey 路径规范化和 Claude/CodeX 同 cwd 合并。
- workspace context 只从 CodeHub adapter 发布，切换热路径无 I/O；lexical UI identity 与 main realpath 安全校验分离。
- 项目切换不修改已存在 terminal cwd。
- terminal spawn env 不含 provider/query API key 或认证配置，renderer 无法读取完整 env。
- terminal control/data plane sender-role validation、cwdToken、owner authorization、request dedup、limit、exit cleanup；broker/terminalHost version + hostEpoch 校验；主 renderer不能发送 write/attach/data-plane 请求。
- terminal create/listener/attach 首屏不丢 prompt，重复 attach 不重复输出，seq gap/overflow 可恢复。
- terminal view ready/crash/recreate epoch 和 visibility revision：旧 ready/bounds/modal callback 不得重显或操纵新 view，loading queue 有界，crash 清理 owned PTY。
- terminalHost utility crash/exit 不影响 Electron main；broker 丢弃旧 hostEpoch 消息、投影全部 terminal exited，并在 shutdown ack 超时后强制 kill utility process；terminalHost 收到 parent-port close/进程信号时先 best-effort kill 全部 PTY。
- NativeSurfaceCoordinator 是 contentView/z-order/occlusion 唯一 owner；terminal/plugin desired state 不能造成双 surface 重叠、旧 surface 复活或 manager 越权 add/remove。
- IPC channel registry、main/terminal/plugin 三套 preload allowlist、host/agent import boundary；`execCmd` 与 renderer Node import 不得出现；document renderer 无通用 write API 路径。
- architecture fitness：`packages/agent` 不得依赖 `src/**`；document domain 不得依赖 Workbench；Workbench core 不得 import provider private store、document text/store 或 terminal data-plane；`Main.vue` 不得直接实现领域 mutation/lifecycle。
- 插件隔离契约：plugin webContents 的 preload keys 不含 terminal/Agent/file/settings API，主 renderer 不再 Blob import 第三方 entry code。
- HTML sink/CSP 契约：raw HTML、事件属性、危险 scheme、SVG/script 测试 payload 在模型消息、Markdown、mermaid、diff/highlight 和插件图标路径均不可执行；流式更新同样覆盖。
- typed route intent 兼容与幂等：`/main/codeHub`、`/main/mdViewer`、`/main/chat`、旧 redirect、ready/drain、第二实例和外部文件关联。
- windowRole 由 main 登记，standalone Agent 不挂 Workbench、没有 terminal/workbench control preload；伪造 renderer role 无效。

### 11.2 Renderer 测试

- splitter resize 不触发业务重挂载。
- 普通点击侧栏文档/简易对话在 active group 整区切换，不创建 secondary group；目标已在另一侧时只聚焦原位置。
- 左右真实 tab 互拖不复制或重挂载业务内容，焦点落到移动后的 group。
- 组合 tab 始终只有一条；拖动 Agent 项目 tab 时整体移动 CodeHub，document/chat tab 独立移动。
- dirty document 跨栏移动、响应式折叠和关闭 secondary group 均不提示且不丢编辑状态；真正关闭 document item 或退出应用才提示。
- clean 文档外部变化自动刷新；dirty 文档外部变化进入 conflict，不允许直接保存覆盖；自身保存不误报冲突。
- 正常关闭、取消关闭、托盘隐藏、更新安装与 renderer crash 分别符合持久化/dirty 契约。
- CloseCoordinator requestId、owner、timeout、cancel/ready 去重正确；更新安装不绕过 dirty guard。
- HTML 首次打开默认为源码；源码、sandbox 预览、源码/预览分屏切换和编辑刷新正确。
- Agent 输入 dock 的对话/终端模式互斥；native terminal view 在移动、扩展、DPI/zoom/resize 后 bounds 正确，隐藏时不遮挡/抢焦点，恢复不丢输入输出。
- Settings、permission/ask/plan、文件对话框前置 modal、图片预览和窗口 hide/minimize 时 terminal view 遵守 occlusion 协议，恢复后焦点正确。
- Workbench/Plugin 路由快速切换和全局 modal 嵌套时，NativeSurfaceCoordinator 只显示最新合法 surface，DOM chrome 不被原生层吞事件。
- xterm focus 时快捷键优先级正确。
- 四主题下 xterm、group tab、active border 可读。
- 视口低于阈值时布局安全折叠。
- 16 个 document item 的 lazy mount/切 tab/拖 splitter heap 与长任务测试不出现无界增长；隐藏 editor 不保留无主 observer/listener。

### 11.3 Electron E2E

- boot -> 选择/模拟项目 -> 从左下角聚焦 Agent 终端输入区 -> `pwd`/`Get-Location` 等于项目 cwd。
- 输入、stdout/stderr、ANSI、resize、Ctrl+C、exit code。
- 在对话输入和终端之间切换，并扩展/恢复终端，确认不存在独立终端页面或第二套输入框。
- 切换到另一个 Agent 项目后旧终端 cwd 不变，新终端使用新 cwd。
- reload/close/quit 后无 PTY、ConPTY、PowerShell/zsh 孤儿进程。
- 主 renderer/terminal view/terminalHost crash 后 PTY 按 owner/hostEpoch 契约清理；terminalHost crash 不带崩 main；主 renderer和隔离插件尝试访问 terminal data plane 失败。
- terminal view loading 超时、crash 后重试、连续 modal/窗口 hide/show 与快速 resize 不出现原生层残留或旧 epoch 复活。
- 文档外部关联打开到 Workbench，Agent 会话仍继续运行。
- 旧 `/main/claudeCode`、`/main/codex` 独立窗口和 `/main/codeHub?projectId=&chatId=` 目标恢复正常。
- Windows installer 与 macOS signed app 各跑一次 native-addon smoke。

交付前运行：

```text
npm test
npm run test:contract
npm run build
npm run test:e2e
```

## 12. 非目标

V1 不包含：

- 完整 VS Code 兼容或 Extension Host
- 任意深度 docking tree、浮动窗口、多显示器布局
- 两个并行 CodeHub/同 provider panel 实例
- 把每个简易对话 session 拆成独立 Workbench item；V1 只有一个 `chat:simple`
- 终端进程跨应用重启恢复
- renderer crash 后恢复未保存文档正文；V1 只保证正常关闭 dirty guard
- 终端命令审计、云同步、远程 SSH/容器终端
- 将用户终端错误地套进 Agent sandbox/approval 模型

## 13. 已确认的产品决策

以下决策已经确认，开发与验收均以此为准：

1. V1 最多两个 group，首发只开放左右分屏。
2. 终端默认复用 Agent 输入区，侧栏入口只负责切换/聚焦，不跳独立页面，也不叠加第二个输入框。
3. 左侧文档/简易对话保留直接整区切换；普通点击在 active group 打开或聚焦，只有显式“在侧边打开”、拆分命令或 tab 拖动才进入分屏。
4. 终端创建后锁定 cwd，切项目不迁移旧进程。
5. V1 单 CodeHub 实例，不支持 Agent + Agent 双开。
6. 左右 tab 可以互相拖动；移动的是同一内容实例，不复制业务状态。
7. HTML 默认显示可编辑源码，并提供 sandbox 预览和源码/预览分屏。
8. 终端只存在于 Agent 共用输入区，支持向上扩展；V1 不进入左右内容分屏。
9. 目标内容已在另一侧时，导航只聚焦其现有位置，不复制 tab，也不擅自移动内容。
10. V1 只有一条组合 tab strip；CodeHub 项目 tab 仍归 CodeHub，拖动 Agent 会整体移动唯一 CodeHub，不能把项目拆成两个 Agent surface。
11. 简易对话 V1 是唯一 `chat:simple` 内容项，内部管理会话，不为每个 session 创建 Workbench tab。
12. Item 使用稳定 host + Teleport anchor 移动，跨栏不得重建组件；上限为 20 items/16 documents。
13. 终端 data plane 必须运行在独立 sandboxed `WebContentsView`，主 renderer 只持有 control plane；上线前同时完成主窗口安全基线、renderer Node 能力收口和插件进程隔离，`execCmd` 或同 realm 第三方插件任一仍存在时不得上线。
14. 实施采用共同底座后的业务/安全双轨；Workbench 依赖业务轨，终端依赖 Workbench 与安全轨汇合，安全改造不得反向进入 Workbench core。
15. 文档 owner 使用 main 返回的 canonical file identity；布局和 native view 控制均使用 revision/epoch 拒绝迟到异步结果。
16. `node-pty` 只加载在独立 `terminalHost` utility process；Electron main 只做授权、broker 和生命周期协调，native addon 崩溃不得带崩主应用。
