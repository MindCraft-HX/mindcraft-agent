const { ipcMain, dialog } = require('electron')
const pty = require('node-pty')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { Conf } = require('electron-conf')
const { augmentEnvWithBundledRg } = require('./localSearch')

/** 安全发送 IPC，避免窗口已销毁时抛错 */
function safeSend(sender, channel, ...args) {
  try {
    if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
      sender.send(channel, ...args)
    }
  } catch (_) {}
}

const CLI_PATH = path.join(__dirname, '../../node_modules/@anthropic-ai/claude-code/cli.js')

function findNodePath() {
  const { execSync } = require('child_process')
  try {
    const cmd = process.platform === 'win32' ? 'where node' : 'which node'
    const result = execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim()
    return result.split('\n')[0].trim() || 'node'
  } catch (_) { return 'node' }
}

const NODE_PATH = findNodePath()

// tabId -> { pty, sender }
const sessions = new Map()

function getEnv(apiKey, baseURL) {
  const env = { ...process.env }
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey
  if (baseURL) env.ANTHROPIC_BASE_URL = baseURL
  // Windows 终端颜色支持
  env.FORCE_COLOR = '1'
  env.COLORTERM = 'truecolor'
  return env
}

function setupPtyHandlers() {
  const claudeConf = new Conf({ name: 'claude-config' })
  // 创建新 tab（pty 进程）
  ipcMain.handle('pty-create', (event, { tabId, cwd, cols, rows }) => {
    if (sessions.has(tabId)) return

    const apiKey = claudeConf.get('claudeApiKey', '')
    const baseURL = claudeConf.get('claudeBaseURL', '')

    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash'
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 120,
      rows: rows || 30,
      cwd: cwd || os.homedir(),
      env: augmentEnvWithBundledRg(getEnv(apiKey, baseURL)),
    })

    sessions.set(tabId, { pty: ptyProcess, sender: event.sender })

    ptyProcess.onData((data) => {
      const s = sessions.get(tabId)
      if (s) safeSend(s.sender,'pty-data', { tabId, data })
    })

    ptyProcess.onExit(({ exitCode }) => {
      const s = sessions.get(tabId)
      sessions.delete(tabId)
      if (s) safeSend(s.sender,'pty-exit', { tabId, exitCode })
    })

    // 启动后自动运行 claude
    const claudeCmd = `node "${CLI_PATH}"\r`
    ptyProcess.write(claudeCmd)
  })

  // 向 pty 写入数据（键盘输入）
  ipcMain.handle('pty-write', (_, { tabId, data }) => {
    const s = sessions.get(tabId)
    if (s) s.pty.write(data)
  })

  // 调整终端大小
  ipcMain.handle('pty-resize', (_, { tabId, cols, rows }) => {
    const s = sessions.get(tabId)
    if (s) s.pty.resize(cols, rows)
  })

  // 销毁 tab
  ipcMain.handle('pty-destroy', (_, tabId) => {
    const s = sessions.get(tabId)
    if (s) { s.pty.kill(); sessions.delete(tabId) }
  })

  // 选择工作目录
  ipcMain.handle('pty-select-dir', async (event) => {
    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // 上传图片 -> 写入临时文件，返回路径
  ipcMain.handle('pty-save-image', (_, { dataUrl, name }) => {
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const ext = dataUrl.match(/^data:image\/(\w+);/)?.[1] || 'png'
    const tmpPath = path.join(os.tmpdir(), `claude-img-${Date.now()}.${ext}`)
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'))
    return tmpPath
  })

  // 更新所有 session 的 sender（窗口重新聚焦时）
  ipcMain.handle('pty-update-sender', (event, tabId) => {
    const s = sessions.get(tabId)
    if (s) s.sender = event.sender
  })
}

module.exports = { setupPtyHandlers }
