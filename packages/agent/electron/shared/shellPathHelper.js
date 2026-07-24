/**
 * Shell PATH 辅助 — 打包后 shell profile 不加载，此处补齐完整 PATH。
 *
 * ClaudeCode（findSystemClaude）和 CodeX（findGlobalCodexPath）共用。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// login shell PATH 与 npm prefix 在进程生命周期内视为不变，进程级缓存避免每次
// getFullEnv() 都 execSync 冻结主进程事件循环。
let _loginShellPathCache;
let _npmPrefixCache;

/**
 * 构建包含 Node.js/npm 路径的 env 对象。
 * 打包后 process.env.PATH 可能缺失 node/npm 所在目录，此处按平台补齐。
 */
function getEnvWithNodePath() {
  const env = { ...process.env };
  const nodeDirs = [path.dirname(process.execPath)];
  if (process.platform === 'win32') {
    nodeDirs.push('C:\\Program Files\\nodejs');
    nodeDirs.push(path.join(os.homedir(), 'AppData', 'Roaming', 'npm'));
  } else {
    // macOS/Linux: 常见 node/npm 安装位置
    nodeDirs.push('/opt/homebrew/bin');
    nodeDirs.push('/usr/local/bin');
    nodeDirs.push('/opt/homebrew/sbin');
    nodeDirs.push('/usr/local/sbin');
    // 打包后 process.execPath 是 Electron 路径，不是 node 路径，
    // 直接扫描 nvm 作为降级
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
    const nvmNodeDir = path.join(nvmDir, 'versions', 'node');
    if (fs.existsSync(nvmNodeDir)) {
      try {
        const versions = fs.readdirSync(nvmNodeDir);
        if (versions.length > 0) {
          const latest = versions.sort().reverse()[0];
          nodeDirs.push(path.join(nvmNodeDir, latest, 'bin'));
        }
      } catch (_) {}
    }
  }
  const existingPaths = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const merged = [...nodeDirs, ...existingPaths];
  const uniquePaths = [...new Set(merged)];
  env.PATH = uniquePaths.join(path.delimiter);
  env.Path = env.PATH;
  return env;
}

/**
 * 通过 login shell 获取用户的完整 PATH。
 * 这是最可靠的方式，因为会加载 .zprofile / .zshrc / .bash_profile。
 *
 * 失败时降级为解析 profile 文件提取 PATH。
 *
 * @returns {string|null} 扩展后的 PATH 字符串，失败返回 null。
 */
function resolveLoginShellPath() {
  if (_loginShellPathCache !== undefined) return _loginShellPathCache;
  const result = resolveLoginShellPathUncached();
  _loginShellPathCache = result;
  return result;
}

