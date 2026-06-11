const { BrowserWindow } = require("electron");
const path = require("path");
function openDrawWin() {
  let win = new BrowserWindow({
    useContentSize: true,
    width: 1220,
    height: 915,
    minWidth: 328,
    minHeight: 450,
    show: false,
    title: '画布',
    icon: path.join(__dirname, '../../dist/logo-white.png'),
    webPreferences: {
      preload: path.join(__dirname, "../../electron/preload.js"), //引进preload
      webSecurity: true,
      sandbox: false,
      nodeIntegrationInWorker: true,
      // devTools: true,
      contextIsolation: true, //禁用上下文隔离
      nodeIntegration: true, //启用Node集合
    },
  });
  //设置ICON
  win.setIcon(path.join(__dirname, "../../dist/logo-white.png"));
  //设置居中
  win.center();
  //隐藏菜单栏
  win.setMenu(null);
  win.loadURL("https://www.mindcraft.com.cn/tldraw");
  win.once("ready-to-show", () => {
    win.show();
  })
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  win.on("closed", () => {
    // 在窗口对象被关闭时，取消订阅所有与该窗口相关的事件
    win.removeAllListeners();
    win = null;
  });
}

module.exports = { openDrawWin };
