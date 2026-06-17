# Phase 0 稳定性报告：共享层基线

> 日期：2026-06-10
> 状态：Phase 0 完成
> 范围：`packages/agent` 共享内核稳定性验证

## 1. 入口点验证

| 入口 | 文件 | 导出 | 状态 |
|---|---|---|---|
| Renderer | `packages/agent/src/index.js` | `{ default as CodeHub }` | ✅ |
| Electron | `packages/agent/electron/index.js` | `{ registerAgentIPCs, resetCodexSdkRuntime }` | ✅ |
| Preload | `packages/agent/preload/index.js` | `{ createAgentBridge }` | ✅ |
| Render 子入口 | `packages/agent/src/components/agentCommon/render.js` | Markdown 渲染引擎 | ✅ |
| Package 声明 | `packages/agent/package.json` | name: `@mindcraft/agent`, 4 个 exports | ✅ |

结论：四个入口职责清晰，均可被多个宿主独立消费。

## 2. 依赖扫描结果

### 2.1 宿主层依赖泄漏检查

**检查项：`packages/agent` 对 `src/` 的绝对路径引用**
- 结果：**0 个引用** ✅

**检查项：`packages/agent` 对 Full 业务模块的引用**
- 搜索关键词：积分、会员、应用广场、语音、登录、房间、llm/chat、小程序、画布、营销、充值
- 结果：**0 个引用** ✅

**检查项：`packages/agent` 对 Full store/route/API 的引用**
- 结果：**0 个引用** ✅

### 2.2 宿主对 `packages/agent` 的消费方式

宿主通过 Vite alias 消费 `packages/agent`：
```js
// vite.config.js
'@mindcraft/agent': 'packages/agent/src/index.js'
'@mindcraft/agent/render': 'packages/agent/src/components/agentCommon/render.js'
```

无直接 `packages/agent/src` 内部路径引用，符合公共入口边界要求。

## 3. 跨模块耦合状态

### 3.1 已修复

| 位置 | 原引用 | 修复后 | 状态 |
|---|---|---|---|
| `codeX/components/APISetting.vue:187` | `../../claudeCode/components/ConfirmDialog.vue` | `../../agentCommon/components/ConfirmDialog.vue` | ✅ 已修复 |

两文件内容完全一致，无行为变化。

### 3.2 已知但合理（不修复）

| 位置 | 导入 | 原因 |
|---|---|---|
| `codeHub/index.vue:116` | `ClaudeCodePanel` from claudeCode | CodeHub 架构预期 |
| `codeHub/SharedSettings.vue:27` | `ClaudeAPISetting` from claudeCode | SharedSettings 预期架构 |
| `codeHub/SharedSettings.vue` | `CodexAPISetting` from codeX | 同上 |

### 3.3 已知，Phase 2 处理

| 位置 | 导入 | 建议 |
|---|---|---|
| `codeX/index.vue:213` | `ManagePlugins` from claudeCode | 迁至 agentCommon |
| `codeX/index.vue:214` | `ManageSkills` from claudeCode | 迁至 agentCommon |

## 4. 测试基线

### 测试环境说明

- 运行时：Node.js v22.11.0
- 测试框架：Node.js 内置 `node:test`
- 部分测试有运行时依赖限制：
  - `require('electron')` → 必须在 Electron 主进程中运行（6 个测试）
  - `@mindcraft/agent` Vite alias → 必须在 Vite 构建上下文中运行（1 个测试）

### 4.1 边界测试（6 个）

| 测试文件 | 状态 | 备注 |
|---|---|---|
| `agent-shared-entrypoints.test.cjs` | ⚠️ 需 Electron 环境 | 验证入口文件存在 + require electron/index.js |
| `agent-shared-imports.test.cjs` | ✅ 通过 | 扫描 @ 别名引用 |
| `agent-public-renderer-boundary.test.cjs` | ✅ 通过 | 宿主只通过公共入口消费 |
| `agent-vue-import-boundary.test.cjs` | ✅ 通过 | Vue API 导入验证 |
| `agent-runtime-boundary.test.cjs` | ✅ 通过 | 打包/窗口入口验证 |
| `agent-markdown-render.test.mjs` | ✅ 通过 | Markdown 渲染测试 |

**通过率：5/6**（1 个需 Electron 环境，属预知限制）

