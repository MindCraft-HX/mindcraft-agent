/**
 * 跨平台端口清理脚本
 * 替代 predev 中 Windows-only 的 netstat/findstr/taskkill 命令
 */
const { execSync } = require('child_process')

const port = 16288

try {
  if (process.platform === 'win32') {
    const output = execSync(
      `netstat -ano|findstr :${port}|findstr LISTENING`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
    output.split(/\r?\n/).filter(Boolean).forEach(line => {
      const pid = line.trim().split(/\s+/).pop()
      if (/^\d+$/.test(pid)) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch (_) {}
      }
    })
  } else {
    // macOS/Linux: 使用 lsof 查找端口并 kill
    const result = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (result) {
      result.split(/\n/).filter(Boolean).forEach(pid => {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
      })
    }
  }
} catch (_) {
  // 端口未被占用 — 无需操作
}
