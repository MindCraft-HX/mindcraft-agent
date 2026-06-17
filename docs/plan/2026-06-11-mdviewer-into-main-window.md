# 方案：文档浏览内嵌主窗口（VS Code 活动栏模式）

> 状态：待实施
> 前置依赖：无（侧边栏布局已上线，见 src/Main.vue）
> 预估工作量：主进程 ~1.5h + 渲染端 ~1h + 验证 ~1h

## 1. 背景与目标

现状：文档浏览（mdViewer）是一个**独立 Electron BrowserWindow**（`electron/mdWindow/index.js`）。侧边栏点"文档"、agent 消息里点文档链接，都会弹出新窗口。

目标：改成 **VS Code 活动栏模式**——左侧边栏作为活动栏，内容区在「编程（codeHub）」和「文档（mdViewer）」两个视图之间切换：

- 侧边栏"文档"→ 内容区切换到文档视图，codeHub 通过 keep-alive 保活不丢状态
- mdViewer **组件内部已有文件 tab 系统**（el-tabs，按 filePath 去重），多文档在它自己的 tab 里开，单独点入口就是空态视图，不存在"空白 tab"问题
- 所有"打开文档"动作（agent 消息、文档链接）都路由到主窗口内嵌视图，**不再弹独立窗口**

非目标（明确不做）：
- 不动顶部 agent 会话 tab 栏（那是 codeHub 内部的 project tabs，语义不同）
- 不做 mdViewer 主题适配（它自带 `--doc-*` 亮色变量，跟随 `--cc-*` 主题归后续主题任务）
- 不做"拖出为独立窗口"能力（以后有需求再立任务）

## 2. 现状关键事实（已核实，含行号）

### 渲染端调用方（共 6 处）
| 位置 | 调用 | payload |
|---|---|---|
| `src/Main.vue:112` | `openMdBrowser()` → `window.electronAPI.openMdWin()` | 无 |
| `packages/agent/src/components/claudeCode/components/messages/ToolMessageCard.vue:148-153` | `openMdWin({ filePath, content })` | filePath + content |
| `packages/agent/src/components/codeX/components/messages/ToolMessageCard.vue:169` | 同上 | 同上 |
| `packages/agent/src/components/claudeCode/components/messages/tools/ToolRead.vue:20` | `openMdWin({...})` | 类似 |
| `packages/agent/src/components/codeX/components/messages/tools/ToolRead.vue:20` | 同上 | 同上 |
| `packages/agent/src/components/agentCommon/render.js:31` | `openDocumentCandidate(...)`（agent 输出里的文档链接） | 主进程 resolve 后生成 docPayload |

### IPC / 主进程链路
- `electron/preload.js:72-80`：`openMdWin`（invoke `open-md-win`）、`onMdContent`（on `md-content`）、`getPendingMdContent`（invoke `md-viewer-ready`）
- `electron/main.js:30`：require mdWindow 模块；`main.js:50`：主窗口变量 `let win`；`main.js:68`：创建主窗口
- `electron/main.js:273`：`ipcMain.handle('open-md-win', (_e, payload) => openMdWin({ initUrl, env, payload }))`
- `electron/main.js:281`：`setupIpcHandlers(NODE_ENV, NODE_PLATFORM)` —— 目前**不传 win**
- `electron/mainModules/ipcHandlers.js:159-168`：`open-document-candidate` handler，内部回调 `openMdPayload` 调 `openMdWin`
- `electron/mdWindow/index.js`：BrowserWindow 创建 + `pendingPayloads` 队列 + `md-viewer-ready` flush（解决"窗口还没加载完就推内容"的 race）——**这套队列机制要保留思路，迁移到新模块**

