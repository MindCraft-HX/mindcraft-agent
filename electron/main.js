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
const { setupIpcHandlers } = require("./mainModules/ipcHandlers");
const { setupAutoUpdater } = require("./mainModules/autoUpdate");
const { setupPtyHandlers } = require("./mainModules/ptyManager");
const { registerAgentIPCs, resetCodexSdkRuntime } = require("../packages/agent/electron");
const { openClaudeWin } = require("./claudeWindow/index.js");
const { openCodexWin } = require("./codexWindow/index.js");
const { SideFloatWin } = require("./floatWindow/sideFloatWin.js");
const { initCodeWin } = require("./searchView/index.js");
const { openMdWin, registerMdViewerHandlers } = require("./mdWindow/index.js");

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
let initUrl = path.join(__dirname, "../dist/index.html")
let sideFloatWin = null
let win = null

if(NODE_ENV != "development") {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.exit();
  } else {
    app.on("second-instance", (event, commandLine, workingDirectory) => {
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
  win.setIcon(path.join(__dirname, "../dist/logo-html.png"));
  //设置居中
  win.center();
  //隐藏菜单栏
  win.setMenu(null);
  // 始终从 dist 文件加载，避免依赖外部 dev server
  win.loadFile(initUrl);
  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
   })

  if(NODE_ENV != "production") {
    if(NODE_ENV == "development") {
        win.webContents.openDevTools({ mode: "detach" });
    }
    // 注册全局快捷键，按下Ctrl+Shift+I时触发打开开发者工具
    globalShortcut.register("CommandOrControl+Shift+I", () => {
      win.webContents.openDevTools({ mode: "detach" });
    });
  
    //按下Ctrl+R时触发刷新页面
    globalShortcut.register("CmdOrCtrl+R", () => {
      win.reload();
    });
    
  }

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
  const iconPath = path.join(__dirname, '../dist/logo-html.png');
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

const { Conf, useConf } = require('electron-conf')
function createStore() {
  const conf = new Conf()
  conf.registerRendererListener()
  useConf()
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

ipcMain.handle('open-md-win', (_event, payload) => openMdWin({ initUrl, env: NODE_ENV, payload }))
registerMdViewerHandlers()


app.whenReady().then(async () => {
  createWindow();
  createTray(NODE_PLATFORM)
  createStore()
  setupIpcHandlers(NODE_ENV, NODE_PLATFORM); //ipcMain文件
  setupAutoUpdater(NODE_ENV, win); //更新文件
  setupPtyHandlers();
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

  // 任务追踪诊断日志 → 写入 ~/.claude/task-diag.log
  ipcMain.handle('append-task-log', (_event, line) => {
    const logPath = path.join(require('os').homedir(), '.claude', 'task-diag.log')
    const ts = new Date().toISOString()
    fs.appendFileSync(logPath, `${ts} ${line}\n`)
  })


  // 主窗口ready后再创建浮动窗口，避免阻塞
  win.once("ready-to-show", () => {
    sideFloatWin = new SideFloatWin({initUrl, env: NODE_ENV, platform: NODE_PLATFORM, mainWin: win})
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

// 主题持久化（IPC 文件存储，不依赖 Chromium localStorage）
const themeFilePath = path.join(app.getPath('userData'), 'theme.json')
const VALID_THEMES = ['dark', 'light', 'blue']
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
      icon: path.join(__dirname, "../dist/logo-html.png"), // 设置窗口图标
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
ipcMain.on('open-external-window', (event, arg) => {
  event.preventDefault();
  shell.openExternal(arg);
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
      icon: path.join(__dirname, "../dist/logo-html.png"), // 设置窗口图标
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
