'use strict';

const { CODEX_CHANNELS } = require('../../shared/ipcChannels');

/**
 * CodeX 环境检测 / 安装 / 目录选择 IPC 处理。
 *
 * 从 codexAgent.js 提取（R09 主处理器拆分）。
 */

const { exec, execFile } = require('child_process');
const { dialog } = require('electron');
const { getFullEnv } = require('../shared/shellPathHelper');
const { getCodexCliCapabilities } = require('./cliCapabilities');

function registerEnvironmentIpc(ipcMain, {
  findGlobalCodexPath,
  findGlobalCodexPathAsync,
  getConfiguredExecutablePath,
  isExecutableHealthy,
  isExecutableHealthyAsync,
  clearGlobalCodexPathCache,
  isInstallingCodex,
  setInstallingCodex,
  hasActiveCodexRuns,
  lt,
}) {
  ipcMain.handle(CODEX_CHANNELS.CHECK_ENVIRONMENT, async (_, forceRefresh = false) => {
    // 三项检测并行；健康检查走异步版本，避免 execFileSync 冻结主进程。
    // 路径缓存默认复用，仅用户点“重新检测”时强制重新探测。
    const checkNode = async () => {
      try {
        const env = getFullEnv();
        const ver = (await new Promise((resolve, reject) => {
          exec('node --version', { encoding: 'utf8', timeout: 5000, windowsHide: true, env }, (err, stdout) => {
            if (err) reject(err); else resolve(stdout);
          });
        })).trim();
        const match = ver.match(/^v(\d+)\./);
        const major = match ? parseInt(match[1], 10) : 0;
        return { installed: true, version: ver, compatible: major >= 18 };
      } catch (_) { return { installed: false, version: null, compatible: false }; }
    };
    const checkNpm = async () => {
      try {
        const env = getFullEnv();
        const ver = (await new Promise((resolve, reject) => {
          exec('npm --version', { encoding: 'utf8', timeout: 5000, windowsHide: true, env }, (err, stdout) => {
            if (err) reject(err); else resolve(stdout);
          });
        })).trim();
        return { installed: true, version: ver };
      } catch (_) { return { installed: false, version: null }; }
    };
    const checkCodex = async () => {
      try {
        const fullEnv = getFullEnv();
        if (forceRefresh && typeof clearGlobalCodexPathCache === 'function') clearGlobalCodexPathCache();
        const configuredPath = typeof getConfiguredExecutablePath === 'function'
          ? String(getConfiguredExecutablePath() || '').trim()
          : '';
        const findAsync = typeof findGlobalCodexPathAsync === 'function' ? findGlobalCodexPathAsync : async () => findGlobalCodexPath();
        const detectedPath = (await findAsync()) || '';
        const codexPath = configuredPath || detectedPath || null;
        const healthyAsync = typeof isExecutableHealthyAsync === 'function'
          ? isExecutableHealthyAsync
          : async (p, env) => isExecutableHealthy(p, env);
        const installed = !!(codexPath && await healthyAsync(codexPath, fullEnv));

        let codexVersion = null;
        if (!codexVersion && codexPath) {
          try {
            const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath);
            const cmd = isCmdShim ? 'cmd.exe' : codexPath;
            const args = isCmdShim ? ['/c', codexPath, '--version'] : ['--version'];
            codexVersion = (await new Promise((resolve, reject) => {
              execFile(cmd, args, {
                encoding: 'utf8', timeout: 5000, windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: fullEnv,
              }, (err, stdout) => {
                if (err) reject(err); else resolve(stdout);
              });
            })).trim();
            // Normalize: "codex-cli 0.144.4" → "0.144.4"
            if (codexVersion) {
              const parts = codexVersion.split(/\s+/);
              const verToken = parts.find(p => /^v?\d/.test(p)) || parts[0];
              codexVersion = verToken.replace(/^v/, '').trim();
            }
          } catch (_) {}
        }
        let capability = null;
        if (installed && codexPath) {
          try { capability = await getCodexCliCapabilities(codexPath, { env: fullEnv }); } catch (_) {}
        }
        return {
          installed,
          path: codexPath,
          version: capability?.version || codexVersion,
          capabilities: capability?.capabilities || null,
          compatible: capability?.compatible ?? false,
        };
      } catch (_) {
        const configuredPath = typeof getConfiguredExecutablePath === 'function'
          ? String(getConfiguredExecutablePath() || '').trim()
          : '';
        const healthyAsync = typeof isExecutableHealthyAsync === 'function'
          ? isExecutableHealthyAsync
          : async (p, env) => isExecutableHealthy(p, env);
        return {
          installed: !!(configuredPath && await healthyAsync(configuredPath)),
          path: configuredPath || null,
          version: null,
        };
      }
    };
    const [node, npm, codex] = await Promise.all([checkNode(), checkNpm(), checkCodex()]);
    return { node, npm, codex };
  });

  ipcMain.handle(CODEX_CHANNELS.CHECK_LATEST_VERSION, async () => {
    try {
      const https = require('https');
      return new Promise((resolve) => {
        https.get('https://registry.npmmirror.com/@openai/codex/latest', (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve({ ok: true, version: json.version || null });
            } catch {
              resolve({ ok: false, error: lt('claude.parseFailed') });
            }
          });
        }).on('error', (e) => {
          resolve({ ok: false, error: e?.message || String(e) });
        });
      });
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle(CODEX_CHANNELS.INSTALL_CODEX, async () => {
    if (isInstallingCodex()) return { success: false, message: lt('install.inProgress') };
    if (typeof hasActiveCodexRuns === 'function' && hasActiveCodexRuns()) {
      return { success: false, message: 'End active Codex runs before updating the executable.' };
    }
    setInstallingCodex(true);
    try {
      const env = getFullEnv();
      await new Promise((resolve, reject) => {
        exec('npm install -g @openai/codex', { encoding: 'utf8', timeout: 180000, stdio: 'pipe', windowsHide: true, env }, (err, stdout, stderr) => {
          if (err) reject(Object.assign(err, { stdout, stderr }));
          else resolve(stdout);
        });
      });
      clearGlobalCodexPathCache();
      const installedPath = typeof getConfiguredExecutablePath === 'function'
        ? String(getConfiguredExecutablePath() || '').trim() || findGlobalCodexPath() || null
        : findGlobalCodexPath() || null;
      // 通过 npm list -g 直接读取实际安装版本（不依赖二进制发现，兜底旧版本显示问题）
      let installedVersion = null;
      try {
        const npmListOut = await new Promise((resolve, reject) => {
          exec('npm list -g @openai/codex --json --depth=0', {
            encoding: 'utf8', timeout: 10000, env,
          }, (err2, stdout2) => {
            if (err2) reject(err2); else resolve(stdout2);
          });
        });
        const parsed = JSON.parse(npmListOut.trim());
        installedVersion = parsed?.dependencies?.['@openai/codex']?.version || null;
      } catch (_) {}
      return { success: true, path: installedPath, version: installedVersion };
    } catch (e) {
      return { success: false, message: e?.stderr || e?.message || String(e) };
    } finally {
      setInstallingCodex(false);
    }
  });

  ipcMain.handle(CODEX_CHANNELS.SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}

module.exports = { registerEnvironmentIpc };
