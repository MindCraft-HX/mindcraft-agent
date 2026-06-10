// 使用Pinia定义一个store
import { defineStore } from 'pinia';
export const useSaveFileStore = defineStore('savefile', {
  state: () => ({
    files: {} // 文件路径和内容的映射关系
  }),
  actions: {
    saveToFile(filePath, content) {
      this.files[filePath] = content;
      // console.log('Saved to file:', this.files);
    },
  },
  persist: {
    paths: ['files'],
  },
});