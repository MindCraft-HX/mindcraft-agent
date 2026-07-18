'use strict'

const { spawn } = require('node-pty')

process.parentPort.postMessage({ type: 'ready', abi: process.versions.modules })
process.parentPort.on('message', event => {
  const message = event?.data
  if (message?.type !== 'run') return
  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/sh')
  const args = process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile']
    : []
  let pty
  try {
    process.parentPort.postMessage({ type: 'status', status: 'spawning' })
    pty = spawn(shell, args, { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env })
    process.parentPort.postMessage({ type: 'status', status: 'spawned', pid: pty.pid })
  } catch (error) {
    process.parentPort.postMessage({ type: 'error', error: error?.stack || String(error), abi: process.versions.modules })
    return
  }
  let output = ''
  pty.onData(data => {
    output += data
    process.parentPort.postMessage({ type: 'status', status: 'data', bytes: output.length })
  })
  pty.onExit(({ exitCode }) => {
    process.parentPort.postMessage({ type: 'result', exitCode, output, abi: process.versions.modules })
  })
  pty.write(process.platform === 'win32' ? 'Write-Output MC_PTY_SPIKE_OK; exit 0\r' : 'printf MC_PTY_SPIKE_OK; exit 0\r')
  setTimeout(() => {
    process.parentPort.postMessage({ type: 'result', exitCode: -1, output, abi: process.versions.modules, timedOut: true })
    try { pty.kill() } catch (_) {}
  }, 5_000)
})
