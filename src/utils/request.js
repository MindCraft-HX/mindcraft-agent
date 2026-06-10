import axios from "axios";
import { ElMessage, ElMessageBox, ElLoading } from "element-plus";
import router from "@/router";
import { ref } from 'vue';
import { useMitt } from "@/utils/mitt.js";
const mitt = useMitt();


let loadingInstance; // 用于保存Loading实例
let cancel; // 用于保存取消令牌


//定义服务器地址
// const serverURL = 'https://api.gaotongfont.cn/'   //生产  
// const serverURL = "http://192.168.1.128:10001/"   //线下
// const devURL = "http://localhost:8000/";         //本地


// 现在生产 //http://106.13.10.232:10001
// https://gray-api.gaotongfont.cn/
// https://text-api.gaotongfont.cn   支付
// http://192.168.1.128:10002/
// 灰度 https://gray-api.gaotongfont.cn/

const NODE_ENV = window.VITE_NODE_ENV || import.meta.env.VITE_NODE_ENV;
let url = 'https://api.mindcraft.com.cn/'; 
if(NODE_ENV === 'development' || NODE_ENV === 'testing'){
    url = localStorage.getItem("baseURL") || 'https://grayapi.mindcraft.com.cn/';
}
export const baseURL = ref(url)

  const service = axios.create({
    // baseURL: devURL,
    // baseURL: baseURL.value,
    timeout: 3600000,
  });

// 请求拦截器
service.interceptors.request.use(
  async (config) => {
    // 可以再这里设置加载样式
    if(NODE_ENV === 'development' || NODE_ENV === 'testing'){
      baseURL.value = localStorage.getItem("baseURL") || baseURL.value;
    }

    const excludedUrlsInRequest = [
      "llm/login/",
      "llm/register/",
      "llm/send_email_code/",
      "llm/verify_email_code/",
      "llm/reset_password/",
      "llm/call_llm_stream",
    ];
    // 过滤不需要显示数组 Loading的请求
    // const filterGetRequest = "/llm/recharge_points";
    const filterRequest = ["/v1/data/spotup_window_language/","/v1/agent/spotup_window/","/llm/model_list/","/llm/chat/","/llm/get_user_profile/","/llm/recharge_points","/llm/recharge_points/","/llm/generate/","cos-presigned-url/","/llm/chat_new/","/llm/alert/?alert_is_read=false","/llm/login/web_weixin/","/llm/chat/agent/","/v1/ttv/","/v1/tts/","/v1/tti/","/v1/llm/","/v1/asr/","/v1/music_generations/artistic/","/llm/bing_web/"];
    const filterGetRequest = ["/llm/recharge_points","llm/room_list/", "/v1/ttv/task/"]
    const getCanLoading = !filterGetRequest.some(item => config.url.includes(item))
    const data = config?.data || {};
    // config.method.toLowerCase() === 'get' && config.url === filterRequest
    // !(config.method.toLowerCase() === 'get' && config.url.includes(filterGetRequest))
    if (!filterRequest.includes(config.url) && !(config.method.toLowerCase() === 'get' && !getCanLoading) && !data?.noLoading) {
      loadingInstance = ElLoading.service({ fullscreen: true, text: '加载中...', }); // 显示全屏 Loading background: 'rgba(0, 0, 0, 0.7)',
    };

    const globalParams = {
      platform: "exe",
      os: window.VITE_NODE_PLATFORM == "IOS" ? "Mac" : "Win"
    }
    config.params = {
      ...globalParams,
      ...config.params
    }



    // 从本地存储中获取访问令牌
    const access_token = localStorage.getItem("access_token");
    if (access_token && !excludedUrlsInRequest.includes(config.url)) {
      // 添加用户信息到请求头
      config.headers["Authorization"] = `Bearer ${access_token}`;

      // 在请求中添加取消令牌
      config.cancelToken = new axios.CancelToken(function executor(c) {
        cancel = c;
      });

    }
    
    config.baseURL = baseURL.value;  //实例修改服务器地址

    return config;
  },
  (error) => {
    loadingInstance?.close(); // 关闭 Loading
    return Promise.reject(error);
  }
);
// 响应拦截器
service.interceptors.response.use(
  (response) => {

    setTimeout(() => {
      loadingInstance?.close();
    }, 200);

    return response
  },
  async (error) => {

    setTimeout(() => {
      loadingInstance?.close();
    }, 200);


    if (error.response && ( error.response.status === 401 || error.response.xhr)) {
      try {
        // Token失效，清除本地存储的Token值并获取新的访问令牌
        localStorage.removeItem("access_token");
        await getAccessToken();
        console.log("重新获取访问令牌");
        // 重新发送之前的请求
        return service(error.config);
      } catch (refreshError) {
        console.log(refreshError);
        // 获取新令牌失败，清除旧令牌并刷新
        ElMessage.error("登录已过期，请重新登录");
        console.log("刷新令牌失效");
        window.location.reload();
      }
    } else {
      // 对于非401错误，显示错误信息
      console.error(error);
      if (error.response && ( error.response.status === 406)) {
        ElMessage.error("请求失败：积分不足");
      }
    }

    return Promise.reject(error);
  }
);

// 请求获取access_token, 'get_access_token/'
const getAccessToken = async () => {
  const refresh_token = localStorage.getItem("refresh_token");
  try {
    const response = await service.post("llm/get_access_token/", {
      refresh_token: refresh_token,
    });
    // 将获取到的新的access_token存储到本地
    localStorage.setItem("access_token", response.data.access_token);

    // 更新最后一次http请求的时间戳
    // updateLastHttpRequestTimestamp();

    return Promise.resolve();
  } catch (error) {
    console.log(error);
    return Promise.reject(error);
  }
};


// 取消请求函数
export const cancelRequest = () => {
  // 取消请求
  if (cancel) {
    cancel('检测到您切换房间，已取消了上一个房间的问答');
  }
  //关闭loading
  if (loadingInstance) {
    loadingInstance?.close();
  }
}


export default service;
