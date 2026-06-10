import { defineStore } from "pinia";

export const usePromptPropertyNameStore = defineStore("promptPropertyName", {
  state: () => {
    return {
      promptName: "",
    };
  },
  actions: {
    setPromptName(name){
      this.promptName = name;
      // console.log(this.promptName,"this.promptName");
    },
    setDelPromptName(){
      this.promptName ="";
    }
  },
});
