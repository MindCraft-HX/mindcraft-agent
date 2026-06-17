# CodeX Sandbox 权限重构计划

> T108-T111 | 2026-06-16

## 问题

当前 CodeX 权限体系存在两层不必要的抽象：

1. **命名层**：全链路使用 ClaudeCode 审批式命名 `permissionPolicy` + `read_only/ask/allow_all`，但 CodeX SDK 根本没有交互审批能力
2. **映射层**：主进程 `resolveSandboxMode()` 做了一次多余的映射翻译

```
改动前（两层映射，命名误导）：
  UI: read_only / ask / allow_all
       ↓ 前端 Store
  IPC: read_only / ask / allow_all
       ↓ resolveSandboxMode()
  SDK: read-only / workspace-write / danger-full-access

改动后（全链路透传，SDK 原生）：
  UI: 只读 / 工作区可写 / 完全访问
       ↓ 前端 Store
  IPC: read-only / workspace-write / danger-full-access
       ↓ 直接透传
  SDK: read-only / workspace-write / danger-full-access
```

## 关于 `approvalPolicy`

- SDK 支持 4 个级别：`never` / `on-request` / `on-failure` / `untrusted`
- 当前写死 `'never'`，原因是 exec 单向模式接不住 CLI 审批请求事件
- **本次不修改**，这不是画蛇添足，是当前 exec 模式下唯一可行选项

## 关于 ClaudeCode 默认值（T112）

用户问：ClaudeCode `runMode` 是不是应该默认 `edit_automatically`？

当前：`runMode` 默认 `ask_before_edits`，`permissionPolicy` 默认 `ask`

考虑：
- 很多用户觉得权限弹窗烦，`edit_automatically` 体验更流畅
- 但之前用户反馈在 `edit_automatically` 模式下仍出现 "Permission to use Bash has been denied"（根因未找到）
- `permissionPolicy` 在 Settings 页面已有下拉选择器可以改默认值
- 建议：等 "Permission denied" bug 根因找到后再决定，暂不改默认值

## 影响面（7 个文件）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `codexConfig.js` | Store 状态名 + 值 + 方法名全部改为 sandbox 语义 |
| 2 | `codexAgent.js` | 删映射函数，直传 SDK 值，IPC handler 改名，旧值兼容迁移 |
| 3 | `codex/index.vue` | `sandboxLevel` → `sandboxMode`，加 `setSessionSandbox()` |
| 4 | `codeX/InputToolbar.vue` | 右侧加 sandbox 下拉选择器（仿 ClaudeCode runMode） |
| 5 | `codeX/APISetting.vue` | 按钮标签改为 sandbox 语义 |
| 6 | `preload/index.js` | IPC 方法名 `permissionPolicy` → `sandboxMode` |
| 7 | `zh-CN.json` / `en.json` | 新增 sandbox 三档文本 + 废弃旧 key 保留不删 |

---

## 详细改动

### 1. `codexConfig.js` — Store

**改前：**
```javascript
const permissionPolicy = ref('ask')
const policies = [
  { value: 'read_only', label: '只读', desc: '仅读取，不修改文件' },
  { value: 'ask', label: '安全模式（工作区可写）', desc: '不走审批交互，仅允许在当前工作区内写入' },
  { value: 'allow_all', label: '完全访问', desc: '取消沙箱限制，允许更自由的访问' },
]
```

**改后：**
```javascript
const sandboxMode = ref('workspace-write')  // 默认工作区可写（SDK 默认是 read-only，我们主动设）
const sandboxLevels = [
  { value: 'read-only', label: '只读', desc: '仅读取文件，不执行任何修改' },
  { value: 'workspace-write', label: '工作区可写（推荐）', desc: '可修改当前项目文件，无法访问工作区外' },
  { value: 'danger-full-access', label: '完全访问', desc: '可读取和修改任意路径文件' },
]
```

