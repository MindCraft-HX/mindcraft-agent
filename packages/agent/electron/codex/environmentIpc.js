'use strict';

/**
 * CodeX environment check / install / directory IPC handlers.
 *
 * Extracted from codexAgent.js (R09 main handler setup split).
 */

const { exec, execFile, execSync } = require('child_process');
const { dialog } = require('electron');

function registerEnvironmentIpc(ipcMain, {
  loadCodexSdk,
  findGlobalCodexPath,
  isInstallingCodex,
  setInstallingCodex,
  resetCodexSdkPromise,
  lt,
}) {
  ipcMain.handle('codex-check-environment', async () => {
    const result = { node: null, npm: null, codex: null };
    try {
      const ver = (await new Promise((resolve, reject) => {
        exec('node --version', { encoding: 'utf8', timeout: 5000, windowsHide: true }, (err, stdout) => {
          if (err) reject(err); else resolve(stdout);
        });
      })).trim();
      const match = ver.match(/^v(\d+)\./);
      const major = match ? parseInt(match[1], 10) : 0;
      result.node = { installed: true, version: ver, compatible: major >= 18 };
    } catch (_) { result.node = { installed: false, version: null, compatible: false }; }
    try {
      const ver = (await new Promise((resolve, reject) => {
        exec('npm --version', { encoding: 'utf8', timeout: 5000, windowsHide: true }, (err, stdout) => {
          if (err) reject(err); else resolve(stdout);
        });
      })).trim();
      result.npm = { installed: true, version: ver };
    } catch (_) { result.npm = { installed: false, version: null }; }
    try {
      const { Codex } = await loadCodexSdk();
      const c = new Codex({ codexPathOverride: findGlobalCodexPath() });
      const codexPath = c.exec?.executablePath || null;
      let codexVersion = null;
      try {
        const output = await new Promise((resolve, reject) => {
          exec('npm list -g @openai/codex --depth=0', { encoding: 'utf8', timeout: 10000, windowsHide: true }, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          });
        });
        const match = output.match(/@openai\/codex@(\S+)/);
        if (match) codexVersion = match[1];
      } catch (_) {}
      if (!codexVersion && codexPath) {
        try {
          const isCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(codexPath);
          const cmd = isCmdShim ? 'cmd.exe' : codexPath;
          const args = isCmdShim ? ['/c', codexPath, '--version'] : ['--version'];
          codexVersion = (await new Promise((resolve, reject) => {
            execFile(cmd, args, {
              encoding: 'utf8', timeout: 5000, windowsHide: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            }, (err, stdout) => {
              if (err) reject(err); else resolve(stdout);
            });
          })).trim();
        } catch (_) {}
      }
      result.codex = { installed: !!codexPath, path: codexPath, version: codexVersion };
    } catch (_) { result.codex = { installed: false, path: null, version: null }; }
    return result;
  });

  ipcMain.handle('codex-check-latest-version', async () => {
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

  ipcMain.handle('codex-install-codex', async () => {
    if (isInstallingCodex()) return { success: false, message: lt('install.inProgress') };
    setInstallingCodex(true);
    try {
      try { execSync('taskkill /IM codex.exe /F', { encoding: 'utf8', timeout: 5000, windowsHide: true }); } catch (_) {}
      await new Promise((resolve, reject) => {
        exec('npm install -g @openai/codex', { encoding: 'utf8', timeout: 180000, stdio: 'pipe', windowsHide: true }, (err, stdout, stderr) => {
          if (err) reject(Object.assign(err, { stdout, stderr }));
          else resolve(stdout);
        });
      });
      Object.keys(require.cache).forEach((k) => {
        if (k.includes('codex-sdk')) delete require.cache[k];
      });
      resetCodexSdkPromise();
      return { success: true };
    } catch (e) {
      return { success: false, message: e?.stderr || e?.message || String(e) };
    } finally {
      setInstallingCodex(false);
    }
  });

  ipcMain.handle('codex-select-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}

module.exports = { registerEnvironmentIpc };
