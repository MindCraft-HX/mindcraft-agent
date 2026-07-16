const {
  app,
  protocol,
  BrowserWindow,
  globalShortcut,
  dialog,
  Menu,
  MenuItem,
  clipboard,
  nativeImage,
  ipcMain,
  shell,
  webContents,
  systemPreferences,
  Tray,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require('child_process');
const { DEFAULT_MAX_BYTES, appendLogLineWithRotation } = require("../packages/agent/electron/diagnosticsFileUtils");
const { CORE_CHANNELS } = require("../packages/agent/shared/ipcChannels");
const { init: initSettingsFacade, flush: flushSettings } = require("../packages/agent/electron/settingsFacade");

const packageJson = require(path.join(app.getAppPath(), 'package.json'));
 
let NODE_ENV = "production"
if(!app.isPackaged) {
    NODE_ENV = "development"
    // Object.defineProperty(app, 'isPackaged', { 
    //   get: () => true, 
    // }); 
} else {
    NODE_ENV = packageJson.mode
}
const NODE_PLATFORM = packageJson.platform || (process.platform === 'darwin' ? 'IOS' : 'WIN')

function configureUserDataPath() {
  const override = String(process.env.MINDCRAFT_USER_DATA_DIR || '').trim()
  if (override) {
    app.setPath('userData', path.resolve(override))
    console.log('[main] userData override:', app.getPath('userData'))
    return
  }
  if (NODE_ENV === 'development') {
    app.setPath('userData', path.join(app.getPath('appData'), 'mindcraft-agent-dev'))
    console.log('[main] dev userData:', app.getPath('userData'))
  }
}

configureUserDataPath()

const { setupIpcHandlers, setupHostIpcHandlers } = require("./mainModules/ipcHandlers");
const { setupAutoUpdater } = require("./mainModules/autoUpdate");
const { loadRegistry, scanAndValidate, scanDevPlugins, registerIPCHandlers: registerPluginHandlers, getInstalledPlugins } = require("./mainModules/pluginManager");

const { registerAgentIPCs, resetCodexSdkRuntime } = require("../packages/agent/electron");
const { openClaudeWin } = require("./claudeWindow/index.js");
const { openCodexWin } = require("./codexWindow/index.js");
const { findAssociatedMarkdownPath } = require('./fileAssociation');

const { openMdInMain, setMainWindow, registerMdViewerHandlers } = require("./mdRouting.js");

// ---- Extracted Phase 7 modules ----
const { loadThemeFromFile, saveThemeToFile, VALID_THEMES } = require('./themeStore');
const { createTray } = require('./tray');
const { fetchImage } = require('./fetchImage');
const { setupDragOptimization } = require('./dragPerformance');
const { registerContextMenu } = require('./contextMenu');

let initUrl = path.join(__dirname, "../dist/index.html")
// 开发模式：优先使用 Vite dev server（HMR 支持）
if (process.env.VITE_DEV_SERVER_URL) {
  initUrl = process.env.VITE_DEV_SERVER_URL
  // dev 守护：Vite 进程退出后（如 Ctrl+C 未能联动杀掉 Electron），自动退出避免孤儿进程
  let devServerMisses = 0;
  setInterval(() => {
    fetch(initUrl, { method: 'HEAD' })
      .then(() => { devServerMisses = 0; })
      .catch(() => {
        if (++devServerMisses >= 2) {
          console.log('[main] dev server gone, exiting');
          app.exit(0);
        }
      });
  }, 3000);
}
let win = null
let isAppQuitting = false
let isQuittingForUpdate = false
let mainRendererReady = false
const pendingAssociatedMarkdownPaths = []

function queueAssociatedMarkdown(commandLine) {
  const filePath = findAssociatedMarkdownPath(commandLine, { existsSync: fs.existsSync })
  if (!filePath || pendingAssociatedMarkdownPaths.includes(filePath)) return
  pendingAssociatedMarkdownPaths.push(filePath)
}

function openQueuedAssociatedMarkdown() {
  if (!mainRendererReady || !win || win.isDestroyed()) return
  while (pendingAssociatedMarkdownPaths.length) {
    const filePath = pendingAssociatedMarkdownPaths.shift()
    openMdInMain({ filePath, name: path.basename(filePath) })
  }
}

app.on('before-quit', () => {
  isAppQuitting = true
  flushSettings()
})

// 单实例锁（仅生产模式，dev 模式允许多开调试）
if (NODE_ENV !== 'development') {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
      queueAssociatedMarkdown(_commandLine)
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      openQueuedAssociatedMarkdown()
    });
  }
}

queueAssociatedMarkdown(process.argv)

