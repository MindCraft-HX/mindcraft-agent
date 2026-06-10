import { defineStore } from "pinia";

export const useUploadFileStore = defineStore("uploadFile", {
  state: () => {
    return {
      fileToSting: "", //转文件内容的字符串
      fileList: [],
      // file_path: "",
    };
  },
  actions: {
    getfileToSting(val) {
        this.fileToSting = val;
        // console.log(this.fileToSting,'字符串有没有拿倒手');
    },
    getfileList(val) {
        this.fileList = val;
        // console.log(this.fileList,'看看数组有没有拿到手');
    },
    setFileList(){
        this.fileList = [];
        this.fileToSting="";
        // console.log( this.fileList,'Piain清空了');
    },
    // setFilePath(val){
    //     this.file_path = val;
    //     console.log(this.file_path,'上传文件拿到路径');
    // },
    // deleteFilePath(){
    //     this.file_path = "";
    //     console.log(this.file_path,'清空上传文件的路径');
    // }
  },
});
