const { app, globalShortcut, ipcMain, screen, BrowserWindow, clipboard, Menu } = require("electron");
const path = require("path");
const { Conf } = require('electron-conf')
const { AzCustomWindowMove } = require("./AzCustomWindowMove");

class SideFloatWin {
  // 页面地址
  initUrl = "";
  // 环境
  env = "";
  // 主窗口
  mainWin = null;
  // 窗口
  win = null;
  // 是否可以打开窗口
  canOpenSideFloatWin = true;
  // 窗口移动事件
  floatMoveEvent = null;

  constructor(options) {
    // 初始化全局配置
    this.initConfig(options)

    // 初始化窗口
    this.initWin()

    // 直接开启窗口
    this.openWin()

    // 注册窗口事件
    this.registerEvent()
    
  }
  // 初始化窗口配置
  initConfig(options) {
    const { initUrl, env, mainWin, platform } = options;
    this.initUrl = initUrl;
    this.env = env;
    this.mainWin = mainWin;
    this.platform = platform

    const conf = new Conf();
    const canOpenSideFloatWin = conf.get("canOpenSideFloatWin");
    if (Object.prototype.toString.call(canOpenSideFloatWin) === "[object Boolean]"){
      this.canOpenSideFloatWin = canOpenSideFloatWin
    }

  }
  initWin() {
    /************ 基础配置 ***********/
    const site = this.winSiteInfo(24, 180)
    this.win = new BrowserWindow({
      title: 'mindCraft',
      x: site.x,
      y: site.y,
      width: 60,
      height: 60,
      show: false,
      resizable: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      icon: path.join(__dirname, '../../dist/logo-white.png'),
      webPreferences: {
        preload: path.join(__dirname, "../../electron/preload.js"), //引进preload
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        contextIsolation: true,
        sandbox: false,
        webSecurity: true,
      }
    })
    if(this.env === "development"){
      this.win.loadURL(this.initUrl + "#/side");
    } else {
      this.win.loadFile(this.initUrl, {
        hash: 'side' 
      }); 
    }
    this.win.hide()
    this.win.setMenu(null);
    this.win.setSkipTaskbar(true);
    if (process.platform === 'darwin') {
      this.win.setVisibleOnAllWorkspaces(true);
    }
    this.handleWinMove()
    /************ 基础配置 ***********/

    /************ 开发工具 ***********/
    if (this.env === "development" || this.env === "testing") {
      // if (this.env === "development") {
      //   this.win.webContents.openDevTools({ mode: "detach" });
      // }
      // 注册全局快捷键，按下Ctrl+Shift+I时触发打开开发者工具
      globalShortcut.register("CommandOrControl+Shift+O", () => {
        this.win.webContents.openDevTools({ mode: "detach" });
      });

      //按下Ctrl+R时触发刷新页面
      globalShortcut.register("CmdOrCtrl+R", () => {
        this.win.reload();
      });
    }
    /************ 开发工具 ***********/

    /************ 监听事件 ***********/
    // 监听窗口最小化\失焦\聚焦等有可能窗口不置顶的时机
    this.win.on('minimize', () => {
      this.forcedFocusing()
    });
    this.win.on('blur', () => {
      // this.forcedFocusing()
      this.showWinHalf()
    });
    this.win.on('focus', () => {
      this.forcedFocusing()
      this.showWinAll()
    })
    this.win.on("closed", () => {
      // 在窗口对象被关闭时，取消订阅所有与该窗口相关的事件
      this.win.removeAllListeners();
      this.win = null;
    });
    /************ 监听事件 ***********/
  }
  // 打开窗口
  openWin(cb) {
    // 用户没有开启悬浮窗功能
    if (!this.canOpenSideFloatWin) {
      return
    }
    
    if (!this.win || !!this.win?.isDestroyed()) {
      this.initWin()
      this.win.once('ready-to-show', () => {
        this.showWin(cb)
      })
    } else {
      this.showWin(cb)
    }
  }
  // 显示窗口
  showWin(cb) {
    this.win.show()
    this.handleWinMove()

    if(Object.prototype.toString.call(cb) === '[object Function]' || Object.prototype.toString.call(cb) === '[object AsyncFunction]') {
      cb()
    }
  }
  registerEvent() {
    // 注册窗口操作
    ipcMain.on("side-float-operation", (event, info) => {
      this.floatOperation(info)
    })

    // 暴露指定状态给渲染进程
    this.winStateGetSet()
  }
  // 暴露指定状态给渲染进程
  winStateGetSet() {
    // 可获取的属性
    ipcMain.handle("get-side-float-info", (event, info) => {
      const options = {
        canOpenSideFloatWin: this.canOpenSideFloatWin,
        fixed: this.win?.isAlwaysOnTop(),
      }
      return options
    })
    // 可修改的属性
    const variableData = ['canOpenSideFloatWin']
    ipcMain.handle("set-side-float-info", (event, info) => {
      variableData.forEach((key) => {
        if(info.hasOwnProperty(key)) {
          this[key] = info[key]
        }
      })
      return
    })    
  }
  // 强制聚焦，场景：微信截图等全屏操作会导致失去焦点无法再置于顶层
  forcedFocusing() {
    this.win.moveTop()
    this.win.setAlwaysOnTop(false)
    setTimeout(() => {
      if(!this.win) {
        return
      }
      this.win.setAlwaysOnTop(true, "pop-up-menu")
    }, 300);
  }
  // 窗口操作
  floatOperation(info) {
    // console.log("floatOperation", info)
    switch (info.type) {
      case "move":
        this.moveFloatWin(info.value)
        break;
      case "rightClick":
        this.createMenu()
        break;
      case "dblClick":
        this.openMainWindow()
        break;
      case "mouseout":
        this.showWinHalf()
        break;
      case "mouseover":
        this.showWinAll()
        break;
      case "openWin":
        this.openWin()
        break;
      case "closeWin":
        this.closeWin()
        break;
      default:
        console.warn("未知操作！", info.type)
        break;
    }
  }
  // 窗口移动绑定
  handleWinMove() {
    // console.log("handleWinMove")
    this.floatMoveEvent = new AzCustomWindowMove()
    this.floatMoveEvent.init(this.win)
  }
  // 窗口移动事件
  moveFloatWin(info) {
    // console.log("moveFloatWin", info)
    switch (info) {
      // 拖拽窗口-开始
      case 'homeDragWindowStart':
        this.floatMoveEvent.start();
        break;
      // 拖拽窗口-结束
      case 'homeDragWindowEnd':
        this.floatMoveEvent.end();
        break;

      default:
        break;
    }
  }
  // 创建菜单
  createMenu() {
    const conf = new Conf();
    const menuList = [
      { label: '打开', click: () => this.mainWin.show() },
      { label: '开机启动', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: () => {
        app.setLoginItemSettings({ openAtLogin: !app.getLoginItemSettings().openAtLogin })
      }},
      // { label: `划词功能（${openShortcutFloatWin}）`, type: 'checkbox', checked: conf.get("canOpenFloatWin") != undefined ? conf.get("canOpenFloatWin") : true, click: () => {
      //   conf.set("canOpenFloatWin", !conf.get("canOpenFloatWin"))
      // }},
      { label: '浮窗功能', type: 'checkbox', checked: conf.get("canOpenSideFloatWin") != undefined ? conf.get("canOpenSideFloatWin") : true, click: () => {
        this.canOpenSideFloatWin = !conf.get("canOpenSideFloatWin")
        conf.set("canOpenSideFloatWin", this.canOpenSideFloatWin)
        if(this.canOpenSideFloatWin) {
          this.openWin()
        } else {
          this.closeWin()
        }
      }},
      // { label: `截图功能（${openShortcutScreenShot}）`, type: 'checkbox', checked: conf.get("canOpenScreenShotWin") != undefined ? conf.get("canOpenScreenShotWin") : true, click: () => {
      //   conf.set("canOpenScreenShotWin", !conf.get("canOpenScreenShotWin"))
      // }},
      { label: '退出', click: () => app.exit()}
    ]
    const contextMenu = Menu.buildFromTemplate(menuList)
    const mouseStartPosition = screen.getCursorScreenPoint();
    contextMenu.popup(this.win, mouseStartPosition.x, mouseStartPosition.y);
  }
  // 打开主窗口
  openMainWindow() {
    if(!this.mainWin){
      return
    }
    this.mainWin.show()
  }
  // 关闭窗口
  closeWin() {
    if(!this.win) {
      return
    }
    this.win.hide()
  }
  // 显示一半窗口
  showWinHalf() {
    this.moveWindowWithAnimation(this.win, this.winSiteInfo(24, 180), 200)
  }
  // 显示完整窗口
  showWinAll() {
    // 这里宽度要少出来一个像素，避免极端情况鼠标移入移出来回切
    this.moveWindowWithAnimation(this.win, this.winSiteInfo(59, 180), 200)
  }
  // 窗口实际位置信息
  winSiteInfo(offestX, offestY) {
    const siteInfo = screen.getAllDisplays().reduce((p, c) => {
      const {x, y, width, height} = c.bounds
      if(x + width - offestX > p.x){
        p.x = x + width - offestX
        p.y = y + height - offestY
        p.displayFrequency = c.displayFrequency
      }
      return p
    }, {x: 0, y: 0, displayFrequency: 60})
    return siteInfo
  }
  // 窗口移动动画
  moveWindowWithAnimation(window, {x, y, displayFrequency}, duration) {
    const startX = window.getPosition()[0];
    const startY = window.getPosition()[1];
    const startTime = Date.now();
    function animate() {
      const currentTime = Date.now();
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1); // 计算动画进度（0 到 1）
      // 计算当前窗口位置
      const currentX = startX + (x - startX) * progress;
      // 只要是奇数的缩放比例，这种计算方式就出精度问题，所以这里直接用y，不考虑多屏时，屏幕不对齐的情况了
      // const currentY = startY + (y - startY) * progress;
      const currentY = startY
      // 设置窗口位置
      window.setPosition(Math.round(currentX), Math.round(currentY));
      // 如果动画未完成，继续下一帧
      if (progress < 1) {
        setTimeout(animate, 1000 / displayFrequency / 2);
      }
    }
    // 启动动画
    animate();
  }
}

module.exports = { SideFloatWin }
