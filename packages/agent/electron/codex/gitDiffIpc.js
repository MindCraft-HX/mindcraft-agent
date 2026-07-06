'use strict';

const { CODEX_CHANNELS } = require('../../shared/ipcChannels');

/**
 * CodeX git diff IPC handler — runs git diff/diff-index on a working directory,
 * including untracked file diffs via parallel `git diff --no-index` workers.
 *
 * Extracted from codexAgent.js (R09 main handler setup split).
 */

const path = require('path');
const { execFile } = require('child_process');

function execFileAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function registerGitDiffIpc(ipcMain) {
  ipcMain.handle(CODEX_CHANNELS.RUN_GIT_DIFF, async (_, { cwd } = {}) => {
    const resolvedCwd = path.resolve(cwd || process.cwd());
    try {
      // 检查是否在 git 仓库内
      try {
        await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
          cwd: resolvedCwd,
          timeout: 5000,
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (_) {
        return { isGitRepo: false, diff: '' };
      }
      // 已跟踪文件的 diff（无颜色，HTML 无法渲染 ANSI escape codes）
      let tracked = '';
      try {
        const result = await execFileAsync('git', ['diff', '--no-color'], {
          cwd: resolvedCwd,
          timeout: 15000,
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 20 * 1024 * 1024,
        });
        tracked = result.stdout || '';
      } catch (e) {
        // git diff 返回 1 表示有差异（正常情况）
        if (e.stdout) tracked = typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8');
      }
      // 未跟踪文件列表
      let untrackedFiles = '';
      try {
        const result = await execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], {
          cwd: resolvedCwd,
          timeout: 5000,
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 5 * 1024 * 1024,
        });
        untrackedFiles = result.stdout || '';
      } catch (_) {}
      let untrackedDiff = '';
      if (untrackedFiles.trim()) {
        const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
        const files = untrackedFiles.split('\n').map(s => s.trim()).filter(Boolean);
        const concurrency = 4;
        let nextIndex = 0;
        const worker = async () => {
          let chunk = '';
          while (nextIndex < files.length) {
            const file = files[nextIndex++];
            try {
              const result = await execFileAsync('git', ['diff', '--no-index', '--no-color', '--', nullDevice, file], {
                cwd: resolvedCwd,
                timeout: 10000,
                encoding: 'utf8',
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                maxBuffer: 10 * 1024 * 1024,
              });
              chunk += result.stdout || '';
            } catch (e) {
              if (e.stdout) chunk += typeof e.stdout === 'string' ? e.stdout : e.stdout.toString('utf8');
            }
          }
          return chunk;
        };
        const chunks = await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
        untrackedDiff = chunks.join('');
      }
      return { isGitRepo: true, diff: (tracked + untrackedDiff).trim() };
    } catch (e) {
      return { isGitRepo: false, diff: '', error: e.message };
    }
  });
}

module.exports = { registerGitDiffIpc };
