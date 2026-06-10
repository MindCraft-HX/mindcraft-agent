import { defineStore } from "pinia";
import router from "@/router"
import { useMitt } from "@/utils/mitt";
import { character_ws, multi_model_ws } from "@/socket"
const mitt = useMitt();

export const userInformation = defineStore("userInformation", {
  state: () => {
    return {
    userInformation:{
        user_id:"",  //用户id
        username:"", //用户名字
        email:"",    //邮箱
        nickname:"", //用户昵称
        avatar:"",   //头像
    },
  }
  },
  actions: {
    setUserInfo(userInfo){
      console.log(userInfo,'用户数据');
     this.userInformation = {...userInfo};
    //  console.log(this.userInformation,'用户数据');
    },
    logout() {
      // 获取所有键名
      const keys = Object.keys(localStorage);
      const reserve = ["identifier", "baseURL", "wsURL", "claudeTheme", "codexConfig"]
      keys.forEach((key) => {
        if (!reserve.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      mitt.emit('clearIntervalMail');
      router.push("/login");
      character_ws.disconnect()
      multi_model_ws.disconnect()
    }
  },
  // persist: {
  //   // paths: ['userInformation'],
  // },
});
