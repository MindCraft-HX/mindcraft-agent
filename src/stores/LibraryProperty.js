import { defineStore } from "pinia";

export const useLibraryPropertyStore = defineStore("libraryProperty", {
  state: () => {
    return {
      libraryID: "", // 选中的id
      Top_K: 8,
    };
  },
  actions: {
    setLibraryID(id) {
      this.libraryID = id;
      // console.log(this.libraryID,'libraryID-Pinia');
    },
    deleteLibraryID() {
      this.libraryID = "";
      // console.log(this.libraryID,'清空libraryID-Pinia');
    },
    setTop_K(Top_K) {
      this.Top_K = Top_K;
    },
    deleteTop_K() {
      this.Top_K = 8;
    },
    deleteAll(){
      this.libraryID = "";
      this.Top_K = 8;
    }

  },
  persist: {
    paths: ['libraryID','Top_K'],
  },
});