function getNpmGlobalPrefix() {
  if (_npmPrefixCache !== undefined) return _npmPrefixCache;
  let prefix = null;
  try {
    const out = execSync('npm config get prefix', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    prefix = out || null;
  } catch (_) {}
  _npmPrefixCache = prefix;
  return prefix;
}

function resolveLoginShellPathUncached() {
  // 1. 直接 ask login shell
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  try {
    const out = execSync(`${shell} -l -c 'echo "$PATH"'`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out && out.length > 10) return out;
  } catch (_) { /* shell 可能不支持 -l 参数 */ }

  // 2. 降级：解析 profile 文件中的 PATH 导出
  const profileCandidates = [
    path.join(os.homedir(), '.zshrc'),
    path.join(os.homedir(), '.zprofile'),
    path.join(os.homedir(), '.bash_profile'),
    path.join(os.homedir(), '.bashrc'),
    path.join(os.homedir(), '.profile'),
  ];

  const extraDirs = new Set();
  for (const profilePath of profileCandidates) {
    if (!fs.existsSync(profilePath)) continue;
    try {
      const content = fs.readFileSync(profilePath, 'utf8');
      // 匹配 export PATH="..." 或 PATH="..." 等模式
      const pathLines = content.split('\n').filter(l =>
        /^[\s]*(export\s+)?PATH\s*=/.test(l) && !/^\s*#/.test(l)
      );
      for (const line of pathLines) {
        // 提取 = 后面的值（处理引号和变量引用）
        const match = line.match(/PATH\s*=\s*["']?([^"'\n#]+)["']?/);
        if (!match) continue;
        const val = match[1].replace(/\$\{?HOME\}?/g, os.homedir())
          .replace(/\$\{?PATH\}?\$?/g, '')
          .replace(/\$\{?\w+\}?/g, '') // 去掉其他变量引用
          .trim();
        val.split(':').forEach(d => {
          const trimmed = d.trim();
          if (trimmed && fs.existsSync(trimmed)) extraDirs.add(trimmed);
        });
      }
    } catch (_) { /* 跳过不可读的 profile 文件 */ }
  }

  // 3. 降级：直接扫描 nvm 目录结构（打包后 login shell 可能不可用）
  if (extraDirs.size === 0) {
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
    const nvmNodeDir = path.join(nvmDir, 'versions', 'node');
    if (fs.existsSync(nvmNodeDir)) {
      try {
        const versions = fs.readdirSync(nvmNodeDir);
        if (versions.length > 0) {
          const latest = versions.sort().reverse()[0];
          const nodeBin = path.join(nvmNodeDir, latest, 'bin');
          if (fs.existsSync(nodeBin)) extraDirs.add(nodeBin);
        }
      } catch (_) {}
    }
  }

  if (extraDirs.size > 0) {
    return [...extraDirs, process.env.PATH || ''].join(':');
  }

  return null;
}

/**
 * macOS/Linux 上全局 npm 二进制的常见安装目录。
 * 作为 PATH 缺失时的兜底列表。
 */
function getCommonGlobalBinDirs() {
  const dirs = [];

  // Homebrew（Apple Silicon）
  dirs.push('/opt/homebrew/bin');
  dirs.push('/opt/homebrew/sbin');
  // Homebrew（Intel）
  dirs.push('/usr/local/bin');
  dirs.push('/usr/local/sbin');

  // npm 全局 prefix
  try {
    const prefix = getNpmGlobalPrefix();
    if (prefix) {
      dirs.push(path.join(prefix, 'bin'));
      dirs.push(path.join(prefix, 'lib', 'node_modules'));
    }
  } catch (_) {}

  // 常见 npm 全局根目录
  dirs.push('/opt/homebrew/lib/node_modules');
  dirs.push('/usr/local/lib/node_modules');
  dirs.push(path.join(os.homedir(), '.npm-global', 'lib', 'node_modules'));
  dirs.push(path.join(os.homedir(), '.npm-global', 'bin'));
  dirs.push(path.join(os.homedir(), '.local', 'bin'));

  // nvm 风格的 node 安装
  const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
  if (fs.existsSync(nvmDir)) {
    try {
      const versions = fs.readdirSync(path.join(nvmDir, 'versions', 'node'));
      if (versions.length > 0) {
        const latest = versions.sort().reverse()[0];
        dirs.push(path.join(nvmDir, 'versions', 'node', latest, 'bin'));
        dirs.push(path.join(nvmDir, 'versions', 'node', latest, 'lib', 'node_modules'));
      }
    } catch (_) {}
  }

  // 其他 node 版本管理器（fnm, volta）
  const fnmPath = path.join(os.homedir(), '.fnm', 'current', 'bin');
  if (fs.existsSync(fnmPath)) dirs.push(fnmPath);
  const voltaPath = path.join(os.homedir(), '.volta', 'bin');
  if (fs.existsSync(voltaPath)) dirs.push(voltaPath);

  return dirs.filter((d, i, a) => d && a.indexOf(d) === i); // 去重
}

/**
 * 合并 getEnvWithNodePath + login shell PATH + 已知 node/npm 安装目录的完整 env。
 * 打包后 node/npm/claude/codex 检测统一用这个。
 */
function getFullEnv() {
  const env = getEnvWithNodePath();
  const extraDirs = [];
  // 1. login shell PATH 中的额外目录
  try {
    const loginPath = resolveLoginShellPath();
    if (loginPath) {
      for (const d of loginPath.split(path.delimiter)) {
        const trimmed = d.trim();
        if (trimmed) extraDirs.push(trimmed);
      }
    }
  } catch (_) {}
  // 2. 已知的全局工具安装目录（nvm / fnm / volta / .npm-global 等）
  extraDirs.push(...getCommonGlobalBinDirs());
  if (extraDirs.length > 0) {
    const merged = [...new Set([...env.PATH.split(path.delimiter), ...extraDirs])];
    env.PATH = merged.join(path.delimiter);
    env.Path = env.PATH;
  }
  return env;
}

module.exports = {
  getEnvWithNodePath,
  getFullEnv,
  resolveLoginShellPath,
  getCommonGlobalBinDirs,
};
