import { defineStore } from "pinia";

export const useLibraryPropertyNameStore = defineStore("libraryPropertyName", {
  state: () => {
    return {
        libraryName: "",
    };
  },
  actions: {
    setLibraryName(name) {
      this.libraryName = name;
      // console.log(this.libraryName,'libraryName');
    },
    setDelLibraryName(){
      this.libraryName = ""
    },
  },
});