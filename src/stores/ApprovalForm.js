import { defineStore } from "pinia";

export const userApprovalFormStore = defineStore("approvalform", {
  state: () => {
    return {
     fontlibraryList:[],
  }
  },
  actions: {
    setFontlibraryList(obj){
     this.fontlibraryList = obj;
    //  console.log(this.fontlibraryList,'this.fontlibraryList整个数组');
    },
  },
  persist: {
    paths: ['fontlibraryList'],
  },
});