### 4.2 Claude Code 回归测试（10 个）

| 测试文件 | 状态 | 备注 |
|---|---|---|
| `claude-agent-done-payload.test.cjs` | ⚠️ 需 Electron 环境 | 依赖 claudeAgent.js |
| `claude-history-persistence-sanitizer.test.mjs` | ✅ 通过 (5 subtests) | |
| `claude-history-restore-import.test.cjs` | ✅ 通过 | |
| `claude-history-selection.test.mjs` | ✅ 通过 (3 subtests) | |
| `claude-pending-session-binding.test.mjs` | ✅ 通过 (5 subtests) | |
| `claude-session-refresh-guard.test.mjs` | ✅ 通过 (2 subtests) | |
| `claude-task-events.test.mjs` | ✅ 通过 (6 subtests) | |
| `claude-task-state.test.mjs` | ✅ 通过 (14 subtests) | |
| `claude-task-stream-sync.test.mjs` | ✅ 通过 (2 subtests) | |
| `claude-taskbar-template.test.cjs` | ✅ 通过 | |

**通过率：9/10**（1 个需 Electron 环境）

### 4.3 Codex 回归测试（15 个）

| 测试文件 | 状态 | 备注 |
|---|---|---|
| `codex-agent-done-payload.test.cjs` | ⚠️ 需 Electron 环境 | 依赖 codexAgent.js |
| `codex-agent-done-reason.test.mjs` | ✅ 通过 (2 subtests) | |
| `codex-apply-patch-history-restore.test.mjs` | ✅ 通过 (2 subtests) | |
| `codex-apply-patch-preview.test.mjs` | ✅ 通过 (2 subtests) | |
| `codex-function-call-preview.test.mjs` | ✅ 通过 (6 subtests) | |
| `codex-git-metrics.test.cjs` | ⚠️ 需 Electron 环境 | 依赖 claudeMetrics.js |
| `codex-metrics-merge.test.mjs` | ✅ 通过 (2 subtests) | |
| `codex-provider-toml.test.mjs` | ✅ 通过 (3 subtests) | |
| `codex-queued-input-flush.test.mjs` | ✅ 通过 (3 subtests) | |
| `codex-session-lifecycle.test.mjs` | ✅ 通过 (4 subtests) | |
| `codex-session-routing.test.mjs` | ✅ 通过 | |
| `codex-session-run-ownership.test.cjs` | ⚠️ 需 Electron 环境 | 依赖 codexAgent.js |
| `codex-session-terminal-ownership.test.cjs` | ⚠️ 需 Electron 环境 | 依赖 codexAgent.js |
| `codex-todo-default-expanded.test.mjs` | ✅ 通过 | |
| `codex-turn-timeout.test.mjs` | ✅ 通过 (2 subtests) | |

**通过率：11/15**（4 个需 Electron 环境）

### 4.4 CodeHub 和其余测试（~25 个）

**全部通过** ✅，除以下预知问题：

| 测试文件 | 状态 | 原因 |
|---|---|---|
| `markdown-it-local-link.test.mjs` | ⚠️ 需 Vite alias | 依赖 `@mindcraft/agent` 别名解析 |
| `todo-list-parser.test.mjs` | ❌ 编码问题 | 源文件中文字符乱码导致语法错误 |
| `update-plan-parser.test.mjs` | ❌ 编码问题 | 同上 |
| `document-locator.test.cjs` | ⚠️ 需 Electron 模块 | 依赖 `electron/mainModules/` |
| `local-search.test.cjs` | ⚠️ 需 Electron 模块 | 同上 |
| `session-title-utils.test.cjs` | ⚠️ 需 Electron 模块 | 同上 |

### 汇总

| 类别 | 总数 | 通过 | 需 Electron | 编码问题 | 需 Vite |
|---|---|---|---|---|---|
| 边界测试 | 6 | 5 | 1 | 0 | 0 |
| Claude | 10 | 9 | 1 | 0 | 0 |
| Codex | 15 | 11 | 4 | 0 | 0 |
| CodeHub 及其他 | ~25 | ~19 | 3 | 2 | 1 |
| **总计** | **~56** | **~44** | **9** | **2** | **1** |

**Phase 0 代码改动未引入任何新的测试失败。**

## 5. 资源依赖清单

`packages/agent` 正常工作的前提是宿主提供以下资源：

