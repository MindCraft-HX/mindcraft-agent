# 代码编辑器已知问题

## 已解决（2026-07-14）

### 折叠 gutter

- 使用 CM6 官方 `foldGutter({ openText: '▾', closedText: '▸' })`，并以较大的 gutter、清晰的文字权重和 hover 状态模拟 VS Code disclosure control。
- `markerDOM` 已移除。当前 `@codemirror/language` 的 `markerDOM` 分支不会同时生成默认 marker；此前“CM6 `::before` 覆盖 markerDOM”的判断不成立。

### 编辑器查找

- `electron/main.js` 在 CodeMirror 挂载期间通过 `before-input-event` 拦截 Ctrl+F / Ctrl+H，以 `editor-open-search` IPC 直接请求 renderer 打开 CM6 搜索面板。
- 不再使用 `sendInputEvent` 或 `_searchForwardGuard`，也不要求先点击代码区。
- 搜索面板以 `search({ top: true })` 固定在代码区顶部；编辑器卸载后恢复 Chromium 原生页面查找。
- 遗留 BrowserView 搜索及其专属 IPC 已删除，避免与 CM6 搜索并行触发。

## 验证

- `node --test tests/editor-search-shortcut-boundary.test.cjs`
- `npm run build`