### 渲染端组件与路由
- `src/router.js:41-44`：顶级路由 `/mdViewer` → `src/components/mdViewer/index.vue`
- `src/components/mdViewer/index.vue`：标准 Vue SFC，无独立窗口硬依赖
  - `onMounted`（~:244-259）：注册 `onMdContent` 监听 + `getPendingMdContent` 拉取存量
  - `addPayload`/`upsertTab`（~:108-178）：按 `filePath`/`id` 去重，**重复投递幂等**
  - 根节点 CSS `height: 100vh`（~:275）——内嵌后必须改
  - `<script setup>` **没有组件 name**——keep-alive include 需要 name
- `src/Main.vue:77`：`<keep-alive :include="['codeHub']">`
- `src/Main.vue:38`：文档项 SVG 引用了**不存在的** `#icon-mindcraft-wendang`（字体里只有 `icon-mindcraft-markdown`，已核实 iconfont.json 185 个 glyph 中无 wendang），顺带修复

## 3. 设计

### 3.1 路由与导航（渲染端）

1. `src/router.js`：
   - `/main` children 增加：
     ```js
     {
         path: 'mdViewer',
         name: 'mdViewer',
         component: () => import('@/components/mdViewer/index.vue'),
         meta: { parent: '/main/mdViewer' }
     }
     ```
   - 顶级 `/mdViewer`（:41-44）改为 `{ path: '/mdViewer', redirect: '/main/mdViewer' }`（兼容旧入口，零成本兜底；独立窗口移除后无人再加载它）
2. `src/Main.vue`：
   - `openMdBrowser` 改为 `router.push('/main/mdViewer')`（不再走 IPC）
   - 文档项 active 判断：`activeIndex === '/main/mdViewer'`
   - keep-alive：`:include="['codeHub', 'mdViewer']"`
   - 修图标引用：`#icon-mindcraft-wendang` → `#icon-mindcraft-markdown`
   - script 里需要 `useRouter()`（现在只有 `useRoute`），并注册 `onOpenMdViewer` 监听（见 3.3）
3. `src/components/mdViewer/index.vue`：
   - 加 `defineOptions({ name: 'mdViewer' })`（keep-alive 按 name 匹配，script setup 必须显式声明）
   - 根样式 `height: 100vh` → `height: 100%`（嵌在 el-main 里，100vh 会撑出滚动）
   - 其余逻辑**不动**（onMdContent/getPendingMdContent 机制原样可用）

### 3.2 主进程改造

新建 `electron/mdRouting.js`，**替代** `electron/mdWindow/index.js` 的全部职责：

```js
// 概念示意（实现时按现有代码风格写）
let mainWin = null            // 由 main.js 在创建窗口后注入
let mdViewerReady = false     // mdViewer 组件是否已挂载并完成首次握手
let pendingPayloads = []

function setMainWindow(win) {
  mainWin = win
  // 刷新/重载后渲染端监听器全部失效，必须重置握手标志
  win.webContents.on('did-start-loading', () => { mdViewerReady = false })
  win.on('closed', () => { mainWin = null; mdViewerReady = false })
}

function openMdInMain(payload) {
  if (!mainWin || mainWin.isDestroyed()) return
  if (payload) {
    if (mdViewerReady) mainWin.webContents.send('md-content', payload)
    else pendingPayloads.push(payload)
  }
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show(); mainWin.focus()
  mainWin.webContents.send('open-md-viewer')   // 通知渲染端切路由
}

function registerMdViewerHandlers() {
  ipcMain.handle('md-viewer-ready', () => {
    mdViewerReady = true
    const payloads = [...pendingPayloads]
    pendingPayloads = []
    return payloads
  })
}
```

接线改动：
- `electron/main.js:30`：require 改为 mdRouting；创建主窗口后调用 `setMainWindow(win)`
- `electron/main.js:273`：`ipcMain.handle('open-md-win', (_e, payload) => openMdInMain(payload))`——**频道名不变**，packages/agent 里所有调用方零改动
- `electron/mainModules/ipcHandlers.js:162-165`：`openMdPayload` 回调改调 `openMdInMain(docPayload)`（从 mdRouting require，**不需要**给 setupIpcHandlers 加参数）
- 删除 `electron/mdWindow/` 目录；确认 `registerMdViewerHandlers` 只在 mdRouting 注册一次（原 mdWindow/index.js:56-62 有同名 handler，避免重复注册报错）

