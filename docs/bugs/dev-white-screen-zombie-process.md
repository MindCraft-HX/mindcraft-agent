# T064：npm run dev 白屏 + 僵尸进程（2026-06-11 修复）

> 排查耗时一整天的环境问题，根因与所有直觉猜测（端口冲突、dev server 挂了、模块加载失败）全部无关。
> 本文档记录完整根因链与防御机制，**以后遇到"白屏"先看这里**。

## 现象

- `npm run dev` 启动后 Electron 主窗口白屏，无任何报错
- Vite 正常启动（HTTP 200，HTML 正常），`[main] Page finished loading` 正常打印
- 换端口短暂正常，重启后又白屏
- Ctrl+C / 关终端后 node/electron 进程残留，端口 16288 被占
- 参考 mindcraft-electron 项目"对齐"修改（commit 9889669）后问题反而固化

## 根因一：白屏 = 主窗口被路由记忆带到了悬浮球页面（P0）

**机制链：**

1. 悬浮球小窗加载 `VITE_DEV_SERVER_URL + '#/side'`（`electron/floatWindow/sideFloatWin.js:75`），与主窗口**同源**（同 scheme+host+port）→ **共享 localStorage**
2. `src/router.js` 的路由记忆 `beforeEach` 原实现只排除 `/redirect` 和 `/`，因此悬浮球的 `/side` 也被写进 `mindcraft_agent_last_route`
3. 主窗口下次启动，`/` 重定向读到 `/side` → 整个主窗口渲染悬浮球的小图标组件（约 40 字符 HTML）→ **视觉上 = 白屏**
4. 进入 `/side` 后 beforeEach 又把 `/side` 写回 localStorage → **每次启动自我强化，永久自锁**

**为什么"换端口没用"：** localStorage 按 origin（含端口）隔离。换端口 = 新 origin = 空 localStorage，首次启动正常；但悬浮球一启动又写入 `/side`，下次启动又白。表现为"换端口偶尔好一次"，让人误以为是端口/进程问题。

**为什么 mindcraft-electron 没事：**
- 它的 router **没有路由记忆功能**（agent 项目特有）
- 它的窗口**始终 `loadFile(dist/index.html)`，根本不依赖 dev server**（main.js 注释"始终从 dist 文件加载"）——所以它"稳定"的真正原因和关窗行为无关

**修复（src/router.js）：** 路由记忆读写双重白名单——`beforeEach` 只记录 `startsWith('/main')` 的路径；`/` 重定向只接受 `startsWith('/main')` 的值。老用户 localStorage 里的脏数据 `/side` 会被校验忽略并覆盖，**自动自愈**。

## 根因二：渲染进程报错全被吞掉（排查为何困难）

`electron/main.js` 的 `console-message` 监听用的是老签名：

```js
win.webContents.on('console-message', (_event, level, message) => {
  if (level >= 2) console.log('[renderer]', message);  // ❌ Electron 36 中 level 是事件对象属性且为字符串
});
```

**Electron 36 起该事件改为单事件对象**（`event.level` 为 `'debug'|'info'|'warning'|'error'` 字符串）。旧代码里 `level` 实际是 `undefined`（或字符串），`level >= 2` 永远 false → **渲染进程任何报错都不会出现在终端**，这是白屏查了一整天毫无线索的直接原因。

**修复：** 兼容两种签名，warning/error 才打印。另补充 `render-process-gone` 监听 + dev 启动 3 秒后路由自检日志：

```
[main] route check: #/main/home | #app len=9567
```

以后白屏与否、路由在哪、内容量多少，终端一行可见。

## 根因三：僵尸进程（关窗不退出 + Ctrl+C 杀不干净）

- commit 9889669 把关窗改为"始终隐藏到托盘"（误以为这是 mindcraft-electron 稳定的原因）→ dev 模式下窗口关了进程永不退出
- Windows 下 Ctrl+C/关终端经常杀不掉 npm→cross-env→vite 的孙子进程 → vite (node.exe) 残留占 16288；Electron 也成孤儿

**三层防御（全部落地）：**

| 层 | 机制 | 覆盖场景 |
|----|------|---------|
| 1 | `predev` 脚本：netstat 找占 16288 的进程 taskkill（带 try/catch，端口空闲不报错） | vite 僵尸占端口 |
| 2 | dev 守护（main.js）：每 3 秒 HEAD 探测 dev server，连续 2 次失败 `app.exit(0)` | Ctrl+C/关终端后的 Electron 孤儿，约 9 秒内自动退出 |
| 3 | 关窗行为：dev 直接 `app.quit()`，生产保持隐藏到托盘 | 正常关窗路径 |

## 验证记录（2026-06-11）

1. 杀外层进程制造孤儿（vite + electron 双残留，复现用户场景）
2. 再跑 `npm run dev`：predev 清掉 vite 僵尸 → 老 Electron 守护自动退出 → 新实例单开、稳定拿到 16288
3. `route check: #/main/home | #app len=9567`（修复前 `#/side | 40`）
4. localStorage 残留 `/side` 时启动 → 自动忽略进首页，自愈确认
5. 恢复 HMR（vite.config.js 移除 `hmr: false`，疑为排查期间的无效尝试）→ `hmr update /src/App.vue` 实测生效

## 防御性结论（记忆要点）

1. **同源多窗口 = 共享 localStorage。** 任何"按窗口"的状态不能裸写 localStorage，必须带路由白名单或窗口标识。子窗口路由（`/side`、`/cut`、`/floatWin`）永远不准进入路由记忆。
2. **"参考项目没问题"≠"把它的表象抄过来"。** mindcraft-electron 稳定是因为它不依赖 dev server，不是因为关窗隐藏。对齐行为前先确认因果。
3. **Electron 大版本升级要核对事件签名。** `console-message` 在 Electron 36 改为事件对象；日志监听失效是"静默"的，最危险。
4. **白屏排查顺序：** 终端看 `route check` → DevTools console → `#app` 内容量 → localStorage `mindcraft_agent_last_route`。不要先猜端口。
