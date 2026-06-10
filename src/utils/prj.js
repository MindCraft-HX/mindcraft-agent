import storage from "./localStorage";
import encrypt from "./encrypt";

var joint = {

    openFileDialog: async(option) => {
        return await window.electronAPI.openFileDialog(option);
    },
    readFileSync: async (filePath)=> {
        return window.electronAPI.readFileSync(filePath);
    },
    writeFileSync: async(path, buffer) => {
        await window.electronAPI.writeFileSync(path, buffer);
    },
    unlinkFileSync: async(path) => {
        await window.electronAPI.unlinkFileSync(path);
    },
    rmdirSync: async(folderPath) => {
        await window.electronAPI.rmdirSync(folderPath);
    },
    existsSync: async(folder) => {
        return await window.electronAPI.existsSync(folder);
    },
    mkdirSync: async(folder) => {
        await window.electronAPI.mkdirSync(folder);
    },
    copyFileSync: async(srcPath, targetPath) => {
        await window.electronAPI.copyFileSync(srcPath, targetPath);
    },
    renameSync: async(oldPath, newPath) => {
        await window.electronAPI.renameSync(oldPath, newPath);
    },
    readdirSync: async(dir) => {
        return await window.electronAPI.readdirSync(dir);
    },
    createBuffer: async(data) => {
        return await window.electronAPI.createBuffer(data);
    },
    BufferConvert: async(data, format, toFormat) => {
        return await await window.electronAPI.Buffer(data, format, toFormat)
    },
    join: async(prefix, suffix) => {
        return await window.electronAPI.pathJoin(prefix, suffix);
    },
    /**
     * 根据当前路径, 进行文件夹的移动
     * @param {string} root The path of pwd
     * @param {string} handler Such as: '..', '../../'
     * @returns
    */
   getRelativePath: async(root, handler) => {
       return await window.electronAPI.pathResolve(root, handler);
    },
    //获取扩展名
    getExtname: async(p) => {
        return await window.electronAPI.pathExtname(p);
    },

    /**
     * convert to relative path
     * Such as: /home/user/project/test/api/foo.c
     * 	fullPath: /home/user/project/test/api/foo.c
     * 	rootPath: /home/user/project
     * @param {string} fullPath The full path of the object
     * @param {string} rootPath The root path of the project
     * @returns resolve path by '.' begin; such as: ./test/api/foo.c
    */
   convertRelativePath(fullPath, rootPath) {
       if (0 == fullPath.indexOf(".")) {
           return fullPath;
        }

        if (fullPath.length < rootPath.length) {
            return fullPath;
        }

        for (var i = 0; i < rootPath.length; i++) {
            if (fullPath[i] != rootPath[i]) {
                return fullPath;
            }
        }
        return "." + fullPath.substring(i);
    },

    /**
     * 获取系统的temp目录
     * @returns %USERPROFILE%\AppData\Local\Temp or /tmp
     */
    getSysTmpDir: async() => {
        return await window.electronAPI.getSystmpPath();
    },
    /**
     * 临时文件夹
     * @returns {string} C:\Users\<username>\AppData\Local\Temp\
     */
    getTempPath: async function() {
        var str = storage.load(storage.getKeys().tempBuildingProjectPath);
        if (!await this.existsSync(str)) {
            str = null;
        }
        if (!str) {
            const timestamp = new Date().toDateString();
            const dirName = await encrypt.enUtf8Base64(timestamp.toString());
            str = await this.getRelativePath(await this.getSysTmpDir(), dirName);
            storage.save(storage.getKeys().tempBuildingProjectPath, str);
        }
        if (!await this.existsSync(str)) {
            await this.mkdirSync(str);
        }
        // console.log(`getTempPath: ${str}`);
        return str;
    },
    existsTempFolderSync: async function() {
        const str = storage.load(storage.getKeys().tempBuildingProjectPath);
        return await this.existsSync(str);
    },
    deleteTempPath: async function() {
        const tempPath = await this.getTempPath();
        if (await this.existsSync(tempPath)) {
           await this.rmdirSync(tempPath);
        }
        // console.log(`删除临时路径${tempPath}`);
    },
    generateDataSheetDesc: async function(path) {
        var context = `请联系相关业务人员获取相关规格书，联系电话：0755-83453881。`
        var filePath = await this.join(path, "关于规格书获取说明.txt");
        await this.writeFileSync(filePath, context);
    },

}

export default joint;