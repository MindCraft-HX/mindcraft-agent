'use strict'

const { app, utilityProcess } = require('electron')
const path = require('node:path')

let helper = null
let timeout = null

function finish(code, detail = '') {
  if (timeout) clearTimeout(timeout)
  try { helper.kill() } catch (_) {}
  if (detail) console[code === 0 ? 'log' : 'error'](detail)
  app.exit(code)
}

app.whenReady().then(() => {
  helper = utilityProcess.fork(path.join(__dirname, 'terminal-pty-spike-child.cjs'), [], {
    serviceName: 'mindcraft-pty-spike',
  })
  timeout = setTimeout(() => finish(1, 'utility process timed out'), 15_000)
  helper.on('message', message => {
    if (message?.type === 'ready') {
      console.log(JSON.stringify({ ready: true, electron: process.versions.electron, abi: message.abi }))
      helper.postMessage({ type: 'run' })
      return
    }
    if (message?.type === 'status') {
      console.log(JSON.stringify(message))
      return
    }
    if (message?.type === 'error') {
      finish(1, message.error)
      return
    }
    if (message?.type !== 'result') return
    const passed = message.exitCode === 0 && String(message.output).includes('MC_PTY_SPIKE_OK')
    finish(passed ? 0 : 1, JSON.stringify({ passed, electron: process.versions.electron, abi: message.abi, output: message.output }))
  })
  helper.on('error', error => finish(1, error?.stack || String(error)))
  helper.on('exit', code => {
    if (code !== 0) finish(1, `utility process exited before result: ${code}`)
  })
}).catch(error => finish(1, error?.stack || String(error)))
