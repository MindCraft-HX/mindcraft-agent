'use strict';

/**
 * CodeX 环境模块：负责 SDK 加载与全局二进制路径探测。
 *
 * 从 codexAgent.js 中拆出（Phase 5 叶子模块拆分）。
 * 维护内部可变缓存（_globalCodexPath、codexModulePromise）。
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getEnvWithNodePath, getFullEnv, resolveLoginShellPath, getCommonGlobalBinDirs } = require('../shared/shellPathHelper');

// ---- 内部可变状态 ----

let codexModulePromise = null;
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

// ---- 对外 API ----

/** 打包后 SDK 的 createRequire 从 asar 内出发，搜不到全局安装的 codex。
 *  手动查找全局 codex 二进制路径，通过 codexPathOverride 传给 SDK。
 *  不缓存结果，每次调用重新扫描，确保安装后能立即检测到。 */
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

  const suffixByTriple = {
    'x86_64-pc-windows-msvc': 'win32-x64', 'aarch64-pc-windows-msvc': 'win32-arm64',
    'x86_64-apple-darwin': 'darwin-x64', 'aarch64-apple-darwin': 'darwin-arm64',
    'x86_64-unknown-linux-musl': 'linux-x64', 'aarch64-unknown-linux-musl': 'linux-arm64',
  };
  const tripleMap = { win32: 'pc-windows-msvc', darwin: 'apple-darwin', linux: 'unknown-linux-musl' };
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'aarch64' : process.arch;
  const triple = `${arch}-${tripleMap[process.platform] || 'unknown-linux-musl'}`;
  const suffix = suffixByTriple[triple];
  if (!suffix) return null;

  const binName = process.platform === 'win32' ? 'codex.exe' : 'codex';

  /** 在指定根目录下查找 codex 二进制 */
  const tryRoot = (root) => {
    if (!root || !fs.existsSync(root)) return null;
    const candidates = [
      path.join(root, '@openai', 'codex', 'node_modules', `@openai/codex-${suffix}`, 'vendor', triple, 'bin', binName),
      path.join(root, `@openai/codex-${suffix}`, 'vendor', triple, 'bin', binName),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  };

  if (process.platform === 'darwin') {
    const macCandidates = [
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
    ];
    for (const candidate of macCandidates) {
      if (isExecutableHealthy(candidate)) {
        _globalCodexPath = candidate;
        return candidate;
      }
    }
    // macOS: 使用完整环境（含 nvm/Homebrew 等）探测，避免 Electron 打包后 PATH 残缺
    const fullEnv = getFullEnv();
    try {
      const direct = execSync('which codex', { encoding: 'utf8', timeout: 5000, env: fullEnv }).trim();
      if (direct && isExecutableHealthy(direct, fullEnv)) {
        _globalCodexPath = direct;
        return direct;
      }
    } catch (_) {}
    try {
      const loginPath = resolveLoginShellPath();
      if (loginPath) {
        const loginEnv = { ...process.env, PATH: loginPath, Path: loginPath };
        const direct = execSync('which codex', {
          encoding: 'utf8',
          timeout: 5000,
          env: loginEnv,
        }).trim();
        if (direct && isExecutableHealthy(direct, loginEnv)) {
          _globalCodexPath = direct;
          return direct;
        }
      }
    } catch (_) {}
  }

  // 1. npm root -g（标准 npm 安装）
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
    const found = tryRoot(globalRoot);
    if (found) {
      _globalCodexPath = found;
      return found;
    }
  } catch (_) {
    // npm 可能不在 PATH 上（打包后场景）
  }

  // 2. 使用 getEnvWithNodePath 增强 PATH 后重试
  try {
    const env = getEnvWithNodePath();
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 5000, env }).trim();
    const found = tryRoot(globalRoot);
    if (found) {
      _globalCodexPath = found;
      return found;
    }
  } catch (_) {}

  // 3. 用 login-shell PATH 重试
  try {
    const loginPath = resolveLoginShellPath();
    if (loginPath) {
      const env = { ...process.env, PATH: loginPath, Path: loginPath };
      const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 5000, env }).trim();
      const found = tryRoot(globalRoot);
      if (found) {
        _globalCodexPath = found;
        return found;
      }
    }
  } catch (_) {}

  // 4. 直接检查已知的 npm global root 目录
  const commonRoots = getCommonGlobalBinDirs().filter(d => d.includes('node_modules'));
  for (const root of commonRoots) {
    const found = tryRoot(root);
    if (found) {
      _globalCodexPath = found;
      return found;
    }
  }

  _globalCodexPath = null;
  return null;
}

/** 懒加载 @openai/codex-sdk 模块，避免应用启动时阻塞 */
function loadCodexSdk() {
  if (!codexModulePromise) {
    codexModulePromise = import('@openai/codex-sdk');
  }
  return codexModulePromise;
}

/** 重置 SDK 模块缓存（用于 resetCodexSdkRuntime 等场景） */
function resetCodexSdkPromise() {
  codexModulePromise = null;
}

/** 重置全局路径缓存（主要用于测试） */
function clearGlobalCodexPathCache() {
  _globalCodexPath = undefined;
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
  getConfiguredCodexPath,
  isExecutableHealthy,
  loadCodexSdk,
  resetCodexSdkPromise,
  clearGlobalCodexPathCache,
  setCodexConfRef,
  isInstallingCodex,
  setInstallingCodex,
};
