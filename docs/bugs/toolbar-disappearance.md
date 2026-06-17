# v1.0.7+ ClaudeCode 工具栏异常 — 完整排查记录

> 创建：2026-06-15 | 最后更新：2026-06-16
> 状态：排查中（只读分析，不修改代码）
> 关联文档：`docs/settings-json-pollution.md`（settings.json 污染专项分析）

## 问题概述

v1.0.7 后生产版 ClaudeCode 输入框下方工具栏出现问题：

| 阶段 | 现象 |
|------|------|
| v1.0.7 首次安装 | 工具栏**不可见**（生产版） |
| v1.0.7 安装后，装回旧版（v1.0.5）| 旧版也坏 → **确认是持久化数据污染** |
| 同事全新安装 v1.0.8 | 同样无工具栏 → **排除旧数据迁移问题** |
| 诊断版生产构建（加红框 + ElMessage.error）| 工具栏**可见**（红色虚线框可见），但功能异常 |
| 模型切换 | `[ErrorBoundary] native event handler: An object could not be cloned` |
| dev 模式 | **全部正常**（用户当前在用 dev 对话） |

## 已排除的假设

| 假设 | 结论 |
|------|------|
| CSS scoped 不匹配 | ❌ 诊断版确认 DOM 渲染，CSS 正确加载 |
| i18n 导致渲染错误 | ❌ 代码逻辑正常，`$t()` 有 fallback |
| 工具栏被 v-if 移除 | ❌ InputToolbar 无条件渲染，父组件无 v-if |
| 工具栏被 onErrorCaptured 卸载 | 待确认（诊断版加了 ElMessage.error 改变了错误处理行为） |

## 各功能根因追踪（2026-06-16）

### Skills 社区内容缺失

**结论：硬编码生产限制，与 settings.json 无关。**

```
claudeAgent.js:3348-3350
if (__filename.includes('.asar')) {
  return { items: [], total: 0, page: page || 0, hasMore: false }
}
// 注释：agent-skills-cli 是 ESM 包，在 asar 打包后无法动态 import；社区搜索仅 dev 模式可用
```

- 社区 tab 依赖 `import('agent-skills-cli')`，ESM 在 asar 内无法解析
- 推荐 tab 正常（使用内嵌 `skills-catalog.json`，100 条记录）
- 这是**已知设计限制**，不是 bug

### Plugins 异常

**结论：与 settings.json 完全无关。**

- 插件系统读取 `~/.claude/plugins/` 目录 + 调用 `claude plugin list --json`
- `readPluginsState()` 零依赖 settings.json
- 可能静默失败点：
  - Claude Code CLI 未安装 → `findSystemClaude()` null → 缓存为空 → 所有插件显示"未安装"
  - `~/.claude/plugins/` 目录不存在 → 返回空列表
  - 所有文件读取错误被 `try/catch(_){}` 吞掉
- `_installedPluginsCache` 模块级缓存，过期不会自动刷新

### @ mention 异常

**结论：与 settings.json 无关，但有多重静默失败路径。**

- 首选 `localSearchFiles` IPC（需要 `rg.exe` 在 `process.resourcesPath/tools/rg/`）
- 失败回退到 `claudeListFiles`（`fs.readdirSync`）
- `triggerMention()` early-exit：`if (!tab || tab.thinking || !cwd) return` 无任何日志
- `refreshMentionSuggestions()` 所有错误被 catch 吞掉
- MentionPopup 用 `v-if="mentionSuggestions.length"`，无 loading 状态
- 如果 `window.electronAPI` 不存在，`?.` 操作符静默短路

### 模型切换异常

**结论：部分与 settings.json 值污染有关，部分是独立 bug。**

| 子问题 | 根因 | 位置 |
|--------|------|------|
| `claudeSetModel(model)` 静默失败 | preload 和主进程均未注册此 API | SelectModel.vue:165 |
| `claudeSetSelectedTier(key)` 静默失败 | preload 和主进程均未注册此 API | SelectModel.vue:167 |
| `effortLevel: "max"` 值非法 | SDK v2.1.177 合法值：`low/medium/high/xhigh` | SelectModel.vue:67, claudeAgent.js:1264 |
| clone error | `pickerTierModels.value` 是 Vue reactive proxy，不能直接传 IPC | SelectModel.vue:166（已修复为 `...spread`） |

## settings.json 污染分析

详细见 `docs/settings-json-pollution.md`。核心发现：

