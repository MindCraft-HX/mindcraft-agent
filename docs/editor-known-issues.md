# 代码编辑器已知问题

## 环境

- **框架**: Electron + Vue 3 + Vite
- **编辑器**: CodeMirror 6（`codemirror@6.0.1` + `@codemirror/view@6.22+`）
- **涉及文件**:
  - `electron/main.js` — 主进程键盘事件拦截
  - `src/components/mdViewer/editors/CodeMirrorEditor.vue` — CM6 编辑器组件

---

## 问题 1: 折叠箭头（fold gutter）显示为默认丑陋三角而非自定义 chevron

### 表现

折叠 gutter 中的箭头图标回退到 CM6 默认样式（CSS 伪元素渲染的三角符号），而非我们自定义的文本 chevron（`›` / `⌄`）。

### 当前代码

**markerDOM 定义** (`CodeMirrorEditor.vue:64-70`)：
```javascript
foldGutter({
  markerDOM: (open) => {
    const span = document.createElement('span')
    span.className = 'cm-fold-icon'
    span.textContent = open ? '⌄' : '›'
    return span
  },
}),
```

**CSS 覆盖** (`CodeMirrorEditor.vue:265-296`)：
```css
.cm-editor-host :deep(.cm-foldGutter .cm-gutterElement) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  outline: none !important;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.12s;
}
.cm-editor-host :deep(.cm-foldGutter .cm-gutterElement::before) {
  content: none !important;
}
.cm-editor-host :deep(.cm-fold-icon) {
  font-size: 13px;
  line-height: 1;
  color: var(--cc-text-dim, #64748b);
  user-select: none;
  pointer-events: none;
}
```

### 分析

CM6 的 fold gutter 默认使用 `::before` 伪元素 + CSS `content` 属性渲染箭头字符。我们的 `markerDOM` 虽然创建了自定义 span 元素，但 CM6 的默认样式通过 `.cm-foldGutter .cm-gutterElement::before { content: ... }` 注入箭头——这套默认样式由 CM6 的样式表（非 inline）提供，优先级可能超过 Vue scoped `:deep()` 选择器。

### 已尝试的方案

| 方案 | 结果 |
|------|------|
| CSS 三角（0×0 + border）| hover 时 CM6 默认 background/outline 覆盖 → 矩形 |
| 文本 chevron + `::before { content: none }` | 部分场景有效，部分场景 CM6 样式覆盖回去 |
| `!important` 在 `::before` | 同上，不确定是否真的生效 |

### 可能的方向

1. **JS 侧 inline style**：在 `markerDOM` 回调中给 span 加 `style.display = 'block'`，并且用 `span.style.setProperty('content', 'none', 'important')` —— 但 `::before` 是伪元素，无法用 inline style 覆盖
2. **全局 CSS（非 scoped）**：在当前组件外添加一个非 scoped 的 `<style>` 块，用更高优先级的选择器覆盖 CM6 默认样式
3. **CM6 API 层面**：检查 `foldGutter()` 是否有配置项能禁用默认箭头渲染，只使用 `markerDOM`
4. **`EditorView.theme`**：用 CM6 的 `EditorView.theme()` 扩展注入样式，CM6 会将其样式表放在更高优先级

---

## 问题 2: Ctrl+F / Ctrl+H 快捷键无效

### 表现

在编辑器区域按 Ctrl+F 或 Ctrl+H 时，CodeMirror 的搜索面板不会打开。Ctrl+Tab 等其他快捷键正常。

### 根因

Electron 的 Chromium 内核在 DOM 层面之前拦截 Ctrl+F，触发浏览器内置的"页面查找"（find-in-page）。渲染进程的 CodeMirror keymap 永远收不到这个按键事件。

### 当前代码