function createWindow() {
  win = new BrowserWindow({
    useContentSize: true,
    width: 1220,
    height: 915,
    minWidth: 920,
    minHeight: 600,
    show: false,
    frame: false,               // 无边框窗口（Edge 风格）
    titleBarStyle: 'hidden',    // macOS 隐藏标题栏
    title: "MindCraft-Agent", // 设置窗口标题
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), //引进preload
      webSecurity: false, 
      sandbox: false,
      // ignoreCertificateErrors: true,
      nodeIntegrationInWorker: true,
      devTools: true,
      contextIsolation: true, //禁用上下文隔离
      nodeIntegration: true, //启用Node集合
      // enableRemoteModule: true, //打开remote模块
    },
  });

  //设置ICON
  win.setIcon(path.join(__dirname, "../dist/logo-white.png"));
  //设置居中
  win.center();
  //隐藏菜单栏
  win.setMenu(null);

  // 窗口控制 IPC（无边框模式）
  ipcMain.on(CORE_CHANNELS.WINDOW_MINIMIZE, () => win?.minimize());
  ipcMain.on(CORE_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on(CORE_CHANNELS.WINDOW_CLOSE, () => win?.close());
  ipcMain.handle(CORE_CHANNELS.WINDOW_IS_MAXIMIZED, () => win?.isMaximized() ?? false);
  ipcMain.on(CORE_CHANNELS.EDITOR_SEARCH_ENABLED, (event, enabled) => {
    if (BrowserWindow.fromWebContents(event.sender) === win) {
      win._editorSearchEnabled = Boolean(enabled)
    }
  })

  // ── 窗口拖拽性能优化（extracted to dragPerformance.js）──
  const { clearDragState } = setupDragOptimization(win)

  // 开发模式从 dev server 加载（支持 HMR），生产模式从 dist 文件加载
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(initUrl);
  } else {
    win.loadFile(initUrl);
  }
  // 加载失败时打印详细错误
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[main] Page load failed:', errorCode, errorDescription, validatedURL);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('[main] Page finished loading');
    // dev 自检：3 秒后打印路由与内容量，白屏问题可直接从终端看出
    if (NODE_ENV === 'development') {
      setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.webContents.executeJavaScript('location.hash + " | #app len=" + (document.getElementById("app")||{innerHTML:""}).innerHTML.length')
          .then(s => console.log('[main] route check:', s))
          .catch(() => {});
      }, 3000);
    }
  });
  // Electron 36: console-message 事件改为单事件对象，level 为字符串而非数字
  win.webContents.on('console-message', (...args) => {
    let level, message, source, line;
    const ev = args[0];
    if (ev && typeof ev === 'object' && 'message' in ev) {
      level = ev.level; message = ev.message; source = ev.sourceId; line = ev.lineNumber;
    } else {
      level = args[1]; message = args[2]; line = args[3]; source = args[4];
    }
    const important = level === 'warning' || level === 'error' || (typeof level === 'number' && level >= 2);
    if (important) console.log('[renderer]', level, message, source ? `(${source}:${line})` : '');
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] renderer gone:', JSON.stringify(details));
  });
  // 关闭窗口时清理拖拽计时器
  win.on('closed', () => {
    clearDragState()
  })

  // 关闭窗口：开发模式直接退出（避免进程残留占用端口），生产模式隐藏到托盘
  win.on('close', (e) => {
    if (NODE_ENV === 'development') {
      globalShortcut.unregisterAll()
      win = null
      app.quit()
      return
    }
    if (isQuittingForUpdate || isAppQuitting) {
      return
    }
    e.preventDefault();
    win.hide();
  })

  // DevTools: 开发模式自动打开，所有环境支持 Ctrl+Shift/I
  // 使用窗口级快捷键（before-input-event）替代 globalShortcut.register，
  // 避免生产版和开发版同时运行时全局快捷键互相抢占导致只有一个窗口能打开 DevTools。
  if (NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' })
  }
  win.webContents.on('before-input-event', (event, input) => {
    // input.key 在不同平台可能返回大小写不一致，统一用大写比较
    const key = (input.key || '').toUpperCase()
    const ctrlOrMeta = input.control || input.meta

    // Ctrl+Shift+I / Cmd+Shift+I：打开 DevTools（所有环境）
    if (key === 'I' && input.shift && ctrlOrMeta && !input.alt) {
      win.webContents.openDevTools({ mode: 'detach' })
      event.preventDefault()
      return
    }

    // An active CodeMirror owns Ctrl+F/H for the whole document editor surface.
    if (win._editorSearchEnabled && (key === 'F' || key === 'H') && ctrlOrMeta && !input.shift && !input.alt) {
      event.preventDefault()
      win.webContents.send(CORE_CHANNELS.EDITOR_OPEN_SEARCH)
      return
    }

    // 开发模式额外：Ctrl+R / Cmd+R 刷新页面
    if (NODE_ENV === 'development' && key === 'R' && ctrlOrMeta && !input.shift && !input.alt) {
      win.reload()
      event.preventDefault()
    }
  })

  // 复制粘贴（extracted to contextMenu.js）
  registerContextMenu(win, fetchImage)
}

let tray = null;

function prepareForUpdateInstall() {
  isQuittingForUpdate = true
  isAppQuitting = true
  flushSettings()
  try { globalShortcut.unregisterAll() } catch (_) {}
  try { resetCodexSdkRuntime?.() } catch (e) { console.warn('[main] reset codex runtime before update failed:', e?.message || e) }
  try {
    if (tray && !tray.isDestroyed?.()) tray.destroy()
  } catch (_) {}
  tray = null
}

