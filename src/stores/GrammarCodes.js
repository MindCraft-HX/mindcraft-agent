// 使用Pinia定义一个store
import { defineStore } from 'pinia';
export const useGrammarCodesStore = defineStore('grammarcodes', {
  state: () => ({
    mermaidGrammar: ``, // 文件路径和内容的映射关系
  }),
  actions: {
    setMermaidGrammar(val) {
        this.mermaidGrammar = val;
        console.log(this.mermaidGrammar,'this.mermaidGrammar');
    },
  },
  // persist: {
  //   // paths: [''],
  // },
});