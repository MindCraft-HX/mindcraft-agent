const { BrowserWindow, Menu, MenuItem, clipboard } = require('electron')
const path = require('path')

let claudeWin = null

function openClaudeWin({ initUrl, env }) {
  if (claudeWin && !claudeWin.isDestroyed()) {
    if (claudeWin.isMinimized()) claudeWin.restore()
    claudeWin.show()
    claudeWin.focus()
    return
  }

  claudeWin = new BrowserWindow({
    useContentSize: true,
    width: 960,
    height: 720,
    minWidth: 600,
    minHeight: 400,
    show: false,
    title: 'Claude Code',
    icon: path.join(__dirname, '../../dist/logo-html.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: false,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: true,
    },
  })

  claudeWin.setMenu(null)
  claudeWin.center()

  // setMenu(null) 会禁用内置快捷键，用隐藏菜单恢复 Ctrl+C/V/X/A/Z
  const editMenu = Menu.buildFromTemplate([{
    label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]
  }])
  claudeWin.setMenu(editMenu)
  claudeWin.setMenuBarVisibility(false)

  // 缓存右键时的选区文本
  let contextMenuSelectionText = ''

  claudeWin.webContents.on('context-menu', (e, params) => {
    // 保存当前选区文本
    contextMenuSelectionText = params.selectionText || ''
    
    const menu = new Menu()
    if (contextMenuSelectionText) {
      menu.append(new MenuItem({ 
        label: '复制', 
        click: () => {
          clipboard.writeText(contextMenuSelectionText)
        },
        accelerator: 'CmdOrCtrl+C'
      }))
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ 
        label: '剪切', 
        click: () => {
          clipboard.writeText(contextMenuSelectionText)
          claudeWin.webContents.insertText('')
        },
        accelerator: 'CmdOrCtrl+X' 
      }))
      menu.append(new MenuItem({ 
        label: '粘贴', 
        click: async () => {
          const text = clipboard.readText()
          claudeWin.webContents.insertText(text)
        },
        accelerator: 'CmdOrCtrl+V' 
      }))
      menu.append(new MenuItem({ 
        label: '全选', 
        click: () => {
          claudeWin.webContents.selectAll()
        },
        accelerator: 'CmdOrCtrl+A' 
      }))
    }
    if (menu.items.length) menu.popup({ window: claudeWin })
  })

  const url = env === 'development'
    ? 'http://127.0.0.1:5173/#/main/claudeCode'
    : `file://${initUrl}#/main/claudeCode`

  // 只在开发环境打开开发者工具
  if (env === 'development') {
    claudeWin.webContents.openDevTools({ mode: "detach" });
  }
  
  claudeWin.loadURL(url)
  claudeWin.once('ready-to-show', () => claudeWin.show())
  claudeWin.on('closed', () => { claudeWin = null })
}

module.exports = { openClaudeWin }
