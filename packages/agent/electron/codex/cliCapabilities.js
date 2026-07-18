'use strict'

const { execFile } = require('child_process')

const capabilityProbeCache = new Map()

function runExecutable(executablePath, args, { env, execFileImpl = execFile, platform = process.platform } = {}) {
  const shim = platform === 'win32' && /\.(cmd|bat)$/i.test(String(executablePath || ''))
  const command = shim ? 'cmd.exe' : executablePath
  const commandArgs = shim ? ['/c', executablePath, ...args] : args
  return new Promise((resolve, reject) => {
    execFileImpl(command, commandArgs, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      env,
    }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve(String(stdout || ''))
    })
  })
}

function normalizeCodexVersion(raw) {
  const parts = String(raw || '').trim().split(/\s+/)
  const token = parts.find(part => /^v?\d/.test(part)) || ''
  return token.replace(/^v/, '')
}

function capabilitiesFromExecHelp(helpText = '') {
  const text = String(helpText || '')
  return {
    execJson: /(^|\n)\s*--json\b/m.test(text),
    resume: /(^|\n)\s*resume\s{2,}/m.test(text),
    images: /--image\b/.test(text),
    additionalDirectories: /--add-dir\b/.test(text),
    skipGitRepoCheck: /--skip-git-repo-check\b/.test(text),
  }
}

async function probeCodexCliCapabilities(executablePath, options = {}) {
  const [versionText, execHelp] = await Promise.all([
    runExecutable(executablePath, ['--version'], options),
    runExecutable(executablePath, ['exec', '--help'], options),
  ])
  const capabilities = capabilitiesFromExecHelp(execHelp)
  return {
    executablePath,
    version: normalizeCodexVersion(versionText),
    capabilities,
    compatible: capabilities.execJson && capabilities.resume,
  }
}

function getCodexCliCapabilities(executablePath, options = {}) {
  const key = String(executablePath || '')
  if (!key) return Promise.reject(new Error('Codex CLI executable path is required'))
  if (!capabilityProbeCache.has(key)) {
    const probe = probeCodexCliCapabilities(executablePath, options)
    capabilityProbeCache.set(key, probe)
    probe.catch(() => {
      // A transient PATH/process failure must be retried on the next run.
      if (capabilityProbeCache.get(key) === probe) capabilityProbeCache.delete(key)
    })
  }
  return capabilityProbeCache.get(key)
}

function clearCodexCliCapabilitiesCache() {
  capabilityProbeCache.clear()
}

module.exports = {
  capabilitiesFromExecHelp,
  clearCodexCliCapabilitiesCache,
  getCodexCliCapabilities,
  normalizeCodexVersion,
  probeCodexCliCapabilities,
}
