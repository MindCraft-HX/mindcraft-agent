const { app, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const compressing = require("compressing");
const { exec } = require("child_process");
const { openMdInMain } = require('../mdRouting')
const { openDocumentCandidate, resolveCandidatePath } = require('./documentLocator')
const { CORE_CHANNELS } = require('../../packages/agent/shared/ipcChannels');


function setupIpcHandlers(env, platform) {
  // 返回文件路径
  ipcMain.handle(CORE_CHANNELS.OPEN_FILE_DIALOG, async (event, option) => {
    const dialogOption = {
      properties: [option.type === "file" ? "openFile" : "openDirectory"],
      filters: option.filters || []
    };
    const result = await dialog.showOpenDialog(dialogOption);
    if (result.canceled) {
      return;
    } else {
      return result.filePaths[0]; // 返回选中文件或文件夹的路径
    }
  });
  // 选择路径并读取文件
  ipcMain.handle(CORE_CHANNELS.SELECT_AND_READ_FILE,async (event,options)=>{
    try{
      const dialogOption = {
        properties:options&&options.properties?(options.properties):(options.type==='file'?["openFile"]:["openDirectory"]),
        filters:options&&options.filters?options.filters:[],
      }
      const result = await dialog.showOpenDialog(dialogOption);
      if(result.canceled|| result.filePaths.length===0){
        return null
      }
      const filesInfo = [];
      for(const filePath of result.filePaths){
        const buffer = fs.readFileSync(filePath)
        const fileName = path.basename(filePath)
        const stats = fs.statSync(filePath)
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
        };
        const mineType =  mimeTypes[ext] || 'application/octet-stream';
        filesInfo.push({
          data:buffer,
          name:fileName,
          path:filePath,
          size:stats.size,
          type:mineType,
          lastModified: stats.mtime.getTime()
        });
      }
      return filesInfo;
    }catch(e){
      console.error('选择和读取文件出错:',error)
    }
  })
  ipcMain.handle(CORE_CHANNELS.READ_FILE_BY_PATH, async (event, filePath) => {
    try {
      if (!filePath) {
        return null;
      }
      // 验证文件是否存在
      if (!fs.existsSync(filePath)) {
        throw new Error('文件不存在');
      }
      const buffer = fs.readFileSync(filePath)
      const fileName = path.basename(filePath)
      const stats = fs.statSync(filePath)
      const ext = path.extname(fileName).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
      };
      const mineType = mimeTypes[ext] || 'application/octet-stream';
      return {
        data: buffer,
        name: fileName,
        path: filePath,
        size: stats.size,
        type: mineType,
        lastModified: stats.mtime.getTime()
      };
    } catch (e) {
      console.error('通过路径读取文件出错:', e);
      throw e;
    }
  })

  ipcMain.handle(CORE_CHANNELS.READ_FILE_SYNC, async (event, path) => {
    const fileContent = fs.readFileSync(path, "utf8");
    return fileContent;
  });

  ipcMain.handle(CORE_CHANNELS.WRITE_FILE_SYNC, async (event, path, data) => {
    fs.writeFileSync(path, data);
  });
  ipcMain.handle(CORE_CHANNELS.UNLINK_FILE_SYNC, async (event, path) => {
    fs.unlinkSync(path);
  });
  ipcMain.handle(CORE_CHANNELS.RMDIR_SYNC, async (event, folderPath) => {
    fs.rmdirSync(folderPath, { recursive: true });
  });
  ipcMain.handle(CORE_CHANNELS.EXISTS_FILE_SYNC, async (event, path) => {
    return fs.existsSync(path);
  });
  ipcMain.handle(CORE_CHANNELS.MKDIR_SYNC, async (event, path) => {
    fs.mkdirSync(path, { recursive: true });
  });
  ipcMain.handle(CORE_CHANNELS.COPY_FILE_SYNC, async (event, srcPath, targetPath) => {
    fs.copyFileSync(srcPath, targetPath);
  });
  ipcMain.handle(CORE_CHANNELS.RENAME_FILE_SYNC, async (event, oldPath, newPath) => {
    fs.renameSync(oldPath, newPath);
  });
  ipcMain.handle(CORE_CHANNELS.READ_DIR_SYNC, async (event, dir) => {
    return fs.readdirSync(dir, { withFileTypes: true });
  });
  ipcMain.handle(
    CORE_CHANNELS.UNCOMPRESS_ZIP_FILE,
    async (event, file, unZipPath, zipFileNameEncoding) => {
      return await compressing.zip.uncompress(file, unZipPath, {
        zipFileNameEncoding: zipFileNameEncoding,
      });
    }
  );

  // 通用命令执行
  ipcMain.handle(CORE_CHANNELS.EXEC_CMD, async (event, cmd, dir) => {
    return new Promise((resolve, reject) => {
      exec(cmd, { cwd: dir }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  });

  // 打开文件夹
  ipcMain.handle(CORE_CHANNELS.OPEN_FOLDER, async (event, folderPath) => {
    const err = await shell.openPath(folderPath);
    return { ok: !err, error: err || '' };
  });

  ipcMain.handle(CORE_CHANNELS.OPEN_FILE_WITH_DEFAULT, async (_event, filePath) => {
    if (!filePath) return "missing-file-path";
    return shell.openPath(filePath);
  });

  ipcMain.handle(CORE_CHANNELS.RESOLVE_DOCUMENT_CANDIDATE, async (_event, payload = {}) => {
    return resolveCandidatePath(payload)
  })

  ipcMain.handle(CORE_CHANNELS.OPEN_DOCUMENT_CANDIDATE, async (_event, payload = {}) => {
    return openDocumentCandidate({
      ...payload,
      openMdPayload: async (docPayload) => {
        openMdInMain(docPayload)
      },
      openWithDefault: async (filePath) => shell.openPath(filePath),
    })
  })
}

/**
 * Host-level IPC handlers — app version, login-item settings, system settings,
 * external URL opening. Extracted from electron/main.js (Phase 7 main.js split).
 */
function setupHostIpcHandlers() {
  // App version
  ipcMain.handle(CORE_CHANNELS.GET_APP_VERSION, () => app.getVersion());

  // Login item settings (auto-start on boot)
  ipcMain.handle('get-login-item-settings', () => {
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('set-login-item-settings', (_event, openAtLogin) => {
    app.setLoginItemSettings({ openAtLogin });
    return app.getLoginItemSettings().openAtLogin;
  });

  // Open OS system settings (privacy-microphone)
  ipcMain.on(CORE_CHANNELS.OPEN_SYSTEM_SETTINGS, () => {
    if (process.platform === 'win32') {
      exec('start ms-settings:privacy-microphone');
    } else if (process.platform === 'darwin') {
      exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"');
    } else if (process.platform === 'linux') {
      exec('gnome-control-center privacy');
    }
  });

  // Open external HTTP/HTTPS URLs in default browser
  function isHttpExternalUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }
  ipcMain.on(CORE_CHANNELS.OPEN_EXTERNAL_WINDOW, (event, arg) => {
    event.preventDefault();
    if (!isHttpExternalUrl(arg)) return;
    shell.openExternal(String(arg).trim());
  });
}

module.exports = { setupIpcHandlers, setupHostIpcHandlers };