**主进程拦截** (`electron/main.js:232-248`)：
```javascript
win.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toUpperCase()
    const ctrlOrMeta = input.control || input.meta

    if ((key === 'F' || key === 'H') && ctrlOrMeta && !input.shift && !input.alt) {
      if (win._searchForwardGuard) {
        win._searchForwardGuard = false
        return // 二次回调：放行事件到渲染进程
      }
      event.preventDefault()
      win._searchForwardGuard = true
      setTimeout(() => { win._searchForwardGuard = false }, 500)
      win.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: input.keyCode,
        modifiers: input.control ? ['control'] : ['meta'],
      })
      return
    }
})
```

**CodeMirror keymap** (`CodeMirrorEditor.vue:81-92`)：
```javascript
keymap.of([
  { key: 'Mod-f', run: openSearchPanel, preventDefault: true },
  { key: 'Mod-h', run: openSearchPanel, preventDefault: true },
  { key: 'F3', run: findNext, preventDefault: true },
  { key: 'Shift-F3', run: findPrevious, preventDefault: true },
  { key: 'Escape', run: closeSearchPanel, preventDefault: true },
  // ...
]),
```

### 分析

`before-input-event` 是唯一能在 Chromium 处理 Ctrl+F 之前拦截的钩子。当前方案：
1. `event.preventDefault()` 阻止 Electron 内置查找
2. `webContents.sendInputEvent()` 重新注入键盘事件到渲染进程
3. `_searchForwardGuard` 标志位防止 `sendInputEvent` 同步触发 `before-input-event` 的无限递归

**已知问题**：
- `sendInputEvent` 在不同 Electron 版本中可能是同步或异步触发 `before-input-event`——同步场景下 guard 有效但引入了脆弱的状态机；异步场景下 guard 可能永久卡死（已加 500ms setTimeout 安全网）
- 键盘事件注入本质上是 fragile 的方案，依赖 keyCode/modifier 精确匹配

### 已尝试的方案

| 方案 | 结果 |
|------|------|
| 仅依赖 CM6 keymap（无主进程干预）| 事件被 Electron 吃掉，永远收不到 |
| `executeJavaScript` dispatchEvent(KeyboardEvent) | `isTrusted: false`，CM6 不响应合成事件 |
| `sendInputEvent` + 标志位（首版） | 无限递归 → 栈溢出崩溃 |
| `sendInputEvent` + 标志位 + setTimeout 安全网（当前）| 未验证，理论上有 race condition |

### 可能的方向

1. **IPC 通信**：主进程通过 `webContents.send('editor-open-search')` 发 IPC 消息，渲染进程监听并直接调用 `openSearchPanel(editorView)`。需要解决"哪个 editor 是活跃的"——可以维护全局 active editor 引用或通过 `document.activeElement` 追溯
2. **禁用 Electron 内置查找**：检查是否有 Electron API 或 Chromium flag 能全局禁用 find-in-page，让事件自然到达 DOM
3. **`webContents.findInPage` 替代方案**：反向利用 Electron 的 find API，在其回调中关闭原生查找并打开 CM6 搜索面板

---

## 代码位置索引

| 文件 | 行号 | 内容 |
|------|------|------|
| `electron/main.js` | 220-248 | `before-input-event` 处理器（Ctrl+F/H 拦截 + DevTools + 刷新） |
| `electron/main.js` | 232-248 | Ctrl+F/H 拦截逻辑 |
| `src/components/mdViewer/editors/CodeMirrorEditor.vue` | 62-92 | `buildExtensions()`（foldGutter + keymap + 扩展） |
| `src/components/mdViewer/editors/CodeMirrorEditor.vue` | 64-70 | `foldGutter({ markerDOM })` |
| `src/components/mdViewer/editors/CodeMirrorEditor.vue` | 264-296 | 折叠 gutter CSS |
| `src/components/mdViewer/editors/CodeMirrorEditor.vue` | 7-13 | CM6 imports |

## 构建/测试

- `package.json` 中 `"main": "electron/main.js"` → main 进程直接读源码，改完需重启 Electron 应用
- `npx vite build` → 构建渲染进程（2664 modules），vue 文件改动刷新页面即可
