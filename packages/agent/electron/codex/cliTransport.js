'use strict'

const { execFile, spawn } = require('child_process')
const readline = require('readline')

function isWindowsCommandShim(executablePath, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(String(executablePath || ''))
}

function terminateOwnedChild(child, { platform = process.platform, execFileImpl = execFile } = {}) {
  if (!child || child.exitCode !== null || child.killed) return false
  if (platform === 'win32' && Number.isInteger(child.pid)) {
    execFileImpl('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {})
    return true
  }
  try { return child.kill('SIGTERM') } catch (_) { return false }
}

function toTomlValue(value) {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Codex config values must be finite numbers')
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(toTomlValue).join(',')}]`
  throw new Error(`Unsupported Codex config value type: ${typeof value}`)
}

function serializeConfigOverrides(config, prefix = '', out = []) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return out
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      serializeConfigOverrides(value, path, out)
    } else {
      out.push(`${path}=${toTomlValue(value)}`)
    }
  }
  return out
}

function buildCodexCliArgs({
  threadId = '',
  model = '',
  sandboxMode = '',
  workingDirectory = '',
  skipGitRepoCheck = false,
  modelReasoningEffort = '',
  networkAccessEnabled,
  webSearchMode = '',
  approvalPolicy = 'never',
  additionalDirectories = [],
  imagePaths = [],
  baseUrl = '',
  config = null,
  capabilities = null,
} = {}) {
  const args = ['exec', '--json']
  for (const override of serializeConfigOverrides(config)) args.push('--config', override)
  if (baseUrl) args.push('--config', `openai_base_url=${toTomlValue(baseUrl)}`)
  if (model) args.push('--model', model)
  if (sandboxMode) args.push('--sandbox', sandboxMode)
  if (workingDirectory) args.push('--cd', workingDirectory)
  for (const directory of capabilities?.additionalDirectories !== false && Array.isArray(additionalDirectories) ? additionalDirectories : []) {
    if (directory) args.push('--add-dir', directory)
  }
  if (skipGitRepoCheck && capabilities?.skipGitRepoCheck !== false) args.push('--skip-git-repo-check')
  if (modelReasoningEffort) args.push('--config', `model_reasoning_effort=${toTomlValue(modelReasoningEffort)}`)
  if (networkAccessEnabled !== undefined) {
    args.push('--config', `sandbox_workspace_write.network_access=${networkAccessEnabled ? 'true' : 'false'}`)
  }
  if (webSearchMode) args.push('--config', `web_search=${toTomlValue(webSearchMode)}`)
  if (approvalPolicy) args.push('--config', `approval_policy=${toTomlValue(approvalPolicy)}`)
  if (threadId) args.push('resume', threadId)
  // `exec --image` accepts one or more paths and greedily consumes `resume`
  // plus its UUID. Resume-scoped image options must follow the subcommand.
  for (const imagePath of capabilities?.images !== false && Array.isArray(imagePaths) ? imagePaths : []) {
    if (imagePath) args.push('--image', imagePath)
  }
  return args
}

class CodexCliThread {
  constructor(client, threadId, threadOptions = {}) {
    this.client = client
    this.id = threadId || null
    this.threadOptions = threadOptions
    this.child = null
  }

  async runStreamed(input, { signal } = {}) {
    return { events: this.runStreamedInternal(input, { signal }) }
  }

  async *runStreamedInternal(input, { signal } = {}) {
    const imagePaths = Array.isArray(input)
      ? input.filter(part => part?.type === 'local_image').map(part => part.path).filter(Boolean)
      : []
    const prompt = typeof input === 'string'
      ? input
      : (Array.isArray(input) ? input.filter(part => part?.type === 'text').map(part => part.text).join('\n\n') : '')
    const args = buildCodexCliArgs({
      ...this.threadOptions,
      threadId: this.id || '',
      imagePaths,
      baseUrl: this.client.baseUrl,
      config: this.client.config,
      capabilities: this.client.capabilities,
    })
    const env = { ...this.client.env }
    if (this.client.apiKey) env.CODEX_API_KEY = this.client.apiKey
    const executable = this.client.executablePath
    const useShim = isWindowsCommandShim(executable, this.client.platform)
    const command = useShim ? 'cmd.exe' : executable
    const commandArgs = useShim ? ['/c', executable, ...args] : args
    const child = this.client.spawn(command, commandArgs, {
      cwd: this.threadOptions.workingDirectory || undefined,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    let spawnError = null
    let aborted = false
    const abort = () => {
      aborted = true
      terminateOwnedChild(child, { platform: this.client.platform, execFileImpl: this.client.execFile })
    }
    if (signal) {
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }
    const stderrChunks = []
    child.stderr?.on('data', chunk => stderrChunks.push(Buffer.from(chunk)))
    child.once('error', error => { spawnError = error })
    const exit = new Promise(resolve => {
      child.once('exit', (code, exitSignal) => resolve({ code, signal: exitSignal }))
    })
    if (!child.stdin || !child.stdout) {
      abort()
      throw new Error('Codex CLI child process has no stdin/stdout')
    }
    child.stdin.end(prompt)
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
    let consumedNormally = false
    try {
      for await (const line of lines) {
        if (!String(line).trim()) continue
        let event
        try {
          event = JSON.parse(line)
        } catch (error) {
          throw new Error(`Codex CLI emitted non-JSON stdout: ${String(line).slice(0, 240)}`, { cause: error })
        }
        if (event.type === 'thread.started' && event.thread_id) this.id = event.thread_id
        yield event
      }
      const result = await exit
      if (spawnError) throw spawnError
      if (aborted || signal?.aborted) {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        throw error
      }
      if (result.code !== 0 || result.signal) {
        const detail = result.signal ? `signal ${result.signal}` : `code ${result.code ?? 1}`
        throw new Error(`Codex CLI exited with ${detail}: ${Buffer.concat(stderrChunks).toString('utf8')}`)
      }
      consumedNormally = true
    } finally {
      lines.close()
      if (signal) signal.removeEventListener('abort', abort)
      // Parser/stream failures must not leave a child writing an unobserved
      // transcript after MindCraft has released its iterator.
      if (!consumedNormally && child.exitCode === null && !child.killed) {
        terminateOwnedChild(child, { platform: this.client.platform, execFileImpl: this.client.execFile })
      }
      this.child = null
    }
  }

  cancel() {
    terminateOwnedChild(this.child, { platform: this.client.platform, execFileImpl: this.client.execFile })
  }

  stop() {
    this.cancel()
  }
}

class CodexCliClient {
  constructor({ executablePath, apiKey = '', baseUrl = '', config = null, capabilities = null, env = process.env, spawnImpl = spawn, execFileImpl = execFile, platform = process.platform } = {}) {
    if (!executablePath) throw new Error('Codex CLI executable path is required')
    this.executablePath = executablePath
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.config = config
    this.capabilities = capabilities
    this.env = { ...env }
    this.spawn = spawnImpl
    this.execFile = execFileImpl
    this.platform = platform
  }

  startThread(options = {}) {
    return new CodexCliThread(this, '', options)
  }

  resumeThread(id, options = {}) {
    return new CodexCliThread(this, id, options)
  }
}

module.exports = {
  CodexCliClient,
  buildCodexCliArgs,
  isWindowsCommandShim,
  serializeConfigOverrides,
  terminateOwnedChild,
}
