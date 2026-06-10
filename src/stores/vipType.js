import { defineStore } from "pinia";

export const userVipTypeStore = defineStore("viptype", {
  state: () => {
    return {
        vip_level:null,
        privilege:null,
  }
  },
  actions: {
    setFontlibraryList(id){
     this.vip_level = id;
    //  console.log(this.vip_level,'vip_level99');
    },
    setPrivilege(val){
     this.privilege = val;
    //  console.log(this.privilege,'privilege>>>>>>>>>>>');
    }
  },
  persist: {
    paths: ['vip_level','privilege'],
  },
});
