'use strict';

/**
 * Right-click context menu — copy/cut/paste/undo/redo + save/copy image.
 *
 * Extracted from electron/main.js (Phase 7 main.js split).
 */

const { Menu, MenuItem, dialog, clipboard } = require('electron');
const fs = require('fs');

function registerContextMenu(win, fetchImage) {
  win.webContents.on('context-menu', async (e, params) => {
    const contextMenu = new Menu();

    // Standard copy/cut/paste — skip "copy" on images (use "copy image" below)
    if (params.mediaType !== 'image') {
      contextMenu.append(
        new MenuItem({ label: '复制', role: 'copy', accelerator: 'CmdOrCtrl+C' })
      );
    }
    if (params.isEditable) {
      contextMenu.append(
        new MenuItem({ label: '剪切', role: 'cut', accelerator: 'CmdOrCtrl+X' })
      );
      contextMenu.append(
        new MenuItem({
          label: '粘贴',
          role: 'paste',
          accelerator: 'CmdOrCtrl+V',
        })
      );
      contextMenu.append(
        new MenuItem({
          label: '撤销',
          role: 'undo',
          accelerator: 'CmdOrCtrl+Z',
        })
      );
      contextMenu.append(
        new MenuItem({
          label: '重做',
          role: 'redo',
          accelerator: 'CmdOrCtrl+Y',
        })
      );
      contextMenu.append(new MenuItem({ type: 'separator' }));
    }

    // Image-specific: save + copy image
    if (params.mediaType === 'image') {
      contextMenu.append(
        new MenuItem({
          label: '保存图片',
          click: async () => {
            const imageUrl = params.srcURL;
            const image = await fetchImage(imageUrl);
            if (image) {
              const { filePath } = await dialog.showSaveDialog(win, {
                title: '保存图片',
                defaultPath: 'image.png',
                filters: [
                  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
                ],
              });
              if (filePath) {
                fs.writeFileSync(filePath, image.toPNG());
              }
            }
          },
        })
      );

      contextMenu.append(
        new MenuItem({
          label: '复制图片',
          click: async () => {
            const imageUrl = params.srcURL;
            const image = await fetchImage(imageUrl);
            if (image) {
              clipboard.writeImage(image);
            }
          },
        })
      );
    }

    // Show menu
    contextMenu.popup(win, params.x, params.y);
  });
}

module.exports = { registerContextMenu };
