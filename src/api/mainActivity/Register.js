import api from "@/utils/request";

// 注册
export const postRegister = (data)=>{
    return api.post(`llm/register/`,data)
};
// 发送验证码
export const postEmailCode = (data)=>{
    return api.post(`llm/send_email_code/`,data)
};
// 校验验证码
export const postVerifyEmail = (data)=>{
    return api.post(`llm/verify_email_code/`,data)
}
// 找回密码
export const postResetPassword = (data)=>{
    return api.post(`llm/reset_password/`,data)
}

//获取验证码 
export const postGetCode = (data)=>{
    return api.post(`/llm/verify_code/`,data)
}
//发送验证码 图片显示
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