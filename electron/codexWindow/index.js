const { BrowserWindow, Menu, MenuItem, clipboard } = require('electron')
const path = require('path')

let codexWin = null

function openCodexWin({ initUrl, env }) {
  if (codexWin && !codexWin.isDestroyed()) {
    if (codexWin.isMinimized()) codexWin.restore()
    codexWin.show()
    codexWin.focus()
    return codexWin
  }

  codexWin = new BrowserWindow({
    useContentSize: true,
    width: 960,
    height: 720,
    minWidth: 600,
    minHeight: 400,
    show: false,
    title: 'GPT Codex',
    icon: path.join(__dirname, '../../dist/logo-white.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: false,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: true,
    },
  })

  codexWin.setMenu(null)
  codexWin.center()

  // setMenu(null) 会禁用内置快捷键，用隐藏菜单恢复 Ctrl+C/V/X/A/Z
  const editMenu = Menu.buildFromTemplate([{
    label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]
  }])
  codexWin.setMenu(editMenu)
  codexWin.setMenuBarVisibility(false)

  // 缓存右键时的选区文本
  let contextMenuSelectionText = ''

  codexWin.webContents.on('context-menu', (e, params) => {
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
          codexWin.webContents.insertText('')
        },
        accelerator: 'CmdOrCtrl+X'
      }))
      menu.append(new MenuItem({
        label: '粘贴',
        click: async () => {
          const text = clipboard.readText()
          codexWin.webContents.insertText(text)
        },
        accelerator: 'CmdOrCtrl+V'
      }))
      menu.append(new MenuItem({
        label: '全选',
        click: () => {
          codexWin.webContents.selectAll()
        },
        accelerator: 'CmdOrCtrl+A'
      }))
    }
    if (menu.items.length) menu.popup({ window: codexWin })
  })

  const url = env === 'development'
    ? `${initUrl}#/main/codex`
    : `file://${initUrl}#/main/codex`

  // 只在开发环境打开开发者工具
  if (env === 'development') {
    codexWin.webContents.openDevTools({ mode: "detach" });
  }

  codexWin.loadURL(url)
  codexWin.once('ready-to-show', () => codexWin.show())
  codexWin.on('closed', () => { codexWin = null })
  return codexWin
}

module.exports = { openCodexWin }
