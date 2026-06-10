import { defineStore } from "pinia";

export const userInstructionContentStore = defineStore("Instructioncontent", {
  state: () => {
    return {
      content:"",
  }
  },
  actions: {
    setContent(val){
     this.content = val;
    //  console.log(this.content,'指令内容');
    },
  },
  // persist: {
  //   // paths: ['wechat_username'],
  // },
});