**App 专属字段（不在 SDK schema 中）：**
- `permissionPolicy` → 写入路径 `confSet`（claudeAgent.js:1143）
- `autoCompactWindow` → 写入路径 `writeGlobalSettings`（claudeAgent.js:1241）
- `theme` → 来源未知（不在当前代码路径中）
- `pathToClaudeCodeExecutable` → `confSet`（claudeAgent.js:1151，当前用户文件未出现）

**值污染：**
- `effortLevel: "max"` → SDK 合法值 `low/medium/high/xhigh`

**读写碎片化：**
- 4 种路径操作同一文件（confSet、readGlobalSettings/writeGlobalSettings、claude-write-settings-json、claude-patch-settings-json），无锁无协调

**重要发现：settings.json 污染与 @ mention / plugins / skills 社区三个功能异常没有直接因果关系。** 这些功能各自有独立的根因。

## 当前最可能的统一根因假设

settings.json 污染没有直接导致大多数功能异常，但可能是更早一步的问题：

**初始化路径被阻塞或异常终止** → `initializing` 一直为 `true` 或 `activeProject`/`activeTab` 状态不正确 → 各功能的前置条件不满足 → 全部静默失败。

需要追踪的路径：
1. `index.vue` 的 `initializing` → `isReady` 状态转换
2. `activeProject` 和 `activeTab` 的初始化
3. `onMounted` 中的初始化链
4. settings.json / claude-internal.json 的读取时机
5. 是否有同步阻塞导致后续步骤被跳过

## 排查记录

### Round 1：CSS/构建分析
- 生产包 JS/CSS 正常，scoped 样式 ID 匹配
- 诊断版确认 toolbar DOM 渲染 ✅

### Round 2：代码路径追踪
- preload API 表面一致（dev/production 用同一个 `preload.js`）
- 找到 `onErrorCaptured` 吞错机制（index.vue:262-284）
- 找到 SelectModel IPC clone error

### Round 3：settings.json 污染分析
- 对比官方 SDK schema（`code.claude.com/docs/en/settings`）
- 确认 4 个 app 专属字段 + 1 个值非法
- 写入路径溯源完成

### Round 4：逐个功能追踪
- Skills 社区：硬编码生产限制 ✅
- Plugins：独立于 settings.json ✅
- @ mention：独立于 settings.json，多重静默失败路径 ✅
- 模型切换：部分与 settings.json 值污染有关 ✅

### 下一步
- **追踪初始化路径**：`initializing`/`isReady`/`activeProject`/`activeTab` 状态转换
- 这是目前最可能把所有异常串起来的根因

## Round 5: 初始化路径追踪（2026-06-16）

### 初始化时间线

```
app.whenReady()
  ├─ registerAgentIPCs(ipcMain)
  │   ├─ setupClaudeHandlers()         ← 注册 claude-load-code-panel-state 等 handler
  │   │   ├─ loadClaudeAgentSdk()      ← 预热 SDK
  │   │   ├─ readGlobalSettings()      ← 读 settings.json
  │   │   │   └─ ensure skipWebFetchPreflight=true  ← 每次启动强制写
  │   │   └─ 注册所有 IPC handler
  │   ├─ setupCodexSdkHandlers()
  │   └─ registerLocalSearchIpc()
  └─ createWindow()
       └─ 加载 index.html → Vue app 启动
            └─ onMounted()
                 ├─ 注册事件监听器
                 ├─ refreshSlashCommands(false)
                 └─ requestIdleCallback → initNonCritical()
                      ├─ loadHistory() → IPC claude-load-code-panel-state
                      │   └─ readClaudeCodePanelState()
                      │       └─ fs.readFileSync(claude-panel-state.json)  ← 同步，不会挂
                      ├─ .then() → isReady=true, initializing=false
                      │   .catch() → 也设 initializing=false
                      └─ checkFirstTimeSetup()
                           ├─ claudeCheckEnvironment() → 异步
                           ├─ claudeGetKey()
                           └─ claudeReadSettingsJson()
```

### 关键发现

#### 1. 初始遮罩层覆盖整个 cc-main

```css
.cc-init-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: color-mix(in srgb, var(--cc-bg) 86%, transparent);
  backdrop-filter: blur(6px);
}
```

`cc-main` 有 `position: relative`，遮罩覆盖整个内容区（含 toolbar）。**只要 `initializing=true`，toolbar 就在遮罩后面不可见。**