**迁移逻辑（`loadSandboxMode`）：**
```javascript
const MIGRATE_MAP = { 'read_only': 'read-only', 'ask': 'workspace-write', 'allow_all': 'danger-full-access' }
async function loadSandboxMode() {
  try {
    const raw = await window.electronAPI?.codexGetSandboxMode?.()
    if (raw && MIGRATE_MAP[raw]) {
      sandboxMode.value = MIGRATE_MAP[raw]
      // 主进程侧同步迁移新值
      await setSandboxMode(MIGRATE_MAP[raw])
    } else if (sandboxLevels.some(s => s.value === raw)) {
      sandboxMode.value = raw
    }
  } catch (_) {}
}
```

**persist paths：** `['permissionPolicy', ...]` → `['sandboxMode', ...]`

### 2. `codexAgent.js` — 主进程

**删掉：**
```javascript
// 删除这两个函数
function normalizePermissionPolicy(policy) { ... }
function resolveSandboxMode(policy) { ... }
```

**`codex-agent-query` handler 改为直传：**
```javascript
// 旧
const permissionPolicy = normalizePermissionPolicy(sandboxLevel || readPermissionPolicy())
const sandboxMode = resolveSandboxMode(permissionPolicy)

// 新
const sandboxMode = sandboxLevel || readSandboxMode()
// sandboxLevel 前端发来的已经是 SDK 原生值
```

**IPC handler 改名 + 迁移：**
```javascript
// 旧
ipcMain.handle('codex-get-permission-policy', () => readPermissionPolicy())
ipcMain.handle('codex-set-permission-policy', (_, policy) => { ... })

// 新
ipcMain.handle('codex-get-sandbox-mode', () => readSandboxMode())
ipcMain.handle('codex-set-sandbox-mode', (_, mode) => { ... })

function readSandboxMode() {
  const SANDBOX_VALUES = ['read-only', 'workspace-write', 'danger-full-access']
  const MIGRATE = { 'read_only': 'read-only', 'ask': 'workspace-write', 'allow_all': 'danger-full-access' }
  const conf = new Conf({ name: 'mindcraft-codex' })
  const raw = conf.get('sandboxMode')  // 新 key
  if (raw && SANDBOX_VALUES.includes(raw)) return raw
  // 尝试旧 key 迁移
  const old = conf.get('permissionPolicy')
  if (old && MIGRATE[old]) {
    conf.set('sandboxMode', MIGRATE[old])
    conf.delete('permissionPolicy')
    return MIGRATE[old]
  }
  return 'workspace-write'
}
```

### 3. `codeX/index.vue` — 会话层

**改名（全局替换）：** `sandboxLevel` → `sandboxMode`

**校验函数更新：**
```javascript
// 旧
function isValidSandboxLevel(level) {
  return ['read_only', 'ask', 'allow_all'].includes(level)
}

// 新
function isValidSandboxMode(mode) {
  return ['read-only', 'workspace-write', 'danger-full-access'].includes(mode)
}
```

**恢复逻辑更新：**
```javascript
// 旧
function resolveRestoredSandboxLevel(chat) {
  if (isValidSandboxLevel(chat?.sandboxLevel)) return chat.sandboxLevel
  return hasStartedCodexChat(chat) ? 'ask' : codexConfigStore.permissionPolicy
}

// 新
function resolveRestoredSandboxMode(chat) {
  if (isValidSandboxMode(chat?.sandboxMode)) return chat.sandboxMode
  // 兼容旧数据（字段名和值都可能不同）
  const old = chat?.sandboxLevel
  const MIGRATE = { 'read_only': 'read-only', 'ask': 'workspace-write', 'allow_all': 'danger-full-access' }
  if (old && MIGRATE[old]) return MIGRATE[old]
  return hasStartedCodexChat(chat) ? 'workspace-write' : codexConfigStore.sandboxMode
}
```

