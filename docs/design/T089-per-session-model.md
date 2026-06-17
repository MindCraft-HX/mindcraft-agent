# T089: Per-Session 模型参数设计

> 状态：待审核 | 2026-06-17

## 1. 背景

用户希望每个 session/tab 独立选择模型（Haiku/Sonnet/Opus + effort），不同对话互不干扰。这是 Claude Code SDK 原生能力——`query({ options: { model, effort } })` 每次调用独立指定。

当前实现是全局共享：模型写入 `~/.claude/settings.json`，所有 session 读同一个值。上一次尝试（300+ 行）将模型存入 panel state，因 close-tab 覆盖 panel state 导致模型丢失而回退（`eaa54bf`）。

## 2. 问题分析

```
上次（崩）:  model ⊂ panel state（claude-panel-state.json）
           → requestDeleteProject 删项目 + saveHistory({immediate:true}) 覆盖 panel state
           → model 丢失

这次（修）:  model ⊂ .meta.json（文件系统，跟 .jsonl 同目录）
           → close-tab 只删 panel state，不碰 .meta.json
           → model 不受影响
```

## 3. 存储方案

### 3.1 文件布局

```
~/.claude/projects/D---my-project/
├── a1b2c3.jsonl              ← session 对话记录（SDK 生成）
├── a1b2c3.meta.json          ← session 参数（MindCraft 写入）
├── d4e5f6.jsonl
└── d4e5f6.meta.json
```

一对一，同名不同后缀。没有中央索引文件。

### 3.2 `.meta.json` 内容

```json
{
  "model": "claude-sonnet-4-20250514",
  "effort": "high"
}
```

第一期只放 `model` + `effort`（SelectModel 已选这两个值，只是当前写错了地方）。后续可扩展 `thinking`、`runMode`、`maxTurns`。

### 3.3 生命周期

| 事件 | `.meta.json` 行为 |
|------|------------------|
| 选模型 | 写入/更新 |
| close-tab | **不动**（在文件系统，不在 panel state） |
| reopen project | `scanCliSessionsForProject()` 扫描目录时顺手读 |
| delete chat | 跟 `.jsonl` 一起删除 |

## 4. 实现计划（~45 行，5 文件）

### 4.1 主进程：claudeAgent.js

**A. `scanCliSessionsForProject()` — 扫描时读 meta（+4 行）**

在已有 `fs.statSync` 获取 `fileSize` 之后，尝试读同名的 `.meta.json`：

```javascript
let meta = null
try {
  const metaPath = filePath.replace(/\.jsonl$/, '.meta.json')
  if (fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  }
} catch (_) {}
// 返回时附加 model/effort
return { ..., model: meta?.model || null, effort: meta?.effort || null }
```

**B. `writeSessionMeta(cwd, sessionId, data)` — 新增函数（+8 行）**

```javascript
function writeSessionMeta(cwd, sessionId, data) {
  const root = getClaudeProjectsRootDir(cwd)
  if (!root || !fs.existsSync(root)) return
  const metaPath = path.join(root, `${sessionId}.meta.json`)
  fs.writeFileSync(metaPath, JSON.stringify(data, null, 2), 'utf8')
}
```

**C. 新增 IPC handler（+3 行）**

```javascript
ipcMain.handle('claude-write-session-meta', (_, { cwd, sessionId, data }) => {
  writeSessionMeta(cwd, sessionId, data)
})
```

**D. `claude-agent-query` — 优先 session model（+4 行）**

```javascript
// 当前：model = runtime.model  （纯全局）
// 改为：
const sessionMeta = readSessionMeta(cwd, sessionId)
const model = sessionMeta?.model || runtime.model
const effort = sessionMeta?.effort || readEffortLevel()
```

**E. `claudeDeleteSessionFile` — 同步删 meta（+2 行）**

```javascript
// 在 unlink .jsonl 之后
const metaPath = filePath.replace(/\.jsonl$/, '.meta.json')
try { if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath) } catch (_) {}
```

### 4.2 Preload 桥接：preload/index.js（+4 行）

```javascript
claudeWriteSessionMeta: (cwd, sessionId, data) =>
  ipcRenderer.invoke('claude-write-session-meta', { cwd, sessionId, data }),
```

### 4.3 渲染层：index.vue

**A. `selectDir` → chat 对象加 `_model` / `_effort`（+2 行）**

```javascript
project.chats = sessions.map(s => ({
  // ... 现有字段 ...
  _model: s.model || null,     // 从 scan 结果读
  _effort: s.effort || null,
}))
```

**B. `sendMessage` → payload 传 model（+1 行）**

```javascript
const rawPayload = {
  // ... 现有字段 ...
  model: tab._model || undefined,   // undefined 时主进程 fallback 全局
}
```

**C. `createChat` → 新建后写默认 model（+3 行）**

```javascript
const c = createChat()
// 从全局 conf 取默认值写入 meta
const defaultModel = await window.electronAPI?.claudeGetModel?.() || ''
const defaultEffort = await window.electronAPI?.claudeGetEffortLevel?.() || 'medium'
if (c.sessionId && project.cwd) {
  window.electronAPI?.claudeWriteSessionMeta?.(project.cwd, c.sessionId, {
    model: defaultModel,
    effort: defaultEffort,
  })
}
```

### 4.4 SelectModel.vue（+6 行）

**A. `open()` — 读 session model 初始化 UI（+4 行）**

```javascript
// 当前读全局 claudeGetModel，改为优先 session
async function open(sessionId, cwd) {
  let sessionModel = '', sessionEffort = 'medium'
  if (sessionId && cwd) {
    try {
      const meta = await window.electronAPI?.claudeReadSessionMeta?.(cwd, sessionId)
      sessionModel = meta?.model || ''
      sessionEffort = meta?.effort || 'medium'
    } catch (_) {}
  }
  const currentModel = sessionModel || await window.electronAPI?.claudeGetModel?.() || ''
  const currentEffort = sessionEffort || await window.electronAPI?.claudeGetEffortLevel?.() || 'medium'
  // ... 其余逻辑不变 ...
}
```

**B. `confirmSelection()` — 写 `.meta.json`（+2 行）**

```javascript
// 在写完全局 conf 后，追加 session 级别写入
if (currentSessionId && currentCwd) {
  window.electronAPI?.claudeWriteSessionMeta?.(currentCwd, currentSessionId, {
    model,
    effort,
  })
}
```

## 5. review 验证清单

- [ ] close-tab 不删 `.meta.json`
- [ ] re-open project 恢复模型选择
- [ ] delete chat 同步删 `.meta.json`
- [ ] 新 session 用全局默认值初始化 meta
- [ ] SelectModel 打开时显示当前 session 的模型（而非全局）
- [ ] 改模型后 query 用新模型
- [ ] 不传 model 时 fallback 全局（向后兼容老 session）
