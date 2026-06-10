const { BrowserWindow } = require("electron");
const path = require("path");
function openCodeWin(options) {
  const { initUrl, env, title, type, codeData } = options;  
  let win = new BrowserWindow({
    useContentSize: true,
    width: 610,
    height: 450,
    minWidth: 328,
    minHeight: 450,
    show: false,
    title,
    icon: path.join(__dirname, '../../dist/logo-html.png'),
    webPreferences: {
      preload: path.join(__dirname, "../../electron/preload.js"), //引进preload
      webSecurity: true,
      sandbox: false,
      nodeIntegrationInWorker: true,
      // devTools: true,
      contextIsolation: true, //禁用上下文隔离
      nodeIntegration: true, //启用Node集合
      partition: String(new Date().getTime())
    },
  });
  //设置ICON
  win.setIcon(path.join(__dirname, "../../dist/logo-html.png"));
  //设置居中
  win.center();
  //隐藏菜单栏
  win.setMenu(null);
  if(type === 'html') {
    win.loadURL(initUrl + "#/htmlRunDrwer");
  }
  win.once("ready-to-show", () => {
    win.show();
  })
  if (env === "development" || env === "testing") {
    win.webContents.openDevTools({ mode: "detach" });
  }
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  // 等待页面加载完成后设置 sessionStorage
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`sessionStorage.setItem('codeData', ${JSON.stringify(codeData)});`);
  });
  win.on("closed", () => {
    // 在窗口对象被关闭时，取消订阅所有与该窗口相关的事件
    win.removeAllListeners();
    win = null;
  });
}

module.exports = { openCodeWin };