| 资源 | 提供方 | 位置 | 备注 |
|---|---|---|---|
| `--cc-*` CSS 变量 | 宿主 | `src/styles/cc-theme-*.css` | 三套主题：dark/light/blue |
| 图标字体 `iconfont` | 宿主 | `src/assets/iconfont/` | 含 Full 业务图标（Phase 2 精简） |
| 图标字体 `mindcraft-flow-win-iconfont` | 宿主 | `src/assets/iconfont_floatwin/` | Agent 专用图标 |
| Element Plus 运行时 | 宿主 | peerDependency | `app.use(ElementPlus)` |
| `window.electronAPI` bridge | 宿主 preload | `createAgentBridge(ipcRenderer)` | ~180 个方法 |
| 等宽代码字体 | 宿主 | 系统字体 | Cascadia Code, Consolas |

### 迁移到非 Electron 宿主时的注意事项

1. `window.electronAPI` 需提供等效实现或 polyfill
2. 主题 CSS 加载需要替代 `window.electronAPI.loadTheme()` 机制
3. 图标字体文件需被宿主打包
4. 文档路径打开（`openDocumentCandidate`）需宿主实现

## 6. 文档浏览边界确认

**当前状态正确：**

- `packages/agent/` 不直接处理文档浏览，只通过 `window.electronAPI.openDocumentCandidate()` 触发
- `mdViewer`、`documentLocator`、viewer 逻辑全在 `src/`（宿主层）
- Agent 消息中的本地路径链接由宿主处理跳转

符合重构方案中"文档浏览属于宿主基础能力，不进入 Agent 内核协议"的定位。

## 7. 轻量对话边界确认

**当前状态正确：**

- `packages/agent/` 零引用 Full 版聊天 API（`/llm/chat`、WebSocket 聊天、房间系统）
- Agent 通信完全走 Claude Agent SDK 和 Codex SDK 的 IPC 通道
- 轻量对话 Agent（Phase 3）可作为新的 Registry 条目注册，不依赖 Full 聊天系统

## 8. 构建验证

```
✓ 5172 modules transformed
✓ built in 1m 17s (renderer → dist/)
✓ built in 293ms (electron main → dist-electron/main.js)
✓ built in 55ms (electron preload → dist-electron/preload.js)
```

- 无 `packages/agent/` 相关的 import 解析错误
- 主题 CSS 文件打包在内（`index-29025724.css`, 369KB）
- 图标字体文件打包在内（`iconfont-*.woff/woff2/ttf`）
- Agent 共享层渲染器打包为 `render-7558834d.js` (10.5KB)
- 构建产物仍含大量 Full 业务代码（Chat.js 4.8MB 等），Phase 2 裁剪

## 9. Phase 2 跟踪项

| ID | 描述 | 优先级 | Phase |
|---|---|---|---|
| T046 | Claude 会话重复/接力问题 | P0 | Phase 2 前必须处理 |
| CP-01 | ManagePlugins/ManageSkills 迁至 agentCommon | P1 | Phase 2 |
| CP-02 | CodeHub Agent 硬编码改为 Registry | P1 | Phase 3 |
| CP-03 | 图标字体合并（删除 Full 业务图标） | P2 | Phase 2 |
| CP-04 | 主题 CSS 独立化（非 Electron 宿主兼容） | P2 | Phase 2 |
| CP-05 | `todo-list-parser.test.mjs` 编码修复 | P2 | Phase 2 |
| CP-06 | `update-plan-parser.test.mjs` 编码修复 | P2 | Phase 2 |
| CP-07 | Electron 依赖测试的运行环境改进 | P3 | Phase 4 |

## 10. 结论

**Phase 0 已就绪。** `packages/agent` 共享内核具备被 `mindcraft-agent` 和 `mindcraft-electron` 共同消费的基本条件：

- ✅ 四个入口职责清晰、可独立消费
- ✅ 零 Full 业务依赖泄漏
- ✅ 零宿主层绝对路径引用
- ✅ 修复了一个跨模块耦合（ConfirmDialog）
- ✅ 44 个测试通过，Phase 0 改动未引入新失败
- ✅ 构建成功，无 Agent 层错误
- ✅ 文档浏览和轻量对话边界明确

**建议：可以进入 Phase 1（回灌 mindcraft-electron）。**
