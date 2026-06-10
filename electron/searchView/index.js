const { globalShortcut, ipcMain, BrowserView } = require("electron");
const path = require("path");
let searchView = null;
let searchUrl = path.join(__dirname, "../dist/search.html");
function initCodeWin(options) {
  const { win, NODE_ENV } = options;
  // 当主窗口获得焦点时
  win.on("focus", () => {
    // 注册全局快捷键，打开搜索视图
    globalShortcut.register("CommandOrControl+F", function () {
      try {
        // 如果已经存在搜索视图，则销毁之前的
        if (searchView) {
          closeSearchView();
        };
        // 创建一个新的BrowserView
        searchView = new BrowserView({
          webPreferences: {
            // nodeIntegration: true,
            webviewTag: true,
            devTools: true,
            contextIsolation: true,
            nodeIntegrationInWorker: true,
            contextIsolation: true, //禁用上下文隔离
            nodeIntegration: true, //启用Node集合
            preload: path.join(__dirname, "../../electron/preload.js"),
          },
        });
        updateSearchViewBounds(win);
  
        // 将搜索视图添加到主窗口中
        win?.addBrowserView(searchView);
  
        // 加载搜索视图中的HTML文件
        searchUrl = path.join(__dirname, "./search.html");
        searchView.webContents.loadFile(searchUrl);
      } catch (error) {
        console.log(error);
      }
    });

    ipcMain.on("search-page", (event, arg) => {
      try {
        const searchObj = JSON.parse(arg);
  
        win?.webContents?.findInPage(searchObj.value, {
          findNext: searchObj.start,
          forward: searchObj.next,
        });
      } catch (error) {
        console.log(error);
      }
    });

    ipcMain.on("stop-search", (event, arg) => {
      win?.webContents?.stopFindInPage("clearSelection");
    });
    ipcMain.on("close-search-page", (event, arg) => {
      closeSearchView();
    });
  });
  // 当主窗口失去焦点时
  win.on("blur", () => {
    closeSearchView();
    // 取消注册全局快捷键
    globalShortcut.unregister("CommandOrControl+F");
  });

  const closeSearchView = () => {
    try {
      win?.webContents?.stopFindInPage("clearSelection");
      if (searchView) {
        win?.removeBrowserView(searchView);
        searchView = null;
      }
    } catch (error) {
      console.log(error);
    }
  };
  win.on("resize", () => {
    if (searchView) {
      // 更新搜索视图的位置和大小
      updateSearchViewBounds(win);
    }
  });
  function updateSearchViewBounds(win) {
    if(!win) return
    try {
      const winBounds = win.getBounds();
      const x = winBounds.width - 360 - 60; // 计算新的x坐标
      const y = 30;
      searchView.setBounds({ x, y, width: 360, height: 70 });
    } catch (error) {
      console.log(error);
    }
  }
  win.webContents.on("found-in-page", (event, arg) => {
    // 向搜索视图发送找到的内容
    searchView?.webContents?.send("found-in-page", arg);
  });
}

module.exports = { initCodeWin };
