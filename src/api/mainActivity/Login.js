import api from "@/utils/request";

// 发送登录请求
export const Login = (data)=>{
    return api.post("llm/login/",data);
};

/** 微信登录
 * {{host}}/llm/login/web_weixin/
 */

export const WeChatLogin = (data)=>{
    return api.post("/llm/login/web_weixin/",data);
}

/** 
 *  获取验证码
 *  /llm/send_code/
 */
export const postSendCode = (data)=>{
    return api.post(`/llm/send_code/`,data)
}

/** 
 *  新图片验证码
 *  /llm/send_code_image/
 */
export const postSendCodeImage = (data)=>{
  return api.post(`/llm/send_code_image/`,data)
}