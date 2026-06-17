# 文档链接跳转 Bug 分析

> 日期：2026-06-11
> 范围：`render.js` 路径识别 + `mdRouting.js` 竞态 + `documentLocator.js` 路径解析
> 症状：对话消息中的文件路径链接 ① 部分点击无反应 ② 部分跳转到文档浏览器但不打开文件

---

## 1. 完整链路（7 步）

```
① render.js                    ② render.js                      ③ ipcHandlers.js
linkifyStrongLocalPaths   →   click delegate listener    →   open-document-candidate IPC
  (正则识别路径,                 (closest('[data-path-                           ↓
   生成 <a data-path-              candidate]'))                    ④ documentLocator.js
   candidate="...">)                                                  resolveCandidatePath
                                                                     (4 级回退匹配)
                        ⑦ mdViewer/index.vue     ←   ⑥ Main.vue     ←   ⑤ mdRouting.js
                           onMounted 注册              router.push         openMdInMain
                           onMdContent /               ('/main/mdViewer')   send('md-content')
                           getPendingMdContent()                            send('open-md-viewer')
```

---

## 2. 问题 1：部分链接点击无反应

### 根因 A：`isAbsoluteFilePath` 仅识别 Windows 绝对路径

**文件**：`packages/agent/src/components/agentCommon/render.js:70-76`

```js
function isAbsoluteFilePath(value = '') {
  const candidate = String(value || '').trim()
  if (!candidate) return false
  if (/^file:\/\//i.test(candidate)) return true
  if (/^\/[a-zA-Z]:[\\/]/.test(candidate)) return true   // /D:/path 格式
  return /^[a-zA-Z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate)
}
```

| 格式 | 示例 | 匹配 |
|------|------|:--:|
| Windows 绝对路径 | `D:\src\foo.ts` | ✅ |
| UNC 路径 | `\\server\share\file` | ✅ |
| file:// 协议 | `file:///D:/foo.ts` | ✅ |
| **Linux/macOS 绝对路径** | `/home/user/src/foo.ts` | ❌ |
| **WSL 路径** | `/mnt/c/Project/src/foo.ts` | ❌ |

如果项目在 WSL/远程 Linux 中运行，任何绝对路径都不会被识别为可点击链接。

### 根因 B：路径正则被特殊字符截断

**文件**：`packages/agent/src/components/agentCommon/render.js:105`

```js
const candidatePattern = /(^|[\s(])((?:[a-zA-Z]:[\\/][^\s<>"')\]]+)|...)/g
```

`[^\s<>"')\]]+` 在遇到以下字符时停止匹配：

| 字符 | 场景 | 后果 |
|------|------|------|
| 空格 | `C:\Program Files\config.json` | 链接指向 `C:\Program` → 文件不存在 |
| `)` | `D:\project (copy)\src\foo.ts` | 在 `)` 处截断 |

`documentLocator.js` 的 `normalizeCandidate` 会移除末尾的 `)>.,;:+` 字符，但不能修复截断的链接（因为截断发生在正则匹配阶段，路径的中间部分丢失了）。

### 根因 C：目录前缀白名单仅限于 6 个目录

**文件**：`packages/agent/src/components/agentCommon/render.js:96`

```js
function isStrongLocalPathCandidate(text = '') {
  // ...
  return /^(docs|src|electron|tests|build|packages|docs\/plan)\//.test(normalized)
}
```

以下常见目录的相对路径**不会被识别**为链接：

- `lib/utils.ts`, `dist/bundle.js`, `config/settings.json`
- `scripts/deploy.sh`, `app/models/user.rb`
- `public/index.html`, `assets/logo.png`
- 任何不在白名单中的顶层目录

---

## 3. 问题 2：跳转到文档但不打开文件

### 根因 D（🔴 最严重）：`md-content` 与 `open-md-viewer` 竞态条件

**文件**：`electron/mdRouting.js:17-37`

