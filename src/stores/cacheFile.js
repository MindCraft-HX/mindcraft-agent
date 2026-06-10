import { defineStore } from "pinia";
import { deleteFileById, addData, getData } from "../utils/IndexedDB.js";

export const useCacheFileStore = defineStore("cachefile", {
  state: () => ({
    files: [], // 保存所有上传文件的数组
    cacheFile: [], // 缓存数组
  }),
  actions: {
    async init() {
      const data = await getData();
      if (data) {
        this.files = data;
        // console.log(data, "data>>>>>>>>>>>>>>..");
        // console.log(this.files, "this.files");
      }
    },
    async saveFilesToDB() {
      await addData(this.files);
    },
    async getDatass() {
      await getData();
    },
    // 保存文件   //*数据库************************************************************************************ */
    async addFile(id, name, content, path, type) {
      // 添加文件到数组
      this.files.push({
        id: id, // 假设每个文件对象都有一个唯一的ID
        name: name, // 文件名
        content: content, // 文件内容
        path: path, // 文件路径
        files_type: type, //文件类型
        shouldUpload: true, // 默认为true，表示需要上传
      });
      // console.log(this.files, "this.files>>>>>>缓存文件");
      await this.saveFilesToDB();
    },
    async removeFile(fileId) {
      // 根据文件ID删除文件
      this.files = this.files.filter((file) => file.id !== fileId);
      await deleteFileById(fileId);
    },
    toggleShouldUpload(fileId) {
      // 切换文件的上传状态
      const file = this.files.find((file) => file.id === fileId);
      if (file) {
        file.shouldUpload = !file.shouldUpload;
        // this.updateCacheFile();
      }
      console.log(this.files, "files");
      console.log(this.cacheFile, "cacheFile");
    },
    updateCacheFile() {
      // 假设您有某种逻辑来决定哪些文件应该在 cacheFile 中
      // 例如，您可能只想显示那些 shouldUpload 为 true 的文件
      this.cacheFile = this.files.filter((file) => file.shouldUpload);
      this.cacheFile = [...this.files];
    },
    toggleUpload(fileId) {
      // 切换文件的上传状态
      const file = this.cacheFile.find((file) => file.id === fileId);
      if (file) {
        file.shouldUpload = !file.shouldUpload;
      }
      // console.log(this.cacheFile, "files");
    },
    filterFileContents() {
      return this.files
        .filter((file) => file.shouldUpload)
        .map((file) => file.content);
    },
    // 缓存文件内容
    addCacheFile(id, name, content, path, type) {
      // 添加文件到数组
      this.cacheFile.push({
        id: id, // 假设每个文件对象都有一个唯一的ID
        name: name, // 文件名
        content: content, // 文件内容
        path: path, // 文件路径
        files_type: type, //文件类型
        shouldUpload: true, // 默认为true，表示需要上传
      });
      console.log(this.cacheFile, "this.cacheFile>>>>>>缓存文件");
    },
    // 删除缓存文件
    async removeCacheFile(fileId) {
      // 根据文件ID删除文件
      this.cacheFile = this.cacheFile.filter((file) => file.id !== fileId);
      await deleteFileById(fileId);
    },
    // 过滤出文件内容    //*数据库**************************************************************************** */
    filterCacheFileContents() {
      return this.cacheFile
        .filter((file) => file.shouldUpload) // 筛选 shouldUpload 为 true 的文件
        .map((file, index) => ({
          title: file.name, // 文件名作为标题
          file_data: file.content, // 文件内容
          Number: index + 1, // 文件编号，从1开始
        }));
    },
    // 过滤出所有id出来
    filterCacheFileID() {
      // return this.cacheFile.map(file => ({ id: file.id, shouldUpload: file.shouldUpload }));
      return this.cacheFile.map((file) => ({
        id: file.id,
        shouldUpload: file.shouldUpload,
      }));
    },
    // 传递id进来 然后过滤拿到对应文件
    filterCacheFile(jsonIds) {
      // 解析 JSON 字符串以获取文件信息数组
      const filesToUpdate = JSON.parse(jsonIds);

      // 遍历每个文件信息，并更新对应的文件对象
      filesToUpdate.forEach((fileInfo) => {
        // 查找 this.files 中对应的文件对象
        const file = this.files.find((f) => f.id === fileInfo.id);
        if (file) {
          // 更新文件对象的 shouldUpload 属性
          file.shouldUpload = fileInfo.shouldUpload;
        }
      });
      this.cacheFile = this.files.filter((file) =>
        filesToUpdate.some((f) => f.id === file.id)
      );
    },
    // 清空
    clearCacheFile() {
      this.cacheFile = [];
    },
  },
  // persist: {
  //   paths: ["files"],
  // },
});