但 `initializing` 在 `loadHistory()` 的 `.then()` 和 `.catch()` 都会设为 `false`。`loadHistory()` 的 IPC handler 是同步 `fs.readFileSync`，不会挂起。

#### 2. `onErrorCaptured` 吞错机制

```js
// index.vue:262
onErrorCaptured((err, instance, info) => {
  console.error('[🔴 claudeCode ErrorBoundary]...')
  return false  // ← 阻止冒泡，但 Vue 仍会卸载出错的子树
})
```

**`return false` 防止 app 崩溃，但 Vue 仍会卸载出错组件**。如果 InputToolbar 或其兄弟组件 render/setup 时抛出，该组件会被 Vue 从 DOM 移走。被 `console.error` 输出但难以在生产环境发现。

#### 3. `initializing` 机制确认安全

- `initializing` **一定会**被设为 `false`（`.then()` 和 `.catch()` 都设）
- `loadHistory()` IPC handler 是同步读文件，不会挂起
- 即使首次启动无历史文件，也会在 `.then(restored=false)` 中完成初始化
- **由此可排除 `initializing` 永远不结束的假设**

#### 4. dev vs production 代码差异确认

- preload API 完全一致（同一 `preload/index.js`）
- 所有 Vue 组件完全相同
- vite.config.js 的 `polyfillDynamicImport: false` 仅影响主进程 ESM import
- 唯一差异：**asar 打包** + **NODE_ENV=production** + **builder.prod.json extraMetadata.mode**

#### 5. node_modules 中 agent 包仍用 electron-conf

`claudeAgent.js:1066` 仍在用 `new Conf({ name: 'claude-internal' })`，虽有 fallback JSON 但 `b15c53e` 迁移只涉及 main.js/app 层，agent 层未迁移。这个包未在 `package.json` files 的排除列表中，理论上应正常工作。

### 初始化路径结论

**初始化路径本身没有阻塞问题。** `initializing` 会正常变为 `false`，遮罩会消失。toolbar 不可见的原因不在初始化时序。

## 全新假设：CSS 变量缺失导致 toolbar 视觉不可见

InputToolbar 的按钮样式依赖 CSS 变量：
- `--cc-bg-tertiary`（按钮背景）
- `--cc-border-strong`（按钮边框）
- `--cc-text-muted`（图标颜色）

这些变量由 `themeClass`（如 `cc-theme-dark`）在全局 CSS 中定义。**如果 theme CSS 在生产构建中被 tree-shake 或加载失败，所有 `--cc-*` 变量为 undefined → 按钮透明/白色在白色背景上 → 看起来不存在。**

但诊断版红框可见 → 说明 DOM 在且 theme CSS 被加载（否则红框也不可见）。

这就回到了核心矛盾：**诊断版（红框+ElMessage.error）与普通生产版使用同样的 CSS，为什么一个可见一个不可见？**

## 最可疑根因（更新）

经过完整初始化路径追踪，**最可疑的是 `onErrorCaptured` 静默卸载了某个关键组件**：

1. `index.vue:262` 的 `onErrorCaptured` 调用 `console.error`（含详细堆栈），但 `return false`
2. Vue 接到 `return false` 后仍会**卸载出错组件**
3. 在生产 NODE_ENV=production 下，被卸载的组件**无任何 UI 提示**
4. 诊断版添加 `ElMessage.error` 后，用户能**看到错误 toast**，但更重要的是：这改变了执行时序

**核心假设**：某个兄弟组件（SlashPopup、MentionPopup、textarea、消息列表等）在首次渲染时抛出错误 → `onErrorCaptured` 捕获 → 返回 false → Vue 卸载该组件。如果这个错误传播影响了 toolbar 的父容器或 CSS 布局计算，toolbar 就会"消失"。

### 需要生产环境确认

1. **打开 DevTools Console**：生产版是否有 `[🔴 claudeCode ErrorBoundary]` 输出？
2. **检查 DOM**：InputToolbar 的 `<div class="mode-row">` 是否存在？样式 computed 值是什么？
3. **检查 CSS 变量**：在 DevTools 中运行 `getComputedStyle(document.querySelector('.mode-row')).getPropertyValue('--cc-bg-tertiary')`

## 待回答问题

1. 生产版 DevTools Console 有无 `ErrorBoundary` 输出？
2. InputToolbar DOM 节点的 computed height 是多少？（如果是 0 → CSS 塌缩）
3. `--cc-bg-tertiary` 等 CSS 变量的计算值是否为有效颜色？
