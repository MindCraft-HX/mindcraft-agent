'use strict';

/**
 * CodeX 环境模块：负责外部 CLI 路径探测。
 *
 * 从 codexAgent.js 中拆出（Phase 5 叶子模块拆分）。
 * 维护内部可变缓存（_globalCodexPath）。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getEnvWithNodePath, getFullEnv, resolveLoginShellPath } = require('../shared/shellPathHelper');
const { clearCodexCliCapabilitiesCache } = require('./cliCapabilities');

// ---- 内部可变状态 ----

let installingCodex = false;
let _codexConfRef = null;

/** 缓存的全局 codex 二进制路径（null=未找到，undefined=尚未探测） */
let _globalCodexPath = undefined;

function isExecutableHealthy(exePath, env) {
  if (!exePath || !fs.existsSync(exePath)) return false;
  try {
    const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exePath);
    const cmd = isCmdShim ? 'cmd.exe' : exePath;
    const args = isCmdShim ? ['/c', exePath, '--version'] : ['--version'];
    execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env || undefined,
    });
    return true;
  } catch (_) {
    return false;
  }
}

function getConfiguredCodexPath() {
  if (!_codexConfRef) return '';
  try {
    return String(_codexConfRef.get('codexExecutablePath', '') || '').trim();
  } catch (_) {
    return '';
  }
}

function findCodexCommandInPath(env, platform = process.platform, isHealthy = isExecutableHealthy) {
  const rawPath = env?.Path || env?.PATH || ''
  const names = platform === 'win32' ? ['codex.cmd', 'codex.exe', 'codex.bat'] : ['codex']
  for (const directory of String(rawPath).split(path.delimiter)) {
    const base = directory.trim().replace(/^"|"$/g, '')
    if (!base) continue
    for (const name of names) {
      const candidate = path.join(base, name)
      if (isHealthy(candidate, env)) return candidate
    }
  }
  return null
}

// ---- 对外 API ----

/**
 * Find the externally installed CLI without coupling runtime discovery to an
 * npm package's private vendor layout. npm is only one installation channel.
 */
function findGlobalCodexPath() {
  if (_globalCodexPath !== undefined) return _globalCodexPath;

  if (_codexConfRef) {
    try {
      const custom = getConfiguredCodexPath();
      if (custom && isExecutableHealthy(custom)) {
        _globalCodexPath = custom;
        return custom;
      }
    } catch (_) {}
  }

  const candidateEnvs = [getFullEnv(), getEnvWithNodePath()]
  const loginPath = resolveLoginShellPath()
  if (loginPath) candidateEnvs.push({ ...process.env, PATH: loginPath, Path: loginPath })

  for (const env of candidateEnvs) {
    const direct = findCodexCommandInPath(env)
    if (direct) {
      _globalCodexPath = direct
      return direct
    }
  }

  _globalCodexPath = null;
  return null;
}

/** 重置全局路径缓存（主要用于测试） */
function clearGlobalCodexPathCache() {
  _globalCodexPath = undefined;
  clearCodexCliCapabilitiesCache();
  // 同时清除 Conf 实例的内部缓存，确保下次 get() 从文件重新读取
  if (_codexConfRef) {
    try { _codexConfRef._store = null; } catch (_) {}
  }
}

function setCodexConfRef(ref) {
  _codexConfRef = ref;
}

// ---- 安装状态保护（与安装处理器共享） ----

function isInstallingCodex() {
  return installingCodex;
}

function setInstallingCodex(v) {
  installingCodex = Boolean(v);
}

module.exports = {
  findGlobalCodexPath,
  findCodexCommandInPath,
  getConfiguredCodexPath,
  isExecutableHealthy,
  clearGlobalCodexPathCache,
  setCodexConfRef,
  isInstallingCodex,
  setInstallingCodex,
};
