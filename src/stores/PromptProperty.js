import { defineStore } from "pinia";

export const usePromptPropertyStore = defineStore("promptProperty", {
  state: () => {
    return {
      promptId: "",
    };
  },
  actions: {
    setPromptId(id){
      this.promptId = id;
      // console.log(this.promptId,"promptIdID-Pinia");
    },
    deletePromptId(){
      this.promptId = "";
      // console.log(this.promptId,"清空promptIdID-Pinia");
    }
  },
  persist: {
    paths: ['promptId'],
  },
});
