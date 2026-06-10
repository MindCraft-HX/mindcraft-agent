const { app, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const compressing = require("compressing");
const { exec } = require("child_process");

const { execFile } = require("child_process");
const xml2js = require("xml2js");
const CryptoJS = require("crypto-js");
const fsExtra = require("fs-extra");
const os = require('os');
const { Conf } = require('electron-conf')
const iconv = require('iconv-lite');
const { openMdWin } = require('../mdWindow')
const { openDocumentCandidate, resolveCandidatePath } = require('./documentLocator')


function setupIpcHandlers(env, platform) {
  // 返回文件路径
  ipcMain.handle("open-file-dialog", async (event, option) => {
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
  ipcMain.handle('select-and-read-file',async (event,options)=>{
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
  ipcMain.handle('read-file-by-path', async (event, filePath) => {
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

  ipcMain.handle("read-file-sync", async (event, path) => {
    const fileContent = fs.readFileSync(path, "utf8");
    return fileContent;
  });

  ipcMain.handle("write-file-sync", async (event, path, data) => {
    fs.writeFileSync(path, data);
  });
  ipcMain.handle("unlink-file-sync", async (event, path) => {
    fs.unlinkSync(path);
  });
  ipcMain.handle("rmdir-sync", async (event, folderPath) => {
    fs.rmdirSync(folderPath, { recursive: true });
  });
  ipcMain.handle("exists-file-sync", async (event, path) => {
    return fs.existsSync(path);
  });
  ipcMain.handle("mkdir-sync", async (event, path) => {
    fs.mkdirSync(path, { recursive: true });
  });
  ipcMain.handle("copy-file-sync", async (event, srcPath, targetPath) => {
    fs.copyFileSync(srcPath, targetPath);
  });
  ipcMain.handle("rename-file-sync", async (event, oldPath, newPath) => {
    fs.renameSync(oldPath, newPath);
  });
  ipcMain.handle("read-dir-Sync", async (event, dir) => {
    return fs.readdirSync(dir, { withFileTypes: true });
  });
  ipcMain.handle(
    "unCompress-zip-file",
    async (event, file, unZipPath, zipFileNameEncoding) => {
      return await compressing.zip.uncompress(file, unZipPath, {
        zipFileNameEncoding: zipFileNameEncoding,
      });
    }
  );
  ipcMain.handle(
    "exec-keil-cmd",
    async (event, compilerPath, projectPath, dir) => {
      const cmd = `\"${compilerPath}\" -b \"${projectPath}\" -j0`;
      console.log("cmd", cmd);
      const outPath = path.join(dir, "out");

      const process = exec(cmd, { cwd: dir });

      return new Promise((resolve, reject) => {
        process.stdout.on("data", (data) => {
          console.log("stdout", data);
        });

        process.stderr.on("data", (data) => {
          console.log("stderr", data);
        });

        process.on("close", (code) => {
          if (code > 1) {
            resolve({
              status: 1,
              outPath,
              msg: `字库lib文件, 编译出现错误, code: ${code}.`,
            });
            // reject({ status: 1, outPath, msg: `字库lib文件, 编译出现错误, code: ${code}.` });
          } else {
            resolve({ status: 0, outPath, msg: `字库lib文件, 编译成功。` });
          }
        });
      });
    }
  );

  //BUG:把exec独立放在lib.js里有问题
  ipcMain.handle("exec-cmd", async (event, cmd, dir) => {
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

  ipcMain.handle("exec-gcc-cmd", async (event, cmd, dir)  => {
    const proc = exec(cmd, { cwd: dir })
    return new Promise((resolve) => {
      proc.on('close', (code) => {
        if (code) {
          resolve({ status: 1, msg: `gcc编译出现错误, code: ${code}.` })
        } else {
          resolve({ status: 0, msg: 'gcc编译成功。' })
        }
      })
    })
  });

  ipcMain.handle("exec-iar-cmd", async (event, compilerPath, projectPath, configName, dir) => {
    const cmd = `\"${compilerPath}\" \"${projectPath}\" -build ${configName}`;
    const proc = exec(cmd, { cwd: dir })
    return new Promise((resolve) => {
      proc.on('close', (code) => {
        if (code) {
          resolve({ status: 1, msg: `IAR编译出现错误, code: ${code}.` })
        } else {
          resolve({ status: 0, msg: 'IAR编译成功。' })
        }
      })
    })
  });

  // 打开文件夹
  ipcMain.handle("open-folder", async (event, folderPath) => {
    shell.openPath(folderPath);
  });

  ipcMain.handle("open-file-with-default", async (_event, filePath) => {
    if (!filePath) return "missing-file-path";
    return shell.openPath(filePath);
  });

  ipcMain.handle('resolve-document-candidate', async (_event, payload = {}) => {
    return resolveCandidatePath(payload)
  })

  ipcMain.handle('open-document-candidate', async (_event, payload = {}) => {
    return openDocumentCandidate({
      ...payload,
      openMdPayload: async (docPayload) => {
        const initUrl = path.join(__dirname, '..', '..', 'dist', 'index.html')
        openMdWin({ initUrl, env, payload: docPayload })
      },
      openWithDefault: async (filePath) => shell.openPath(filePath),
    })
  })

  ipcMain.on("start-exe", (event) => {
    // const exePath = path.join(__dirname, "../vendors/Release", "FontLab.exe"); //本地

    const exePath = path.join(
      process.resourcesPath,
      "vendors",
      "Release",
      "FontLab.exe"
    );

    const options = {
      cwd: path.join(process.resourcesPath, "vendors", "Release"), // 设置当前工作目录
      env: {
        ...process.env,
        CUSTOM_ENV_VAR: "value",
      },
    };

    execFile(exePath, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`启动错误: ${error}`);
        return;
      }
      console.log(`启动输出: ${stdout}`);
    });
  });

  //解密
  function decryptAES(encryptedText, key, iv) {
    const bytes = CryptoJS.AES.decrypt(
      encryptedText,
      CryptoJS.enc.Utf8.parse(key),
      {
        iv: CryptoJS.enc.Utf8.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // 加密
  function encryptAES(text, key, iv) {
    const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(key), {
      iv: CryptoJS.enc.Utf8.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  }

  //解密
  ipcMain.handle("read-xml-file", async () => {
    try {
      // 使用相对路径

      // const xmlPath = path.join(__dirname, "../../History", "userInfo.xml"); //本地

      const installPath = path.join(
        process.resourcesPath,
        "vendors",
        "Release"
      );
      const xmlPath = path.join(installPath, "History", "userInfo.xml");
      console.log("XML file path:", xmlPath); // 打印文件路径以进行调试
      if (!fs.existsSync(xmlPath)) {
        throw new Error("File not found");
      }
      const xmlContent = fs.readFileSync(xmlPath, "utf-8");

      // 解析 XML 内容
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlContent);

      const key = "q2mWF2DveOBDylv8"; // AES 密钥
      const iv = "RWJIrqHvWMS4YxQx"; // 初始化向量

      const decryptedData = result.root.node.map((node) => {
        const decryptedKey = decryptAES(node.$.key, key, iv);
        const decryptedValue = decryptAES(node._, key, iv);
        return { [decryptedKey]: decryptedValue };
      });

      return decryptedData;
    } catch (error) {
      console.error("Error reading XML file:", error);
      throw error;
    }
  });

  //更新内容 然后经行加密
  ipcMain.handle("update-xml-file", async (event, updatedData) => {
    try {
      // const xmlPath = path.join(__dirname, "../../History", "userInfo.xml"); //本地

      const installPath = path.join(
        process.resourcesPath,
        "vendors",
        "Release"
      );
      const xmlPath = path.join(installPath, "History", "userInfo.xml");

      console.log("XML file path:", xmlPath); // 打印文件路径以进行调试
      if (!fs.existsSync(xmlPath)) {
        throw new Error("File not found");
      }

      const key = "q2mWF2DveOBDylv8"; // AES 密钥
      const iv = "RWJIrqHvWMS4YxQx"; // 初始化向量

      const builder = new xml2js.Builder();
      const encryptedData = updatedData.map((item) => {
        const encryptedKey = encryptAES(Object.keys(item)[0], key, iv);
        const encryptedValue = encryptAES(Object.values(item)[0], key, iv);
        return { $: { key: encryptedKey }, _: encryptedValue };
      });

      const xmlContent = builder.buildObject({ root: { node: encryptedData } });
      fs.writeFileSync(xmlPath, xmlContent, "utf-8");
      return { success: true };
    } catch (error) {
      console.error("Error updating XML file:", error);
      throw error;
    }
  });

  //判断有没有文件在
  ipcMain.on("check-folder", (event) => {
    // const folderPath = path.join(__dirname, "../../History"); //本地

    const installPath = path.join(process.resourcesPath, "vendors", "Release");
    const folderPath = path.join(installPath, "History");
    const filePath = path.join(folderPath, "userInfo.xml");
    fsExtra
      .pathExists(folderPath)
      .then((exists) => {
        // event.reply("folder-status", exists ? "文件夹存在" : "文件夹不存在");
        if (!exists) {
          // 创建文件夹
          return fsExtra
            .mkdir(folderPath)
            .then(() => {
              // 创建 userInfo.xml 文件
              return fsExtra.writeFile(filePath, "<root></root>");
            })
            .then(() => {
              event.reply("folder-status", "文件夹和文件已创建");
            });
        } else {
          event.reply("folder-status", "文件夹存在");
        }
      })
      .catch((err) => {
        console.error(err);
        event.reply("folder-status", "检查文件夹时出错");
      });
  });

  // 解压 zip 文件

  ipcMain.handle("add-source-by-download-Link", async (event, options) => {
    try {
      const { fileUrl, model } = options
      const fileName = model + new Date().getTime() + path.extname(fileUrl.replace(/\?.*$/, ''));

      const userDataPath = app.getPath('userData');
      const sourceDir = path.join(userDataPath, 'VideoGenerationSource');
      if(!fs.existsSync(sourceDir)){
        fs.mkdirSync(sourceDir);
      }
      const savePath = path.join(sourceDir, fileName);
      console.log('缓存到',savePath);

      const response = await axios({
        url: fileUrl,
        responseType: "stream",
      });

      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
          writer.on("finish", () => resolve({savePath, fileName}));
          writer.on("error", reject);
      });
    } catch (error) {
      console.error("Error downloading image:", error);
      throw error;
    }
  })
  ipcMain.handle("add-source-by-base64", async (event, options) => {
    try {
      const { base64File, model } = options
      const fileName = model + new Date().getTime() +'.'+ base64File.split(';')[0].split('/')[1];
      const userDataPath = app.getPath('userData');
      const sourceDir = path.join(userDataPath, 'VideoGenerationSource');
      if(!fs.existsSync(sourceDir)){
        fs.mkdirSync(sourceDir);
      }
      const savePath = path.join(sourceDir, fileName);
      // 将 base64 数据解码为二进制数据
      const base64Data = base64File.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const writer = fs.createWriteStream(savePath);
      writer.write(buffer);
      writer.end();
      return new Promise((resolve, reject) => {
          writer.on("finish", () => resolve({savePath, fileName}));
          writer.on("error", reject);
      });
    } catch (error) {
      console.error("Error saving image from base64:", error);
      throw error;
    }
  })
  ipcMain.handle("add-source-by-upload", async (event, options) => {
    try {
      const { filePath, model } = options; // 从渲染进程获取本地文件路径
      const cleanPath = filePath.replace(/\?.*$/, ''); 
      const fileExt = path.extname(cleanPath);
      const fileName = `${model}_${Date.now()}${fileExt}`;
      const userDataPath = app.getPath('userData');
      const sourceDir = path.join(userDataPath, 'VideoGenerationSource');
      // 确保缓存目录存在
      if(!fs.existsSync(sourceDir)){
        fs.mkdirSync(sourceDir);
      }
      
      const savePath = path.join(sourceDir, fileName);
     // 使用 pipe 方法
    const reader = fs.createReadStream(cleanPath);
    const writer = fs.createWriteStream(savePath);
    
    return new Promise((resolve, reject) => {
      reader.pipe(writer)
        .on('finish', () => resolve({ savePath, fileName }))
        .on('error', reject);
    });
    } catch (error) {
      console.error("Error caching file:", error);
      throw error;
    }
  });

  ipcMain.on("copy-source-from-path-to-path", async (event, sourcePath) => {
    try {
      dialog.showSaveDialog({
        defaultPath: sourcePath,
        title: "保存到",
        properties: ['openDirectory']
      }).then(result => {
        if (result.canceled) {
          return
        }
        // const { sourcePath, targetPath } = pathInfo;
        fsExtra.copy(sourcePath, result.filePath);
      })
    } catch (error) {
      console.error("Error copy file:", error);
      throw error;
    }
  })

  ipcMain.handle("get-source-list-by-file-path", async (event, info) => {
    try {
      const userDataPath = app.getPath('userData');
      const sourceDir = path.join(userDataPath, 'VideoGenerationSource');
      if(!fs.existsSync(sourceDir)){
        fs.mkdirSync(sourceDir);
      }
      const files = await fsExtra.readdir(sourceDir);
      const conf = new Conf();
      const list = (conf.get("videoGenerationSourceList")) || [];
      conf.set("videoGenerationSourceList", list.filter(item => files.some(file => file === item.fileName)));
        // 获取每个文件的详细信息
      const filesWithStats = files.map((file) => {
        // 使用 file-type 库判断文件类型
        const filePath = path.join(sourceDir, file);
        const stats = fs.statSync(filePath);
        const sourceInfo = list.find(item => item.fileName === file) || {};
        // console.log('sourceInfo',sourceInfo, list, file);
        return {
          ...sourceInfo,
          file: path.join(sourceDir, encodeURI(file)),
          fileName: file,
          fileDir: sourceDir,
          mtime: stats.mtime, // 获取文件的修改时间
        };
      });
      // 按照修改时间排序
      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      // 返回排序后的文件名列表
      return filesWithStats;
      // return files.map(file => path.join(sourceDir, file))
      ;
    } catch (error) {
      console.error("Error reading directory:", error);
      throw error;
    }
  })

  ipcMain.handle("delete-source-by-file-path", async (event, file) => {
    try {
      const sourceDir = path.join(file);
      console.log('删除',sourceDir);
      if (fs.existsSync(sourceDir)) {
        await fsExtra.remove(sourceDir)
      }
    } catch (error) {
      console.error("Error delete:", error);
      throw error;
    }
  })

  ipcMain.handle("get-encoding-list", async (event, info) => {
    return new Promise(async(resolve, reject) => {
      try {
        const value = await iconv[info.fn](info.data, info.type);
        resolve(value)
      } catch (error) {
        reject(error)
      }
    })
  })
  const { openDrawWin } = require("../openDrawWin")
  ipcMain.on("open-draw-win", (event) => {
    openDrawWin()
  })

  ipcMain.handle("add-character-media-by-download-Link", async (event, options) => {
    try {
      const { fileUrl, type, time } = options
      const fileName = time + path.extname(fileUrl.replace(/\?.*$/, ''));

      const userDataPath = app.getPath('userData');
      const sourceDir = path.join(userDataPath, 'characterSource');
      const sourceTypeDir = path.join(sourceDir, type);
      if(!fs.existsSync(sourceDir)){
        fs.mkdirSync(sourceDir);
      }
      if(!fs.existsSync(sourceTypeDir)){
        fs.mkdirSync(sourceTypeDir);
      }
      const savePath = path.join(sourceTypeDir, fileName);
      // console.log('缓存到',savePath);

      const response = await axios({
        url: fileUrl,
        responseType: "stream",
      });
      response.data.on('error', err => {
        writer.close();
        fs.unlinkSync(savePath); // 删除不完整文件
      });      

      const writer = fs.createWriteStream(savePath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
          writer.on("finish", () => resolve({savePath, fileName}));
          writer.on("error", reject);
      });
    } catch (error) {
      console.error("Error downloading image:", error);
    }
  })

  ipcMain.handle("get-character-media-list-by-file-path", async (event, info) => {
    return new Promise(async (resolve, reject) => {
      try {
        const userDataPath = app.getPath('userData');
        const sourceDir = path.join(userDataPath, 'characterSource');
        if(!fs.existsSync(sourceDir)){
          fs.mkdirSync(sourceDir);
        }
        const filesWithStats = []
        try {
          const files = await fsExtra.readdir(sourceDir);
          for (let index = 0; index < files.length; index++) {
            const file = files[index];
            const filePath = path.join(sourceDir, file);
            let stats;
            try {
              stats = await fs.promises.stat(filePath);
            }catch (error) {
              console.error(`无法获取目录状态1 ${filePath}:`, error);
              continue;
            }
            if(stats.isDirectory()) {
              const sourcePath = path.join(sourceDir, file);
              let filesNext;
              try {
                filesNext = await fsExtra.readdir(sourcePath);
              } catch (error) {
                console.error(`无法读取目录 ${sourcePath}:`, error);
                continue;
              }
              const sourceList = []
              for (let index = 0; index < filesNext.length; index++) {
                const source = filesNext[index];
                const fileSourcePath = path.join(sourcePath, source);
                let statsSource;
                try {
                  statsSource = await fs.promises.stat(fileSourcePath);
                }catch (error) {
                  console.error(`无法获取目录状态2 ${fileSourcePath}:`, error);
                  continue;
                }
                if(statsSource.isFile()) {
                  sourceList.push({savePath: fileSourcePath, fileName: source})
                }
              }
              filesWithStats.push({[file]: sourceList})
            }
          }
        } catch (error) {
          console.error("Error reading directory1:",error);
        }
        // console.log('filesWithStats', filesWithStats);
        // 返回排序后的文件名列表
        resolve(filesWithStats)
      } catch (error) {
        console.error("Error reading directory:", error);
        reject(error)
      }
    })
  })

  ipcMain.on("remove-character-media", async (event) => {
    try {
      const userDataPath = app.getPath('userData');
      const sourceDir = path.join(userDataPath, 'characterSource');
      // await fsExtra.emptyDir(sourceDir);
       // 先检查目录是否存在
      if (fs.existsSync(sourceDir)) {
        await fsExtra.remove(sourceDir); // 递归删除整个目录
      }
    } catch (error) {
      console.log("删除失败", error)
    }
  })
}

module.exports = { setupIpcHandlers };
