import { defineStore } from "pinia";

export const useUploadFilePathStore = defineStore("uploadfilepath", {
  state: () => {
    return {
      file_path: "",
      file_path_name:"",
    };
  },
  actions: {
    setFilePath(val){
        this.file_path = val;
        // console.log(this.file_path,'上传回显路径');
    },
    deleteFilePath(){
        this.file_path = "";
        // console.log(this.file_path,'上传删除回显路径');
    },
    setFilePathName(val){
        this.file_path_name = val;
        // console.log(this.file_path_name,'上传回显路径名');
    },
    deleteFilePathName(){
        this.file_path_name = "";
        // console.log(this.file_path_name,'上传删除回显路径名');
    }
  },
});