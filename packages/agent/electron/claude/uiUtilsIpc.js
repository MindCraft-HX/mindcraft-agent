'use strict';

const { CLAUDE_CHANNELS } = require('../../shared/ipcChannels');

/**
 * Claude UI utility IPC handlers — directory picker, clipboard, file listing.
 *
 * Extracted from claudeAgent.js (R09 main handler setup split).
 */

function registerUiUtilsIpc(ipcMain) {
  ipcMain.handle(CLAUDE_CHANNELS.SELECT_DIRECTORY, async (event) => {
    const { BrowserWindow, dialog } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(CLAUDE_CHANNELS.WRITE_CLIPBOARD, (_, text) => {
    require('electron').clipboard.writeText(text || '');
  });

  ipcMain.handle(CLAUDE_CHANNELS.LIST_FILES, async (_, { cwd, query }) => {
    const fs = require('fs');
    const p = require('path');
    try {
      let base, prefix;
      if (query.endsWith('/') || query.endsWith('\\')) {
        base = p.join(cwd, query);
        prefix = '';
      } else if (query.includes('/') || query.includes('\\')) {
        base = p.join(cwd, p.dirname(query));
        prefix = p.basename(query).toLowerCase();
      } else {
        base = cwd;
        prefix = query.toLowerCase();
      }
      const entries = fs.readdirSync(base, { withFileTypes: true });
      const matched = entries.filter(e => e.name.toLowerCase().startsWith(prefix));
      matched.sort((a, b) => {
        const aHidden = a.name.startsWith('.');
        const bHidden = b.name.startsWith('.');
        if (aHidden !== bHidden) return aHidden ? 1 : -1;
        const aDir = a.isDirectory();
        const bDir = b.isDirectory();
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return matched
        .slice(0, 10)
        .map(e => {
          const rel = p.relative(cwd, p.join(base, e.name)).replace(/\\/g, '/');
          return e.isDirectory() ? rel + '/' : rel;
        });
    } catch { return []; }
  });
}

module.exports = { registerUiUtilsIpc };
