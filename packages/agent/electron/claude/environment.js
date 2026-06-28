'use strict';

/**
 * ClaudeCode Environment — SDK loading, system binary discovery, env helpers.
 *
 * Extracted from claudeAgent.js (Phase 5 leaf-module split).
 * Manages internal mutable caches (_systemClaudePath, sdkModulePromise).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { augmentEnvWithBundledRg } = require('../localSearch');

// ---- Internal mutable state ----

let sdkModulePromise = null;
let _systemClaudePath = undefined;
let installingClaudeCode = false;
let _claudeConfRef = null; // set externally by setupClaudeHandlers

// ---- Public API ----

/** 构建包含系统 Node.js 路径的 env 对象（打包后 PATH 可能缺失 node/npm） */
function getEnvWithNodePath() {
  const env = { ...process.env };
  const nodeDirs = [
    path.dirname(process.execPath),
    'C:\\Program Files\\nodejs',
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
  ];
  const existingPaths = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const merged = [...nodeDirs, ...existingPaths];
  const uniquePaths = [...new Set(merged)];
  env.PATH = uniquePaths.join(path.delimiter);
  env.Path = env.PATH;
  return env;
}

/** 缓存系统 claude 路径，避免每次 query 都重新检测 */
async function findSystemClaude() {
  if (_systemClaudePath !== undefined) return _systemClaudePath;

  /** 通过 cmd/bat 包装器解析出真实的 .exe 路径 */
  const resolveExeFromShim = (shimPath) => {
    try {
      const content = fs.readFileSync(shimPath, 'utf8');
      const m = content.match(/"([^"]+claude\.exe)"/);
      if (m) {
        let exePath = m[1];
        if (exePath.includes('%dp0%')) {
          exePath = path.normalize(exePath.replace('%dp0%', path.dirname(shimPath)));
        }
        if (fs.existsSync(exePath)) return exePath;
      }
    } catch (_) {}
    return null;
  };

  const isExecutableHealthy = (exePath) => {
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
      });
      return true;
    } catch (_) {
      try {
        const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exePath);
        const cmd = isCmdShim ? 'cmd.exe' : exePath;
        const args = isCmdShim ? ['/c', exePath, '--help'] : ['--help'];
        execFileSync(cmd, args, {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  // 0. 用户手动指定的路径优先（仅使用外层注入的 conf，避免重复实例化）
  if (_claudeConfRef) {
    try {
      const custom = String(_claudeConfRef.get('claudeExecutablePath', '') || '').trim();
      if (custom && fs.existsSync(custom) && isExecutableHealthy(custom)) {
        _systemClaudePath = custom;
        return custom;
      }
    } catch (_) {}
  }

  /** 校验路径健康，若为 .cmd shim 则解析真实 .exe 并校验 */
  const tryPath = (p) => {
    if (!p || !fs.existsSync(p)) return null;
    if (/\.exe$/i.test(p)) {
      if (isExecutableHealthy(p)) { _systemClaudePath = p; return p; }
      return null;
    }
    if (/\.(cmd|bat)$/i.test(p)) {
      if (isExecutableHealthy(p)) {
        const realExe = resolveExeFromShim(p);
        if (realExe && fs.existsSync(realExe)) { _systemClaudePath = realExe; return realExe; }
      }
      return null;
    }
    return null;
  };

  if (process.platform === 'win32') {
    const env = getEnvWithNodePath();
    // 1. npm 全局 prefix 下的 claude 可执行文件
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000, env }).trim();
      if (prefix) {
        for (const name of ['claude.exe', 'claude.cmd']) {
          if (tryPath(path.join(prefix, name))) return _systemClaudePath;
        }
      }
    } catch (_) {}

    // 2. PATH 上的 claude（cmd/bat 需要追到实际 exe）
    try {
      const lines = execSync('where claude', { encoding: 'utf8', timeout: 5000, env, windowsHide: true })
        .trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const p of lines) {
        if (tryPath(p)) return _systemClaudePath;
      }
    } catch (_) {}
  } else {
    try {
      const result = execSync('which claude', { encoding: 'utf8', timeout: 5000 }).trim();
      if (tryPath(result)) return _systemClaudePath;
    } catch (_) {}
  }

  _systemClaudePath = null;
  return null;
}

/** 懒加载 @anthropic-ai/claude-agent-sdk 模块，避免应用启动时阻塞 */
function loadClaudeAgentSdk() {
  if (!sdkModulePromise) {
    sdkModulePromise = import('@anthropic-ai/claude-agent-sdk');
  }
  return sdkModulePromise;
}

function resetSystemClaudeCache() {
  _systemClaudePath = undefined;
}

function resetClaudeSdkPromise() {
  sdkModulePromise = null;
}

function buildSystemClaudeEnv(extraEnv = {}) {
  return augmentEnvWithBundledRg({ ...process.env, ...extraEnv });
}

/** 注入 conf 引用（由 setupClaudeHandlers 调用，供 findSystemClaude 使用） */
function setClaudeConfRef(ref) {
  _claudeConfRef = ref;
}

// ---- install guard ----

function isInstallingClaudeCode() {
  return installingClaudeCode;
}

function setInstallingClaudeCode(v) {
  installingClaudeCode = Boolean(v);
}

module.exports = {
  getEnvWithNodePath,
  findSystemClaude,
  loadClaudeAgentSdk,
  resetSystemClaudeCache,
  resetClaudeSdkPromise,
  buildSystemClaudeEnv,
  setClaudeConfRef,
  isInstallingClaudeCode,
  setInstallingClaudeCode,
};
