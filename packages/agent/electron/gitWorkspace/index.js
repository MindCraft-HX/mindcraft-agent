'use strict';

/**
 * Git workspace IPC registration for main process.
 *
 * Registers two core channels:
 *   - GIT_WORKSPACE_CHANGES  → getWorkspaceChanges(cwd)
 *   - GIT_FILE_DIFF          → getFileDiff(cwd, relativePath, changeKind)
 *
 * Ownership:
 *   - gitWorkspace/index — thin IPC registration layer
 *   - gitWorkspaceService  — business logic (called by handlers)
 *   - No provider dependency (ClaudeCode/CodeX agnostic)
 *   - Registered in agent/electron/index.js:registerAgentIPCs()
 */

const { ipcMain } = require('electron');
const { CORE_CHANNELS } = require('../../shared/ipcChannels');
const { getWorkspaceChanges, getFileDiff, ERROR_CODES } = require('./gitWorkspaceService');

/**
 * Register git workspace IPC handlers on the given ipcMain instance.
 *
 * @param {Electron.IpcMain} targetIpcMain — ipcMain or sandboxed instance
 */
function registerGitWorkspaceIpc(targetIpcMain = ipcMain) {
  // ── Workspace changes (lightweight file list) ──

  targetIpcMain.handle(CORE_CHANNELS.GIT_WORKSPACE_CHANGES, async (_event, { cwd }) => {
    // Input validation
    if (!cwd || typeof cwd !== 'string') {
      return {
        isGitRepo: false,
        repoRoot: '',
        branch: '',
        entries: [],
        summary: { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 },
        errorCode: ERROR_CODES.NO_CWD,
      };
    }

    try {
      return await getWorkspaceChanges(cwd);
    } catch (err) {
      return {
        isGitRepo: false,
        repoRoot: '',
        branch: '',
        entries: [],
        summary: { staged: 0, unstaged: 0, untracked: 0, totalFiles: 0 },
        errorCode: ERROR_CODES.GIT_COMMAND_FAILED,
      };
    }
  });

  // ── Single file diff ──

  targetIpcMain.handle(CORE_CHANNELS.GIT_FILE_DIFF, async (_event, { cwd, relativePath, changeKind }) => {
    // Input validation
    if (!cwd || typeof cwd !== 'string') {
      return {
        relativePath: relativePath || '',
        changeKind: changeKind || 'unstaged',
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        truncatedAtLines: null,
        errorCode: ERROR_CODES.NO_CWD,
      };
    }

    if (!relativePath || typeof relativePath !== 'string') {
      return {
        relativePath: '',
        changeKind: changeKind || 'unstaged',
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        truncatedAtLines: null,
        errorCode: ERROR_CODES.INVALID_PATH,
      };
    }

    if (!['staged', 'unstaged', 'untracked'].includes(changeKind)) {
      return {
        relativePath,
        changeKind: changeKind || 'unstaged',
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        truncatedAtLines: null,
        errorCode: ERROR_CODES.INVALID_PATH,
      };
    }

    try {
      return await getFileDiff(cwd, relativePath, changeKind);
    } catch (err) {
      return {
        relativePath,
        changeKind,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        truncatedAtLines: null,
        errorCode: ERROR_CODES.GIT_COMMAND_FAILED,
      };
    }
  });
}

module.exports = { registerGitWorkspaceIpc };
