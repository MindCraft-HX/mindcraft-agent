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
const NODE_PLATFORM = packageJson.platform || "WIN"

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

const { setupIpcHandlers } = require("./mainModules/ipcHandlers");
const { setupAutoUpdater } = require("./mainModules/autoUpdate");
const { loadRegistry, scanAndValidate, scanDevPlugins, registerIPCHandlers: registerPluginHandlers, getInstalledPlugins } = require("./mainModules/pluginManager");

const { registerAgentIPCs, resetCodexSdkRuntime } = require("../packages/agent/electron");
const { openClaudeWin } = require("./claudeWindow/index.js");
const { openCodexWin } = require("./codexWindow/index.js");

const { initCodeWin } = require("./searchView/index.js");
const { openMdInMain, setMainWindow, registerMdViewerHandlers } = require("./mdRouting.js");

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

app.on('before-quit', () => {
  isAppQuitting = true
})

// 单实例锁（仅生产模式，dev 模式允许多开调试）
if (NODE_ENV !== 'development') {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
  }
}

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
  ipcMain.on('window-minimize', () => win?.minimize());
  ipcMain.on('window-maximize', () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on('window-close', () => win?.close());
  ipcMain.handle('window-is-maximized', () => win?.isMaximized() ?? false);

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
    // Ctrl+Shift+I / Cmd+Shift+I：打开 DevTools（所有环境）
    // input.key 在不同平台可能返回大小写不一致，统一用大写比较
    const key = (input.key || '').toUpperCase()
    if (key === 'I' && input.shift && (input.control || input.meta) && !input.alt) {
      win.webContents.openDevTools({ mode: 'detach' })
      event.preventDefault()
    }
    // 开发模式额外：Ctrl+R / Cmd+R 刷新页面
    if (NODE_ENV === 'development' && key === 'R' && (input.control || input.meta) && !input.shift && !input.alt) {
      win.reload()
      event.preventDefault()
    }
  })

  // 复制粘贴
  win.webContents.on("context-menu", async (e, params) => {
    const contextMenu = new Menu();

    // 添加标准的复制、剪切、粘贴等选项
    contextMenu.append(
      new MenuItem({ label: "复制", role: "copy", accelerator: "CmdOrCtrl+C" })
    );
    if (params.isEditable) {
      contextMenu.append(
        new MenuItem({ label: "剪切", role: "cut", accelerator: "CmdOrCtrl+X" })
      );
      contextMenu.append(
        new MenuItem({
          label: "粘贴",
          role: "paste",
          accelerator: "CmdOrCtrl+V",
        })
      );
      contextMenu.append(
        new MenuItem({
          label: "撤销",
          role: "undo",
          accelerator: "CmdOrCtrl+Z",
        })
      );
      contextMenu.append(
        new MenuItem({
          label: "重做",
          role: "redo",
          accelerator: "CmdOrCtrl+Y",
        })
      );
      contextMenu.append(new MenuItem({ type: "separator" }));
    }
    // 如果点击的是图片，则添加保存图片和复制图片选项
    if (params.mediaType === "image") {
      contextMenu.append(
        new MenuItem({
          label: "保存图片",
          click: async () => {
            const imageUrl = params.srcURL;
            const image = await fetchImage(imageUrl);
            if (image) {
              const { filePath } = await dialog.showSaveDialog(win, {
                title: "保存图片",
                defaultPath: "image.png",
                filters: [
                  { name: "Images", extensions: ["png", "jpg", "jpeg", "gif"] },
                ],
              });
              if (filePath) {
                fs.writeFileSync(filePath, image.toPNG());
              }
            }
          },
        })
      );

      contextMenu.append(
        new MenuItem({
          label: "复制图片",
          click: async () => {
            const imageUrl = params.srcURL;
            const image = await fetchImage(imageUrl);
            if (image) {
              clipboard.writeImage(image);
            }
          },
        })
      );
    }

    // 显示菜单
    contextMenu.popup(win, params.x, params.y);
  });
}

let tray = null;
function createTray(platform) {
  const iconPath = path.join(__dirname, '../dist/logo-white.png');
  if(process.platform == "darwin") {
    // 加载图标并调整尺寸
    const image = nativeImage.createFromPath(iconPath);
    const resizedImage = image.resize({ width: 18, height: 18 });
    tray = new Tray(resizedImage);
  } else {
    tray = new Tray(iconPath); 
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: '打开', click: () => win.show() },
    { label: '设置', click: () => {
      win.show()
      setTimeout(() => {
        win.webContents.send("open-tab-by-name", {type: 'settings'});
      }, 0);
    }},
    { label: '退出', click: () => app.exit() }
  ])
  tray.setContextMenu(contextMenu)
  tray.setToolTip("MindCraft-Agent");
  tray.on("click", () => {
    win.show();
  });
}