### 3.3 preload 与渲染端监听

- `electron/preload.js`：新增
  ```js
  onOpenMdViewer: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('open-md-viewer', handler)
    return () => ipcRenderer.removeListener('open-md-viewer', handler)
  }
  ```
- `src/Main.vue`：`window.electronAPI?.onOpenMdViewer?.(() => router.push('/main/mdViewer'))`

### 3.4 时序（首次打开的 race 处理）

1. agent 消息点文档 → IPC `open-md-win(payload)` → 主进程：`mdViewerReady=false` → payload 入队 → 聚焦主窗口 → send `open-md-viewer`
2. Main.vue 收到 → `router.push('/main/mdViewer')` → mdViewer **首次挂载** → onMounted invoke `md-viewer-ready` → 主进程置 ready、返回队列 → 渲染文档
3. 之后再开其他文档 → ready=true → 直接 send `md-content` → keep-alive 下 mdViewer 监听器常驻 → `upsertTab` 新建/激活内部 tab
4. 双保险：即使出现重复投递，`addPayload` 按 filePath 去重，幂等无副作用
5. 主窗口刷新（dev HMR full reload / Ctrl+R）→ `did-start-loading` 重置 ready=false → 回到第 1 步路径，不丢内容

## 4. 验收清单

1. 侧边栏点"文档"→ 内容区切到文档视图（空态 `el-empty`）；切回"编程"，agent 会话/输入框状态不丢（keep-alive 生效）
2. 侧边栏高亮跟随当前视图；"文档"选中态图标正常（markdown symbol，不再是空白）
3. Claude Code / GPT Codex 会话里点 ToolRead / ToolMessageCard 的文档入口 → 主窗口聚焦、自动切到文档视图、文件以内部 tab 打开
4. agent 输出里的文档链接（render.js → openDocumentCandidate 链路）同样内嵌打开；不支持的类型仍走系统默认程序（`openWithDefault` 分支不动）
5. 同一文件重复打开不产生重复 tab；多文件多 tab、关闭 tab、关到 0 回空态，均正常
6. 文档视图内"打开文件"按钮（多选）、拖拽文件进来，均正常
7. **冷启动 race**：应用启动后第一次就通过 agent 链接开文档（mdViewer 从未挂载）→ 不丢内容（pending 队列生效）
8. **刷新 race**：dev 下 Ctrl+R 主窗口后再开文档 → 不丢内容（ready 重置生效）
9. `npm run build` 通过；打包版（file:// 协议）复验 3、4、7
10. 回归：floatWin / 截图 / 设置抽屉不受影响；手动访问 `#/mdViewer` 跳转到 `/main/mdViewer`

## 5. 风险与注意

- **不要动 packages/agent 里的 6 处调用方**：`openMdWin` preload API 名、`open-md-win` 频道名都保持不变，只换主进程语义——改动收口在 electron 层 + Main.vue + router
- keep-alive include 按组件 name 匹配：mdViewer 必须 `defineOptions({ name: 'mdViewer' })`，漏了会导致切走即销毁、文档 tab 全丢
- `height: 100vh` 不改会在内嵌时纵向溢出
- 主窗口引用走 `setMainWindow` 注入（main.js:50 的 `let win`），不要在 ipcHandlers 里另起 `BrowserWindow.getAllWindows()` 之类的第二条获取路径
- 原 mdWindow/index.js 删除时注意 `md-viewer-ready` handler 不能注册两次（`ipcMain.handle` 重复注册会 throw）
- mdViewer 是亮色系（--doc-* 变量），与 codeHub 暗色主题视觉上会有反差——本期接受，主题统一归主题任务
