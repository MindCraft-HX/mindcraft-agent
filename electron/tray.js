'use strict';

/**
 * System tray — create, configure, handle clicks.
 *
 * Extracted from electron/main.js (Phase 7 main.js split).
 */

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { CORE_CHANNELS } = require('../packages/agent/shared/ipcChannels');

function createTray(win, iconDir) {
  const iconPath = path.join(iconDir, '../dist/logo-white.png');
  let tray;

  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(iconPath);
    const resizedImage = image.resize({ width: 18, height: 18 });
    tray = new Tray(resizedImage);
  } else {
    tray = new Tray(iconPath);
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开', click: () => win.show() },
    {
      label: '设置',
      click: () => {
        win.show();
        setTimeout(() => {
          win.webContents.send(CORE_CHANNELS.OPEN_TAB_BY_NAME, { type: 'settings' });
        }, 0);
      },
    },
    { label: '退出', click: () => require('electron').app.exit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('MindCraft-Agent');
  tray.on('click', () => {
    win.show();
  });

  return tray;
}

module.exports = { createTray };