```js
function openMdInMain(payload) {
  if (!mainWin || mainWin.isDestroyed()) return

  if (payload) {
    if (mdViewerReady) {
      mainWin.webContents.send('md-content', payload)   // ① 先发内容
    } else {
      pendingPayloads.push(payload)                      // 排队（仅首次生效）
    }
  }

  mainWin.webContents.send('open-md-viewer')             // ② 后发导航指令
}
```

**时序分析**：

```
T1: ① md-content 到达渲染端 ──→ 无监听器（mdViewer 未挂载）──→ 消息丢弃 ❌
T2: ② open-md-viewer ──→ Main.vue router.push('/main/mdViewer')
T3:                    ──→ mdViewer 组件挂载
T4:                    ──→ onMounted 注册 onMdContent 监听器（已太迟）
T5:                    ──→ getPendingMdContent() ──→ 返回空（消息已直接发送非排队）
```

**触发条件**：
- 页面刷新后**首次**点击：`mdViewerReady=false` → payload 排队 → 正常工作 ✅
- 之后**任意次**点击：`mdViewerReady=true` → payload 直接发送 → **丢失** ❌

`mdViewerReady` 仅在 `did-start-loading`（整页重载）时重置为 `false`，SPA 内导航不影响。

### 根因 E：文件读取失败时静默创建空 Tab

**文件**：`src/components/mdViewer/index.vue:125-137`

```js
async function ensurePayloadContent(payload = {}) {
  if (!payload?.filePath || payload.content || payload.data) return payload
  const file = await window.electronAPI?.readFileByPath?.(payload.filePath)
  if (!file) return payload   // ← 失败时返回空 payload
  // ...
}
```

`openMdInMain` 发送的 payload 不含 `content`/`data`（仅有 `{filePath, openMode, source}`），必然走 `readFileByPath` 路径。如果文件已被移动/删除，Tab 创建但 `text=''` → 文档打开但一片空白，无错误提示。

### 根因 F：模糊搜索可能匹配错误文件

**文件**：`electron/mainModules/documentLocator.js:139-146`

```js
// rg-fallback: 精确路径（绝对/workspace-relative/cwd-relative）均未命中时
if (files.length === 1) {
  return { ok: true, filePath: path.resolve(searchBase, files[0]), matchType: 'rg-fallback' }
}
```

`pickFallbackMatches` 使用 `endsWith` 匹配——如果搜索结果恰好为 1 条，返回该文件。在 mono-repo 或同名文件较多时，可能匹配到错误位置的文件。

---

## 4. 风险矩阵

| # | 根因 | 严重度 | 触发频率 | 用户感知 |
|---|------|:---:|:---:|------|
| D | `md-content` 竞态丢失 | 🔴 高 | 页面刷新后每次点击 | 跳转到文档浏览器但无内容 |
| A | Linux/WSL 绝对路径不识别 | 🟡 中 | 非 Windows 项目 | 路径不显示为链接 |
| B | 路径含空格被截断 | 🟡 中 | 含空格路径 | 链接指向截断路径 |
| C | 目录前缀白名单过窄 | 🟡 中 | 常见相对路径 | 路径不显示为链接 |
| E | 文件读取失败静默 | 🟠 低 | 文件已移动/删除 | 打开空白 Tab |
| F | 模糊搜索匹配错误 | 🟠 低 | 同名文件 + 路径未精确命中 | 打开错误文件 |

---

## 5. 修复建议

| 根因 | 修复方案 | 改动量 |
|------|------|:--:|
| D | `openMdInMain` 优先排队（`pendingPayloads.push`），收到 `md-viewer-ready` 时 flush | ~5 行 |
| A | `isAbsoluteFilePath` 增加 Unix 绝对路径检测 `/^\/[^/]/` | ~3 行 |
| B | 放宽 `candidatePattern` 字符类，或对匹配结果用 `normalizeCandidate` 后处理 | ~5 行 |
| C | 移除目录前缀白名单，使用更通用的相对路径识别（`./` `../` 已支持，扩展为任意 `word/word` 模式） | ~5 行 |
| E | `ensurePayloadContent` 失败时显示 toast 或保持 loading 状态 | ~3 行 |
| F | `rg-fallback` 单结果时仍做文件名精确匹配确认 | ~3 行 |