**新增 `setSessionSandbox()`：**
```javascript
function setSessionSandbox(mode) {
  const tab = activeTab.value
  if (!tab || !['read-only', 'workspace-write', 'danger-full-access'].includes(mode)) return
  tab.sandboxMode = mode
  // 不中断当前 run，下个 turn 自动生效（resumeThread 传入新 sandboxMode）
}
```

**发送消息时携带新字段名：**
```javascript
const rawPayload = {
  // ...
  sandboxMode: tab.sandboxMode,  // 旧: sandboxLevel
  // ...
}
```

**InputToolbar 绑定：**
```html
<InputToolbar
  :disabled="..."
  :network-access="activeTab?.networkAccessEnabled ?? codexConfigStore.defaultNetworkAccess"
  :web-search="activeTab?.webSearchMode ?? codexConfigStore.defaultWebSearch"
  :sandbox-mode="activeTab?.sandboxMode ?? codexConfigStore.sandboxMode"
  @update:networkAccess="setSessionNetworkAccess"
  @update:webSearch="setSessionWebSearch"
  @update:sandboxMode="setSessionSandbox"
  ...
/>
```

**新 chat 创建：**
```javascript
sandboxMode: codexConfigStore.sandboxMode,  // 旧: sandboxLevel: codexConfigStore.permissionPolicy
```

### 4. `codeX/InputToolbar.vue` — 加 sandbox 选择器

在 `toolbar-right` 区域加一个 sandbox 下拉（放在网络开关旁边）：

```html
<template>
  <div class="mode-row">
    <div class="toolbar-left">
      <!-- 现有按钮不变 -->
    </div>
    <div class="toolbar-right">
      <!-- 现有网络开关 + 搜索下拉不变 -->
      <!-- 新增：sandbox 选择器 -->
      <select
        :value="sandboxMode"
        class="mode-select"
        title="文件访问权限"
        :disabled="disabled"
        @change="$emit('update:sandboxMode', $event.target.value)"
      >
        <option value="read-only">{{ $t('sandbox.readOnlyShort') }}</option>
        <option value="workspace-write">{{ $t('sandbox.workspaceWriteShort') }}</option>
        <option value="danger-full-access">{{ $t('sandbox.fullAccessShort') }}</option>
      </select>
    </div>
  </div>
</template>

<script setup>
defineProps({
  disabled: { type: Boolean, default: false },
  networkAccess: { type: Boolean, default: true },
  webSearch: { type: String, default: 'disabled' },
  sandboxMode: { type: String, default: 'workspace-write' },  // 新增
})

defineEmits([
  'addFile', 'triggerMention', 'triggerSlash',
  'update:networkAccess', 'update:webSearch',
  'update:sandboxMode',  // 新增
  'openPlugins', 'openSkills',
])
</script>
```

### 5. `codeX/APISetting.vue` — 设置页

```html
<!-- 旧 -->
<span class="theme-label">{{ $t('settings.permission') }}</span>
<button
  v-for="p in codexConfigStore.policies"
  :class="{ active: codexConfigStore.permissionPolicy === p.value }"
  @click="codexConfigStore.setPermissionPolicy(p.value); showPermissionToast(p)"
>

<!-- 新 -->
<span class="theme-label">{{ $t('settings.defaultFileAccess') }}</span>
<button
  v-for="s in codexConfigStore.sandboxLevels"
  :class="{ active: codexConfigStore.sandboxMode === s.value }"
  @click="codexConfigStore.setSandboxMode(s.value); showSandboxToast(s)"
>
```

**提示文本：** 从 `permissionPolicySet` → 新 key `sandbox.modeChanged`

### 6. `preload/index.js`

```javascript
// 旧
codexGetPermissionPolicy: () => ipcRenderer.invoke('codex-get-permission-policy'),
codexSetPermissionPolicy: (policy) => ipcRenderer.invoke('codex-set-permission-policy', policy),

// 新
codexGetSandboxMode: () => ipcRenderer.invoke('codex-get-sandbox-mode'),
codexSetSandboxMode: (mode) => ipcRenderer.invoke('codex-set-sandbox-mode', mode),
```