function prepareForUpdateInstall() {
  isQuittingForUpdate = true
  isAppQuitting = true
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
ipcMain.on("openEmail", (event, emailAddress) => {
  const mailtoLink = `mailto:${emailAddress}`;
  shell.openExternal(mailtoLink);
});
// 添加以下代码以实现主进程的自动重新加载
// if (process.env.NODE_ENV === 'development') {
//   require('electron-reload')(__dirname, {
//     electron: require(`${__dirname}/node_modules/electron`),
//   });
// }

// 获取图片，支持本地和远程
async function fetchImage(imageUrl) {
  try {
    if (imageUrl.startsWith("http")) {
      // 远程图片
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      return nativeImage.createFromBuffer(Buffer.from(response.data));
    } else {
      // 本地图片
      return nativeImage.createFromPath(imageUrl);
    }
  } catch (error) {
    console.error("Failed to fetch image:", error);
    return null;
  }
}

ipcMain.handle('open-md-win', (_event, payload) => openMdInMain(payload))
registerMdViewerHandlers()


app.whenReady().then(async () => {
  createWindow();
  setMainWindow(win);
  createTray(NODE_PLATFORM)
  createStore()
  setupIpcHandlers(NODE_ENV, NODE_PLATFORM); //ipcMain文件
  setupAutoUpdater(NODE_ENV, win, { beforeInstall: prepareForUpdateInstall }); //更新文件

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
      if (!w.isDestroyed()) w.webContents.send('plugin-registry-ready', plugins)
    })
  })

  registerAgentIPCs(ipcMain);
  ipcMain.handle('open-claude-win', () => openClaudeWin({ initUrl, env: NODE_ENV }));
  ipcMain.handle('open-codex-win', () => openCodexWin({ initUrl, env: NODE_ENV }));

  // 通用目录选择（claude 和 codex 共用）
  const { dialog } = require('electron')
  ipcMain.handle('select-directory', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // 任务栏图标闪烁提醒
  ipcMain.handle('flash-taskbar', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.flashFrame(true)
  })

  // MindCraft-owned diagnostics live under app userData, not provider directories.
  ipcMain.handle('append-task-log', (_event, line) => {
    const logDir = path.join(app.getPath('userData'), 'diagnostics')
    fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, 'task-diag.log')
    const ts = new Date().toISOString()
    fs.appendFileSync(logPath, `${ts} ${line}\n`)
  })


  win.once("ready-to-show", () => {
    win.show();
    initCodeWin({win, NODE_ENV})
  })

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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

ipcMain.on('open-system-settings', () => {
  // 根据操作系统执行不同的命令
  if (process.platform === 'win32') {
    exec('start ms-settings:privacy-microphone');
  } else if (process.platform === 'darwin') {
    exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"');
  } else if (process.platform === 'linux') {
    // Linux 用户需要根据具体的发行版和桌面环境来调整命令
    exec('gnome-control-center privacy');
  }
});

ipcMain.handle('get-login-item-settings', () => {
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('set-login-item-settings', (event, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin })
});
ipcMain.handle('get-app-version', () => app.getVersion());

// 主题持久化（IPC 文件存储，不依赖 Chromium localStorage）
const themeFilePath = path.join(app.getPath('userData'), 'theme.json')
const VALID_THEMES = ['dark', 'light', 'blue', 'brown']
function loadThemeFromFile() {
  try {
    if (fs.existsSync(themeFilePath)) {
      const data = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'))
      if (data?.theme && VALID_THEMES.includes(data.theme)) return data.theme
    }
  } catch (_) {}
  return null
}
function saveThemeToFile(name) {
  try {
    const dir = path.dirname(themeFilePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(themeFilePath, JSON.stringify({ theme: name }), 'utf-8')
  } catch (_) {}
}
ipcMain.on('load-theme', (event) => { event.returnValue = loadThemeFromFile() })
ipcMain.on('save-theme', (_, name) => {
  if (VALID_THEMES.includes(name)) saveThemeToFile(name)
})

// 监听从渲染进程发来的打开新窗口的请求
ipcMain.on('open-new-window', (event, arg) => {
  let baseWin = new BrowserWindow({
      width: 1200,
      height: 915,
      title: "linked_window", // 设置窗口标题
      // resizable: false, // 禁止调整窗口大小
      icon: path.join(__dirname, "../dist/logo-white.png"), // 设置窗口图标
      webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
      }
  });
  initCodeWin({win: baseWin, NODE_ENV})
  baseWin.setMenu(null);
  baseWin.loadURL(arg); // 加载传入的 URL
});
//  打开外部弹窗
function isHttpExternalUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

ipcMain.on('open-external-window', (event, arg) => {
  event.preventDefault();
  if (!isHttpExternalUrl(arg)) return;
  shell.openExternal(String(arg).trim());
});

// 打开一个单例窗口
const singleWindows = new Map();
ipcMain.on('open-single-window', (event, arg) => {
  const { windowId, url } = arg;
  if(singleWindows.has(windowId)){
    const existingWindow = singleWindows.get(windowId);
    if(existingWindow && !existingWindow.isDestroyed()){
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }
      existingWindow.loadURL(url);
      existingWindow.show();
      existingWindow.focus();
    }else {
      // 如果窗口已被销毁，从Map中删除
      singleWindows.delete(windowId);
    }
  }else{
    let singleWin = new BrowserWindow({
      width: 1200,
      height: 915,
      title: "single_window", // 设置窗口标题
      icon: path.join(__dirname, "../dist/logo-white.png"), // 设置窗口图标
      webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
      }
  });
  initCodeWin({win: singleWin, NODE_ENV})
  singleWin.setMenu(null);
  // 加载URL
  singleWin.loadURL(url);
  // 将窗口存储到Map中
  singleWindows.set(windowId, singleWin);
  }
});
