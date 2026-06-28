'use strict';

/**
 * CodeX Environment — SDK loading, global binary path discovery.
 *
 * Extracted from codexAgent.js (Phase 5 leaf-module split).
 * Manages internal mutable caches (_globalCodexPath, codexModulePromise).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---- Internal mutable state ----

let codexModulePromise = null;
let installingCodex = false;

/** Cached global codex binary path (null = not found, undefined = not yet probed) */
let _globalCodexPath = undefined;

// ---- Public API ----

/** 打包后 SDK 的 createRequire 从 asar 内出发，搜不到全局安装的 codex。
 *  手动查找全局 codex 二进制路径，通过 codexPathOverride 传给 SDK。
 *  开发模式或未找到时返回 null，SDK 走自身 findCodexPath()。 */
function findGlobalCodexPath() {
  if (_globalCodexPath !== undefined) return _globalCodexPath;

  try {
    const tripleMap = { win32: 'pc-windows-msvc', darwin: 'apple-darwin', linux: 'unknown-linux-musl' };
    const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
    const triple = `${arch}-${tripleMap[process.platform] || 'unknown-linux-musl'}`;
    const suffixByTriple = {
      'x86_64-pc-windows-msvc': 'win32-x64', 'aarch64-pc-windows-msvc': 'win32-arm64',
      'x86_64-apple-darwin': 'darwin-x64', 'aarch64-apple-darwin': 'darwin-arm64',
      'x86_64-unknown-linux-musl': 'linux-x64', 'aarch64-unknown-linux-musl': 'linux-arm64',
    };
    const suffix = suffixByTriple[triple];
    if (suffix) {
      const binName = process.platform === 'win32' ? 'codex.exe' : 'codex';
      const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
      if (globalRoot) {
        const candidates = [
          path.join(globalRoot, '@openai', 'codex', 'node_modules', `@openai/codex-${suffix}`, 'vendor', triple, 'bin', binName),
          path.join(globalRoot, `@openai/codex-${suffix}`, 'vendor', triple, 'bin', binName),
        ];
        for (const p of candidates) {
          if (fs.existsSync(p)) { _globalCodexPath = p; return p; }
        }
      }
    }
  } catch (_) { /* npm 不可用，尝试下一级 fallback */ }

  // Fallback: 通过 where/which 在 PATH 中查找 codex（Windows 可能返回 .cmd shim）
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whichCmd} codex`, { encoding: 'utf8', timeout: 5000 }).trim();
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) { _globalCodexPath = lines[0]; return _globalCodexPath; }
  } catch (_) {}

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
}

// ---- install guard (mutable flag shared with install handler) ----

function isInstallingCodex() {
  return installingCodex;
}

function setInstallingCodex(v) {
  installingCodex = Boolean(v);
}

module.exports = {
  findGlobalCodexPath,
  loadCodexSdk,
  resetCodexSdkPromise,
  clearGlobalCodexPathCache,
  isInstallingCodex,
  setInstallingCodex,
};
