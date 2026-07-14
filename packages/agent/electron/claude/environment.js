'use strict';

/**
 * ClaudeCode 环境 — SDK 加载、系统二进制发现、环境变量辅助。
 *
 * 从 claudeAgent.js 提取（Phase 5 叶子模块拆分）。
 * 管理内部可变缓存（_systemClaudePath, sdkModulePromise）。
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const { augmentEnvWithBundledRg } = require('../localSearch');
const { getEnvWithNodePath, resolveLoginShellPath, getCommonGlobalBinDirs } = require('../shared/shellPathHelper');

// ---- Internal mutable state ----

let sdkModulePromise = null;
let _systemClaudePath = undefined;
let installingClaudeCode = false;
let _claudeConfRef = null; // 由 setupClaudeHandlers 注入
/** 构建包含系统 Node.js 路径的 env 对象（打包后 PATH 可能缺失 node/npm） */
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
    // macOS/Linux: 可执行文件无扩展名（如 claude Mach-O binary）
    if (isExecutableHealthy(p)) { _systemClaudePath = p; return p; }
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
    } catch (_) {
      // 打包后 shell profile 不加载，`which` 找不到 claude，降级到 login shell PATH 和已知目录
    }
    // Fallback A: 通过 login shell 获取完整 PATH 重试
    try {
      const loginPath = resolveLoginShellPath();
      if (loginPath) {
        const result = execSync('which claude', { encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: loginPath } }).trim();
        if (tryPath(result)) return _systemClaudePath;
      }
    } catch (_) {}
    // Fallback B: 遍历常见安装目录（Homebrew / npm prefix / nvm / fnm / volta 等，由 getCommonGlobalBinDirs 填充）
    const commonBinDirs = getCommonGlobalBinDirs();
    for (const dir of commonBinDirs) {
      if (tryPath(path.join(dir, 'claude'))) return _systemClaudePath;
    }
    // Fallback C: 直接查 npm 全局安装的真实路径（符号链接缺失时兜底）
    const moduleDirs = commonBinDirs.filter(d => d.includes('node_modules') && !d.endsWith('bin'));
    for (const dir of moduleDirs) {
      if (tryPath(path.join(dir, '@anthropic-ai', 'claude-code', 'bin', 'claude'))) return _systemClaudePath;
    }
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