### 7. Locale 文件

**新增 key：**

| key | zh-CN | en |
|-----|-------|----|
| `sandbox.readOnlyShort` | 只读 | Read-only |
| `sandbox.workspaceWriteShort` | 工作区可写 | Workspace Write |
| `sandbox.fullAccessShort` | 完全访问 | Full Access |
| `sandbox.readOnlyDesc` | 仅读取文件，不执行任何修改 | Read files only, no modifications |
| `sandbox.workspaceWriteDesc` | 可修改当前项目文件，无法访问工作区以外 | Write within workspace, restricted outside |
| `sandbox.fullAccessDesc` | 可读取和修改任意路径文件 | Read and write any file on disk |
| `sandbox.modeChanged` | 文件权限已设为「{label}」 | File access set to "{label}" |
| `sandbox.midSessionHint` | 将在下一条消息中生效 | Takes effect on next message |
| `settings.defaultFileAccess` | 默认文件权限 | Default File Access |

**废弃但保留（避免引用报错）：** `permissionPolicySet`, `permAsk`, `permAllow`, `permissionHint`（CodeX 专用部分）

---

## 会话内切换 sandbox 的机制

```
用户切换 sandbox 下拉
  → setSessionSandbox(newMode)
    → tab.sandboxMode = newMode
  → 下一条消息发送
    → payload.sandboxMode = tab.sandboxMode  // SDK 原生值
    → codexAgent.js: sandboxMode = sandboxLevel || readSandboxMode()
    → resumeThread(prevCliId, { sandboxMode, ... })
      → SDK 新建 CLI 进程，OS 级 sandbox 在进程启动时生效
```

`resumeThread` 每次 turn 都起新 CLI 进程，sandboxMode 跟随进程生效。**不需要重建会话。**

如果 SDK 报错（resume 时不允许改 sandbox），降级方案：
```javascript
try {
  thread = codex.resumeThread(prevCliId, threadOptions)
} catch (e) {
  // sandbox 变更不被 resume 接受 → 重建 thread + 注入 compact summary
  console.warn('[codex] resumeThread with changed sandbox failed, starting new:', e?.message)
  thread = codex.startThread(threadOptions)
  // compact summary 会在下一次系统消息中被注入，上下文不丢
}
```

---

## 旧值兼容迁移矩阵

| 旧值（全链路） | 新值 | 迁移点 |
|---------------|------|--------|
| `read_only` | `read-only` | Pinia persist (localStorage) + electron-conf + chat 历史 JSON |
| `ask` | `workspace-write` | 同上 |
| `allow_all` | `danger-full-access` | 同上 |

迁移在每个读取点执行一次（load 时迁移 + 写入新值），后续不再触发。

---

## 实现顺序

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 1 | Locale: `zh-CN.json` + `en.json` 新增 sandbox key | 无 |
| 2 | `codexConfig.js` Store: 状态名/值/方法全部改为 sandbox | 1 |
| 3 | `codexAgent.js` 主进程: 删映射函数 + IPC 改名 + 旧值迁移 | 无 |
| 4 | `preload/index.js`: IPC 方法改名 | 3 |
| 5 | `codeX/index.vue`: `sandboxLevel` → `sandboxMode` + `setSessionSandbox` | 2,4 |
| 6 | `codeX/InputToolbar.vue`: 右侧加 sandbox 下拉 | 1,2 |
| 7 | `codeX/APISetting.vue`: 按钮标签改为 sandbox 语义 | 2 |
| 8 | 自测: 新会话/旧历史恢复/会话内切换/持久化 | 全部 |

---

## 不在此次范围

- ❌ 修改 `approvalPolicy`（保持 `'never'`，exec 模式限制）
- ❌ 修改 ClaudeCode runMode 默认值（等 T112 讨论）
- ❌ 外层 Codex 宿主权限问题（不在 mindcraft-agent 代码内）
- ❌ CodeX SDK 双向协议升级（未来可能需要，但这不是当前问题）
