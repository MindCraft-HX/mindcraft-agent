import { defineStore } from "pinia";

export const userCommandParameterStore = defineStore("commandparameter", {
  state: () => {
    return {
      temperature:null,
  }
  },
  actions: {
    setTemperaturePatchList(val){
     this.temperature = val;
     console.log(this.temperature,'this.temperature');
    },
    deleteTemperaturePatchList(){
      this.temperature = null;
    }
  },
  // persist: {
  //   paths: ['temperature'],
  // },
});
