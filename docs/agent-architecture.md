# MindCraft Agent 架构

> 最后更新：2026-06-09
> 当前状态：Agent 抽离 Phase A 已完成，代码事实以 `packages/agent/**` 为准

---

## 1. 当前结论

- Claude / Codex / codeHub / agentCommon 主体实现已经抽离到 `packages/agent/**`
- 宿主层不再保留旧的 Agent 主体实现副本
- Full 版当前通过宿主接线继续复用共享 Agent 层
- Lite 版后续应直接复用这套共享层，而不是重新复制一套 Agent 代码

当前已经验证可用的共享入口：

- Renderer 入口：`@mindcraft/agent`
- Renderer 公共渲染入口：`@mindcraft/agent/render`
- Main 入口：`packages/agent/electron/index.js`
- Preload 入口：`packages/agent/preload/index.js`

---

## 2. 目录边界

### 2.1 Agent 主体

| 领域 | 路径 |
|------|------|
| Claude UI / 状态 / 会话逻辑 | `packages/agent/src/components/claudeCode/**` |
| Codex UI / 状态 / 会话逻辑 | `packages/agent/src/components/codeX/**` |
| 统一容器 / Tab / Agent 入口偏好 | `packages/agent/src/components/codeHub/**` |
| 公共组件 / 公共工具 | `packages/agent/src/components/agentCommon/**` |
| Agent renderer stores | `packages/agent/src/stores/**` |
| Agent 主进程实现 | `packages/agent/electron/**` |
| Agent preload bridge | `packages/agent/preload/**` |

### 2.2 宿主接线层

| 领域 | 路径 |
|------|------|
| Electron 主入口 | `electron/main.js` |
| Preload 主入口 | `electron/preload.js` |
| 路由接线 | `src/router.js` |
| Vite alias 接线 | `vite.config.js` |

规则：

- 改 Agent 功能，进 `packages/agent/**`
- 改宿主入口，才碰宿主接线层文件

---

## 3. 运行时接线

### 3.1 Main

`electron/main.js` 当前通过：

```js
const { registerAgentIPCs, resetCodexSdkRuntime } = require("../packages/agent/electron");
```

完成 Agent IPC 注册。

### 3.2 Preload

`electron/preload.js` 当前通过：

```js
const { createAgentBridge } = require("../packages/agent/preload");
```

暴露 Claude / Codex 所需桥接能力。

### 3.3 Renderer

`src/router.js` 当前通过：

```js
component: async () => (await import('@mindcraft/agent')).CodeHub
```

加载统一编程 Agent 容器。

渲染侧公共代码高亮 / 本地路径识别能力通过以下入口复用：

- `src/components/mdViewer/viewers/CodeTextViewer.vue`
- `src/utils/MarkdownIt.js`

都已切换到：

```js
@mindcraft/agent/render
```

---

## 4. 路由与窗口入口

### 4.1 主路由

当前最终编程入口是：

- `#/main/codeHub`

兼容入口为：

- `#/main/claudeCode` -> `#/main/codeHub?agent=claudeCode`
- `#/main/codex` -> `#/main/codeHub?agent=codex`

### 4.2 独立窗口

| 窗口 | 当前入口 |
|------|------|
| Claude 独立窗口 | `electron/claudeWindow/index.js` -> `#/main/claudeCode` |
| Codex 独立窗口 | `electron/codexWindow/index.js` -> `#/main/codex` |

说明：

- 这套兼容入口目前是正常可用的
- 但它们仍然依赖路由层 redirect
- 后续如果改 `codeHub` 路由或 query 语义，必须回归独立窗口入口

---

## 5. 状态持久化与通知

### 5.1 面板持久化

Claude / Codex 面板状态都通过 Electron IPC 落盘，不依赖 localStorage 做关键持久化。

当前重点行为：

- project / chat 列表持久化
- 活跃 project / chat 持久化
- 任务完成红点状态持久化

### 5.2 完成通知

Claude：

- 主进程事件：`claude-agent-done`
- 渲染入口：`packages/agent/src/components/claudeCode/composables/useClaudeAgentStream.js`

Codex：

- 主进程事件：`codex-agent-done`
- 渲染入口：`packages/agent/src/components/codeX/composables/useCodexAgentStream.js`

当前通知模型不是系统通知中心，而是：

- 项目级 `hasDoneNotification`
- 前端 Tab 高亮 / 红点
- `flashTaskbar()`

---

## 6. 会话管理内部机制

> ⚠️ 本节是 Claude / Codex 会话 bug 排查的基础知识。排查前必须理解双身份模型和同步边界。
> 完整陷阱清单见 `docs/session-pitfalls.md`。

### 6.1 双身份模型

每个 UI 会话（chat）有两层身份：

| 层 | 字段 | 示例 | 持久化位置 |
|----|------|------|-----------|
| UI 本地 ID | `chat.sessionId` | `session-chat-3-1718123456789` | `*-panel-state.json` |
| CLI 会话 ID | `chat.cliSessionId` | `a1b2c3d4-...` (UUID) | 主进程内存 Map + JSONL 文件名 |
| 磁盘文件 | `chat.filePath` | `~/.claude/projects/<hash>/<uuid>.jsonl` | 文件系统 |