// ─── 应用设置/主题存储（原生 JSON 文件，替代 electron-conf）──
const { getSetting, setSetting } = require('./mainModules/settingsStore')

// 暴露给渲染进程：通过 IPC 读写设置
ipcMain.handle('get-setting', (_e, key) => getSetting(key))
ipcMain.handle('set-setting', (_e, key, value) => setSetting(key, value))

function createStore() {
  // 设置存储就绪（异步信号给渲染进程）
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send('settings-store-ready')
  })
}

//打开邮箱
ipcMain.on(CORE_CHANNELS.OPEN_EMAIL, (event, emailAddress) => {
  const mailtoLink = `mailto:${emailAddress}`;
  shell.openExternal(mailtoLink);
});
// 添加以下代码以实现主进程的自动重新加载
// if (process.env.NODE_ENV === 'development') {
//   require('electron-reload')(__dirname, {
//     electron: require(`${__dirname}/node_modules/electron`),
//   });
// }

ipcMain.handle(CORE_CHANNELS.OPEN_MD_WIN, (_event, payload) => openMdInMain(payload))
registerMdViewerHandlers()


app.whenReady().then(async () => {
  createWindow();
  setMainWindow(win);

  // T198: Initialize settings facade before any settings readers
  initSettingsFacade(app.getPath('userData'));

  if (!process.env.MINDCRAFT_E2E_NO_TRAY) tray = createTray(win, __dirname)
  createStore()
  setupIpcHandlers(NODE_ENV, NODE_PLATFORM);
  setupHostIpcHandlers();
  setupAutoUpdater(NODE_ENV, NODE_PLATFORM, win, { beforeInstall: prepareForUpdateInstall }); //更新文件

  // T196 E2E smoke hook — no-op unless MINDCRAFT_E2E_TEST env is set
  const { installE2EHook } = require('./e2eSmokeHook');
  installE2EHook(win);

  // 插件系统：IPC handlers + 注册表立即加载（轻量），目录扫描延迟执行
  loadRegistry()
  registerPluginHandlers()
  // 延迟扫描：不阻塞首屏渲染，扫描完成后广播更新
  setImmediate(() => {
    scanAndValidate()
    scanDevPlugins()
    // 通知渲染进程插件列表已就绪
    const plugins = getInstalledPlugins()
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send(CORE_CHANNELS.PLUGIN_REGISTRY_CHANGED, plugins)
    })
  })

  registerAgentIPCs(ipcMain);
  ipcMain.handle(CORE_CHANNELS.OPEN_CLAUDE_WIN, () => openClaudeWin({ initUrl, env: NODE_ENV }));
  ipcMain.handle(CORE_CHANNELS.OPEN_CODEX_WIN, () => openCodexWin({ initUrl, env: NODE_ENV }));

  // 通用目录选择（claude 和 codex 共用）
  const { dialog } = require('electron')
  ipcMain.handle('select-directory', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // 任务栏图标闪烁提醒
  ipcMain.handle(CORE_CHANNELS.FLASH_TASKBAR, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.flashFrame(true)
  })

  // MindCraft-owned diagnostics live under app userData, not provider directories.
  ipcMain.handle(CORE_CHANNELS.APPEND_TASK_LOG, (_event, line) => {
    const logDir = path.join(app.getPath('userData'), 'diagnostics')
    fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, 'task-diag.log')
    const ts = new Date().toISOString()
    appendLogLineWithRotation(logPath, `${ts} ${line}\n`, { maxBytes: DEFAULT_MAX_BYTES })
  })


  win.once("ready-to-show", () => {
    win.show();
    mainRendererReady = true
    openQueuedAssociatedMarkdown()
  })

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (win && !win.isVisible()) {
      win.show();
    }
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.exit();
});

// 外部链接默认游览器打开
app.on("web-contents-created", (event, contents) => {
  contents.on("new-window", (event, url) => {
    const ownerWindow = contents.getOwnerBrowserWindow();
    if (ownerWindow && ownerWindow.getTitle() === "MindCraft-Agent") {
      // 如果是 createWindow 创建的窗口，打开外部浏览器
      shell.openExternal(url);
      event.preventDefault();
    }
  });
  contents.on("will-navigate", (event, url) => {
    const ownerWindow = contents.getOwnerBrowserWindow();
    if (ownerWindow && ownerWindow.getTitle() === "MindCraft-Agent") {
      // 如果是 createWindow 创建的窗口，打开外部浏览器
      shell.openExternal(url);
      event.preventDefault();
    }
  });
});

// 主题持久化（IPC 文件存储，不依赖 Chromium localStorage）— extracted to themeStore.js
const userDataPath = app.getPath('userData')
ipcMain.on(CORE_CHANNELS.LOAD_THEME, (event) => { event.returnValue = loadThemeFromFile(userDataPath) })
ipcMain.on(CORE_CHANNELS.SAVE_THEME, (_, name) => {
  saveThemeToFile(userDataPath, name)
})