**关键事实**：`sessionId` 和 `cliSessionId` 之间没有持久化的映射关系。映射只存在于主进程内存的 `cliSessionIds` Map 中（`sessionId → cliSessionId`），应用重启后丢失。

### 6.2 主进程全局状态（所有窗口共享）

```
claudeAgent.js                     codexAgent.js
─────────────────                  ─────────────────
agentSessions: Map                  codexSessions: Map
  sessionId → { query, event,        sessionId → { thread, runId,
                abortController,                   doneSent, resultReceived,
                model, cwd,                        abortController, ... }
                runMode }

cliSessionIds: Map                  cliSessionIds: Map (同名不同Map)
  sessionId → UUID (for resume)      同左

sessionModels: Map                  —
  sessionId → model (上次模型)
```

**重置函数**：`resetAgentRuntime()` 清空所有 Map，影响所有窗口。Codex 对应 `resetCodexSdkRuntime()`。

### 6.3 消息的双重来源

| 来源 | 触发 | 条件 |
|------|------|------|
| 内存（流式追加） | `onAgentMessage` IPC 事件 | 会话正在运行 |
| 磁盘（JSONL 读取） | `ensureChatMessagesLoaded()` | `filePath` 已设置 + `_messagesLoaded` 为 falsy |

**保存时的消息策略**（`buildPanelStatePayload` → `mapChat`）：
```js
messages: isStreaming ? [] : c.filePath ? [] : (c.messages || [])
//        ^流式中       ^有磁盘文件    ^无磁盘文件
//        不保存        不保存(磁盘为准)  保存全部(内存为准)
```

### 6.4 会话生命周期

```
createChat()                            PENDING
  _pendingSessionBinding = true         cliSessionId = null
  cliSessionId = null                   filePath = ''
  filePath = ''
      │
      │ sendMessage() → thinking = true
      ▼
  SDK query() ──────────────────────►  RUNNING
  JSONL 创建在磁盘                      thinking = true
  流式消息追加到 messages               (messages 即时更新)
      │
      │ 正常完成 / 错误 / abort
      ▼
  onAgentDone() ─────────────────────► BOUND
  cliSessionId = UUID                  cliSessionId ✓
  filePath = .../uuid.jsonl            filePath ✓
  thinking = false                     _pendingSessionBinding = false
```

**崩溃重启后的特殊状态**：
- `thinking` 总是 `false`（不保存此字段）
- `_messagesLoaded` 总是 `undefined`（不保存此字段）
- 消息内容取决于保存时 `filePath` 是否已设置

### 6.5 关键同步点

| 操作 | 触发时机 | 同步方向 | 已知陷阱 |
|------|---------|---------|---------|
| 后台扫描 | window focus, initNonCritical, 手动刷新 | 磁盘 → 内存（发现新 JSONL / 更新元信息） | Trap 1, 2, 3, 4 |
| 会话领养 | 扫描发现 JSONL + 存在 pending chat | 磁盘 JSONL → 内存 chat（绑定身份） | Trap 2, 3 |
| 消息加载 | `switchChat` + `messages.length === 0` | 磁盘 → 内存（替换 messages） | Trap 3 |
| 历史保存 | debounced 2s / immediate / onUnload | 内存 → 磁盘（panel-state.json） | Trap 4 |
| Provider 切换 | `claude-provider-activate` | 清空主进程 Map + 渲染恢复 | Trap 1 |

---

## 7. 已完成的抽离结果

- `packages/agent` 共享层已落地
- 宿主侧旧 Agent 主体目录已移除
- 公开 renderer 入口已建立：
  - `@mindcraft/agent`
  - `@mindcraft/agent/render`
- `localSearch` 已纳入共享 main 边界
- electron-builder 已包含 `packages/agent/**/*`
- 关键回归已覆盖：
  - codeHub agent route preference
  - Codex done reason
  - apply_patch / diff 恢复
  - agent shared entrypoints / imports

---

## 8. 当前剩余风险

这些不是阻塞项，但需要记住：

1. Claude / Codex 独立窗口仍依赖兼容路由跳转，不是直接进入最终页。
2. 主进程 / preload 目前仍通过仓内相对路径接入共享层，没有正式 npm 包化。
3. 个别旧注释可能仍引用抽离前路径，但代码实际入口已经对齐。
4. **🆕 会话管理存在 5 个已知陷阱 pattern，详见 `docs/session-pitfalls.md`。排查任何会话相关 bug 前必须先读该文档。**

---

## 9. Lite 版建议方向

Lite 版不要重新开一套 Agent 主体实现，建议直接站在当前共享层上做“裁剪型宿主”。

建议顺序：

1. 先确定 Lite 版保留哪些 Agent 能力
   - 是否保留 Claude
   - 是否保留 Codex
   - 是否保留插件 / skills / localSearch / memory / markdown viewer 联动

2. 再确定 Lite 宿主壳层
   - 精简路由
   - 精简导航
   - 精简窗口入口
   - 精简与主产品无关的应用模块

3. 最后才做共享层进一步收口
   - 只在确实出现 Full / Lite 差异点时，再抽配置或 feature flag

原则：

- 共享 Agent 层优先复用
- 差异优先放在宿主壳层
- 不要为了 Lite 版再次复制一套 Agent 代码
